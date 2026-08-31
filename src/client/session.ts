import type { ClientOptions, QueryOptions, QueryResult } from '../types/index.js';
import type {
  ForkSessionOptions,
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  GetSubagentMessagesOptions,
  ListSubagentsOptions,
  SessionInfo,
  SessionMessage,
  SessionMutationOptions,
  SessionOptions,
} from '../types/session.js';
import type { ExecuteOptions, IExecutor } from '../executor/interface.js';
import { SdkExecutor } from '../executor/sdk-executor.js';
import { toSdkExecutorOptions } from './sdk-options.js';
import { buildArgs, mergeOptions, resolveEnv } from '../builder/args-builder.js';
import { validateQueryOptions, validatePrompt } from '../utils/validation.js';
import { ValidationError } from '../errors/errors.js';
import { FORMAT_JSON, FORMAT_STREAM_JSON, EVENT_RESULT } from '../constants.js';
import { StreamHandle } from './stream-handle.js';

/**
 * A stateful conversation session.
 *
 * Sessions wrap the Claude Code `--continue` / `--resume` mechanism to
 * provide multi-turn conversations with persistent context.
 *
 * ## Lifecycle
 *
 * 1. **First query**: runs normally, captures the `sessionId` from the result.
 * 2. **Subsequent queries**: automatically pass `--resume <sessionId>` to continue
 *    the conversation with full context.
 *
 * ## Identity
 *
 * `resume` picks up an existing transcript, `continue` picks up the most recent
 * one in `cwd`, and `sessionId` pins the id of the session about to be created —
 * so it is readable before the first query returns. All three are CLI-mode
 * mechanics: in SDK mode the persistent session is opened by the client, and a
 * session-level request that the client was not built with is reported as inert
 * rather than silently ignored. {@link Session.fork} is the one exception — it
 * opens an SDK session of its own for the branch, because a fork that ran on
 * the client's session would append to the transcript it branched away from.
 *
 * ## Concurrency
 *
 * Sessions are NOT safe for concurrent queries. Each query must complete before
 * the next one starts. For parallel work, use separate sessions or `claude.parallel()`.
 *
 * ## Stored-session management
 *
 * Once the session has an id, it can also manage its own transcript on disk —
 * {@link Session.rename}, {@link Session.tag}, {@link Session.delete},
 * {@link Session.fork} — and read it back with {@link Session.info},
 * {@link Session.messages}, {@link Session.subagents} and
 * {@link Session.subagentMessages}. Those go straight to the stored transcript
 * and never through the executor, so they work in both modes.
 *
 * @example
 * ```ts
 * const session = claude.session()
 *
 * const r1 = await session.query('What files are in src/?')
 * // Claude reads the directory
 *
 * const r2 = await session.query('Refactor the largest file')
 * // Claude remembers the previous context
 *
 * console.log(session.sessionId) // 'abc-123-...'
 *
 * await session.rename('src audit')
 * const branch = await session.fork()   // a new Session, same history
 * await branch.query('Try the other approach instead')
 * branch.close()                        // the branch owns its own SDK session
 * ```
 */
export class Session {
  private readonly clientOptions: Readonly<ClientOptions>;
  private readonly executor: IExecutor;
  private readonly sessionOptions: SessionOptions;
  private readonly ownsExecutor: boolean;

  /** Session ID, populated after the first query completes. */
  private _sessionId: string | null;

  /** Number of queries executed in this session. */
  private _queryCount = 0;

  /**
   * @param clientOptions - The client's options, used to build every turn.
   * @param executor - Transport to run turns on.
   * @param sessionOptions - Session identity: `resume`, `continue`, `sessionId`.
   * @param ownsExecutor - Whether {@link Session.close} may shut `executor`
   *   down. `false` by default, because a caller-supplied executor belongs to
   *   the caller; {@link Session.fork} sets it on the SDK session it creates
   *   for the branch.
   */
  constructor(
    clientOptions: Readonly<ClientOptions>,
    executor: IExecutor,
    sessionOptions: SessionOptions = {},
    ownsExecutor = false,
  ) {
    this.clientOptions = clientOptions;
    this.executor = executor;
    this.sessionOptions = sessionOptions;
    this.ownsExecutor = ownsExecutor;
    // A pinned `sessionId` names the session before it exists, so it is a valid
    // id to report from the start — see `pinsNewSession()` for why it must not
    // become a resume target on the first turn.
    this._sessionId = sessionOptions.resume ?? sessionOptions.sessionId ?? null;

    warnInertSessionIdentity(executor, clientOptions, sessionOptions);
  }

  /** Current session ID (null until the first query completes). */
  get sessionId(): string | null {
    return this._sessionId;
  }

  /** Number of queries executed so far. */
  get queryCount(): number {
    return this._queryCount;
  }

  /**
   * Send a query within this session.
   *
   * The first query creates the session; subsequent queries resume it.
   */
  async query(prompt: string, options?: QueryOptions): Promise<QueryResult> {
    validatePrompt(prompt);
    if (options) validateQueryOptions(options);

    const args = this.buildSessionArgs(prompt, FORMAT_JSON, options);
    const env = resolveEnv(this.clientOptions, options);
    const resolved = mergeOptions(this.clientOptions, options, {
      prompt,
      outputFormat: FORMAT_JSON,
    });

    const result = await this.executor.execute(args, {
      // Every per-query override, by name: `QueryOptions` is a subset of
      // `ExecuteOptions`, so the spread carries them all and the explicit
      // fields below win where the resolved value differs from the raw one.
      ...options,
      cwd: resolved.cwd,
      env,
      prompt,
      input: options?.input,
      // Per-query value only: a client-level prompt is already the SDK
      // session's own system prompt, and CLI mode carries it in `args`.
      systemPrompt: options?.systemPrompt,
      signal: options?.signal,
    });

    this.updateSessionState(result.sessionId);
    return result;
  }

  /**
   * Send a query with streaming response within this session.
   * Returns a {@link StreamHandle} with fluent callbacks and Node.js stream support.
   */
  stream(prompt: string, options?: QueryOptions): StreamHandle {
    validatePrompt(prompt);
    if (options) validateQueryOptions(options);

    const args = this.buildSessionArgs(prompt, FORMAT_STREAM_JSON, options);
    const env = resolveEnv(this.clientOptions, options);
    const resolved = mergeOptions(this.clientOptions, options, {
      prompt,
      outputFormat: FORMAT_STREAM_JSON,
    });

    const executor = this.executor;
    const updateState = (id: string) => this.updateSessionState(id);
    const execOpts: ExecuteOptions = {
      // Same two channels as query() above.
      ...options,
      cwd: resolved.cwd,
      env,
      prompt,
      input: options?.input,
      // Per-query value only: a client-level prompt is already the SDK
      // session's own system prompt, and CLI mode carries it in `args`.
      systemPrompt: options?.systemPrompt,
      signal: options?.signal,
    };

    return new StreamHandle(async function* () {
      for await (const event of executor.stream(args, execOpts)) {
        if (event.type === EVENT_RESULT && event.sessionId) {
          updateState(event.sessionId);
        }
        yield event;
      }
    });
  }

  /**
   * Abort the current running query in this session.
   */
  abort(): void {
    this.executor.abort?.();
  }

  /**
   * Release the SDK session this Session owns.
   *
   * Only a Session returned by {@link Session.fork} in SDK mode owns one; for
   * every other Session the executor belongs to the client that created it, so
   * this is a no-op and `claude.close()` is the call that ends the session.
   * Safe to call more than once.
   */
  close(): void {
    if (this.ownsExecutor && this.executor instanceof SdkExecutor) {
      this.executor.close();
    }
  }

  // ── Stored-session management ─────────────────────────────────────
  // These read and write the session's transcript on disk (or in the
  // configured session store) rather than talking to a running process, so
  // they work in both SDK and CLI mode. All of them require an id, which
  // means: after the first query, or with `resume` / `sessionId` given up front.

  /**
   * Set this session's display title, as `/rename` does.
   *
   * The title is appended to the transcript and surfaces as
   * {@link SessionInfo.customTitle}.
   *
   * @param title - New title.
   * @param options - Overrides the project directory and the session store;
   *   defaults to this client's `cwd`.
   */
  async rename(title: string, options?: SessionMutationOptions): Promise<void> {
    const sessionId = this.requireSessionId('rename');
    const sdk = await Session.sdk();
    await sdk.renameSession(sessionId, title, this.sessionScope(options));
  }

  /**
   * Set or clear this session's tag.
   *
   * @param tag - New tag, or `null` to remove the existing one.
   * @param options - Overrides the project directory and the session store;
   *   defaults to this client's `cwd`.
   */
  async tag(tag: string | null, options?: SessionMutationOptions): Promise<void> {
    const sessionId = this.requireSessionId('tag');
    const sdk = await Session.sdk();
    await sdk.tagSession(sessionId, tag, this.sessionScope(options));
  }

  /**
   * Delete this session's transcript and its subagent transcripts.
   *
   * The instance stays usable: its id and query count are reset, so the next
   * `query()` starts a fresh session instead of resuming a deleted one.
   *
   * @param options - Overrides the project directory and the session store;
   *   defaults to this client's `cwd`.
   * @throws When the session file does not exist (local filesystem only — a
   *   session store without `delete()` is a silent no-op).
   */
  async delete(options?: SessionMutationOptions): Promise<void> {
    const sessionId = this.requireSessionId('delete');
    const sdk = await Session.sdk();
    await sdk.deleteSession(sessionId, this.sessionScope(options));

    this._sessionId = null;
    this._queryCount = 0;
  }

  /**
   * Branch this session into a new one and return it.
   *
   * Copies the transcript into a new session file, remapping every message
   * UUID and preserving the parent chain; file-history snapshots are not
   * copied, so the fork starts without undo history. This session is left
   * untouched.
   *
   * **Not** the same as {@link SessionOptions.fork}, which is the
   * `--fork-session` flag applied on the next turn.
   *
   * ## Which transport the branch runs on
   *
   * In CLI mode the returned Session shares this one's executor: every turn
   * spawns its own process, and the branch resumes the fork with `--resume`.
   *
   * In SDK mode it cannot — the executor holds one persistent session, opened
   * when the client was constructed, and a per-turn `--resume` is inert against
   * it. So the branch gets its own SDK session, resuming the forked transcript.
   * That session is lazy (nothing is spawned until the branch runs a turn) and
   * is owned by the branch, so close it with {@link Session.close} when done —
   * `claude.close()` only reaches the client's own session.
   *
   * @param options - `upToMessageId` slices the transcript, `title` names the
   *   fork; the project directory defaults to this client's `cwd`.
   * @returns A new {@link Session} resuming the fork.
   *
   * @example
   * ```ts
   * const branch = await session.fork({ title: 'alternative plan' })
   * await branch.query('Try the other approach instead')
   * branch.close()
   * ```
   */
  async fork(options?: ForkSessionOptions): Promise<Session> {
    const sessionId = this.requireSessionId('fork');
    const sdk = await Session.sdk();
    const result = await sdk.forkSession(sessionId, this.sessionScope(options));

    if (!(this.executor instanceof SdkExecutor)) {
      return new Session(this.clientOptions, this.executor, { resume: result.sessionId });
    }

    // Session identity is fixed at SDK-session construction, so the branch is
    // reachable only through a session built to resume it. Every other client
    // option is inherited verbatim; the identity fields are not, because they
    // name the transcript this fork was branched off.
    const branchOptions: Readonly<ClientOptions> = Object.freeze({
      ...this.clientOptions,
      resume: result.sessionId,
      sessionId: undefined,
      continueSession: undefined,
      forkSession: undefined,
      resumeSessionAt: undefined,
      resumeDropsTurn: undefined,
    });

    return new Session(
      branchOptions,
      new SdkExecutor(toSdkExecutorOptions(branchOptions)),
      { resume: result.sessionId },
      true,
    );
  }

  /**
   * Read this session's stored metadata: title, tag, git branch, timestamps.
   *
   * Not cached — the transcript is rewritten by every turn, so a value read
   * before `query()` is stale after it.
   *
   * @param options - Overrides the project directory and the session store;
   *   defaults to this client's `cwd`.
   * @returns `undefined` when the session file is missing, is a sidechain, or
   *   has no extractable summary.
   */
  async info(options?: GetSessionInfoOptions): Promise<SessionInfo | undefined> {
    const sessionId = this.requireSessionId('info');
    const sdk = await Session.sdk();
    return sdk.getSessionInfo(sessionId, this.sessionScope(options));
  }

  /**
   * Read this session's transcript.
   *
   * @param options - `limit` / `offset` paginate, `includeSystemMessages`
   *   adds compact boundaries and notices; the project directory defaults to
   *   this client's `cwd`.
   * @returns The messages, or an empty array when the session is not found.
   */
  async messages(options?: GetSessionMessagesOptions): Promise<SessionMessage[]> {
    const sessionId = this.requireSessionId('messages');
    const sdk = await Session.sdk();
    return sdk.getSessionMessages(sessionId, this.sessionScope(options));
  }

  /**
   * List the ids of subagents spawned by this session.
   *
   * The ids feed straight into {@link Session.subagentMessages}.
   *
   * @param options - Overrides the project directory and the session store;
   *   defaults to this client's `cwd`.
   */
  async subagents(options?: ListSubagentsOptions): Promise<string[]> {
    const sessionId = this.requireSessionId('subagents');
    const sdk = await Session.sdk();
    return sdk.listSubagents(sessionId, this.sessionScope(options));
  }

  /**
   * Read one subagent's transcript.
   *
   * @param agentId - Id from {@link Session.subagents}.
   * @param options - `limit` / `offset` paginate; the project directory
   *   defaults to this client's `cwd`. Unlike {@link Session.messages} there
   *   is no `includeSystemMessages` — subagent transcripts hold user and
   *   assistant messages only.
   */
  async subagentMessages(
    agentId: string,
    options?: GetSubagentMessagesOptions,
  ): Promise<SessionMessage[]> {
    const sessionId = this.requireSessionId('subagentMessages');
    const sdk = await Session.sdk();
    return sdk.getSubagentMessages(sessionId, agentId, this.sessionScope(options));
  }

  // ── Private helpers ───────────────────────────────────────────────

  /**
   * Load the Agent SDK on demand.
   *
   * The stored-session functions live on the SDK module, not on the executor,
   * so CLI-mode sessions can use them too — and nothing is imported until one
   * of them is actually called.
   */
  private static async sdk(): Promise<typeof import('@anthropic-ai/claude-agent-sdk')> {
    return import('@anthropic-ai/claude-agent-sdk');
  }

  /**
   * Default the project directory of a stored-session call to the client's
   * `cwd`, which is where this session's transcript was written. An explicit
   * `dir` (or `sessionStore`) in `options` wins.
   */
  private sessionScope<T extends SessionMutationOptions>(options?: T): T & { dir?: string } {
    return { dir: this.clientOptions.cwd, ...options } as T & { dir?: string };
  }

  /** The session's id, or a {@link ValidationError} naming what is missing. */
  private requireSessionId(method: string): string {
    if (this._sessionId === null) {
      throw new ValidationError(
        'sessionId',
        `is required by ${method}() but this session has none yet — run a query first, `
        + 'or create the session with { resume } or { sessionId }',
      );
    }
    return this._sessionId;
  }

  /**
   * Whether the first turn has to create the session under a caller-chosen id.
   *
   * A pinned `sessionId` names a session that does not exist yet, so the first
   * turn must emit `--session-id`, not `--resume`. With `resume` also set the
   * pin belongs to the fork, and the resume target is still the original.
   */
  private pinsNewSession(): boolean {
    return this.sessionOptions.sessionId !== undefined && this.sessionOptions.resume === undefined;
  }

  private buildSessionArgs(
    prompt: string,
    outputFormat: 'json' | 'stream-json',
    queryOptions?: QueryOptions,
  ): string[] {
    const isFirstQuery = this._queryCount === 0;
    const createsPinnedSession = isFirstQuery && this.pinsNewSession();

    const resolved = mergeOptions(this.clientOptions, queryOptions, {
      prompt,
      outputFormat,
      sessionId: createsPinnedSession ? undefined : this._sessionId ?? undefined,
      newSessionId: isFirstQuery ? this.sessionOptions.sessionId : undefined,
      continueSession: isFirstQuery && this.sessionOptions.continue,
      forkSession: isFirstQuery && this.sessionOptions.fork,
      // A truncating resume rewrites the transcript at a chain entry, so it is
      // a first-turn-only operation: repeating it would re-truncate back to the
      // same entry on every later turn (or be rejected once that uuid is gone).
      resumeSessionAt: isFirstQuery ? this.sessionOptions.resumeSessionAt : undefined,
      resumeDropsTurn: isFirstQuery ? this.sessionOptions.resumeDropsTurn : undefined,
    });

    return buildArgs(resolved);
  }

  private updateSessionState(sessionId: string): void {
    if (sessionId) {
      this._sessionId = sessionId;
    }
    this._queryCount++;
  }
}

/**
 * Warn when session identity was requested but cannot be applied.
 *
 * SDK mode opens its persistent session when the client is constructed, so the
 * `--resume` / `--continue` / `--session-id` flags this class emits per turn are
 * inert there: the turn runs against whatever session the executor already
 * holds. Saying so is better than silently answering from the wrong transcript.
 *
 * Identity the client was already built with is not reported — that session is
 * the one the executor holds, so asking for it again changes nothing.
 */
function warnInertSessionIdentity(
  executor: IExecutor,
  clientOptions: Readonly<ClientOptions>,
  options: SessionOptions,
): void {
  if (!(executor instanceof SdkExecutor)) return;

  const inert = [
    options.resume !== undefined && options.resume !== clientOptions.resume ? 'resume' : null,
    options.continue === true && clientOptions.continueSession !== true ? 'continue' : null,
    options.sessionId !== undefined && options.sessionId !== clientOptions.sessionId ? 'sessionId' : null,
  ].filter((name): name is string => name !== null);

  if (inert.length === 0) return;

  console.warn(
    `[kraube-konnektor] claude.session({ ${inert.join(', ')} }) has no effect in SDK mode: `
    + 'the persistent session is created with the client. Pass these to '
    + 'new Claude({ ... }) instead, or use useSdk: false for one session per query.',
  );
}
