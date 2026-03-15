import type { ClientOptions, QueryOptions, QueryResult, StreamEvent } from '../types/index.js';
import type { SessionOptions } from '../types/session.js';
import type { IExecutor } from '../executor/interface.js';
import { buildArgs, mergeOptions, resolveEnv } from '../builder/args-builder.js';
import { validateQueryOptions, validatePrompt } from '../utils/validation.js';

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
 * ## Concurrency
 *
 * Sessions are NOT safe for concurrent queries. Each query must complete before
 * the next one starts. For parallel work, use separate sessions or `claude.parallel()`.
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
 * ```
 */
export class Session {
  private readonly clientOptions: Readonly<ClientOptions>;
  private readonly executor: IExecutor;
  private readonly sessionOptions: SessionOptions;

  /** Session ID, populated after the first query completes. */
  private _sessionId: string | null;

  /** Number of queries executed in this session. */
  private _queryCount = 0;

  constructor(
    clientOptions: Readonly<ClientOptions>,
    executor: IExecutor,
    sessionOptions: SessionOptions = {},
  ) {
    this.clientOptions = clientOptions;
    this.executor = executor;
    this.sessionOptions = sessionOptions;
    this._sessionId = sessionOptions.resume ?? null;
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

    const args = this.buildSessionArgs(prompt, 'json', options);
    const env = resolveEnv(this.clientOptions, options);
    const resolved = mergeOptions(this.clientOptions, options, {
      prompt,
      outputFormat: 'json',
    });

    const result = await this.executor.execute(args, {
      cwd: resolved.cwd,
      env,
      input: options?.input,
      systemPrompt: resolved.systemPrompt,
    });

    this.updateSessionState(result.sessionId);
    return result;
  }

  /**
   * Send a query with streaming response within this session.
   */
  async *stream(prompt: string, options?: QueryOptions): AsyncIterable<StreamEvent> {
    validatePrompt(prompt);
    if (options) validateQueryOptions(options);

    const args = this.buildSessionArgs(prompt, 'stream-json', options);
    const env = resolveEnv(this.clientOptions, options);
    const resolved = mergeOptions(this.clientOptions, options, {
      prompt,
      outputFormat: 'stream-json',
    });

    for await (const event of this.executor.stream(args, {
      cwd: resolved.cwd,
      env,
      input: options?.input,
      systemPrompt: resolved.systemPrompt,
    })) {
      // Capture session ID from result events
      if (event.type === 'result' && event.sessionId) {
        this.updateSessionState(event.sessionId);
      }
      yield event;
    }
  }

  /**
   * Abort the current running query in this session.
   */
  abort(): void {
    this.executor.abort?.();
  }

  // ── Private helpers ───────────────────────────────────────────────

  private buildSessionArgs(
    prompt: string,
    outputFormat: 'json' | 'stream-json',
    queryOptions?: QueryOptions,
  ): string[] {
    const isFirstQuery = this._queryCount === 0;

    const resolved = mergeOptions(this.clientOptions, queryOptions, {
      prompt,
      outputFormat,
      sessionId: this._sessionId ?? undefined,
      continueSession: isFirstQuery && this.sessionOptions.continue,
      forkSession: isFirstQuery && this.sessionOptions.fork,
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
