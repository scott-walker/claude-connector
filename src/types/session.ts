/**
 * Options for creating or resuming a session.
 */
export interface SessionOptions {
  /**
   * Resume an existing session by ID.
   * If omitted, a new session is created on first query.
   */
  readonly resume?: string;

  /**
   * Fork the session instead of continuing in-place.
   * Creates a new session ID branching from the resumed session.
   * Only meaningful when `resume` is set.
   *
   * **Not** the same as {@link ForkSessionOptions}: this is the `--fork-session`
   * flag applied on the next turn, while `forkSession()` copies an existing
   * transcript into a brand-new session file without running a turn.
   */
  readonly fork?: boolean;

  /**
   * Continue the most recent session in the working directory.
   * Mutually exclusive with `resume`.
   */
  readonly continue?: boolean;

  /**
   * Chain-entry UUID: resume only up to and including this message.
   * The transcript-side half of `rewindFiles()`.
   *
   * Only meaningful next to `resume` or `continue`: a truncating resume needs a
   * transcript to truncate. The session-level counterpart of
   * `new Claude({ resumeSessionAt })`.
   */
  readonly resumeSessionAt?: string;

  /**
   * Prompt UUID of the turn a truncating resume intends to discard.
   * The CLI validates it and refuses with a message starting
   * `RESUME_REJECTED_PREFIX` — a refusal is deterministic, so route it to a
   * rewind-recovery path instead of retrying.
   *
   * The session-level counterpart of `new Claude({ resumeDropsTurn })`.
   */
  readonly resumeDropsTurn?: string;

  /**
   * Pin the session to a caller-supplied UUID (`--session-id`).
   *
   * Unlike `resume`, this does not load an existing transcript — it names the
   * session that is about to be created, so the ID is known before the first
   * query completes. Fails if a session with this ID already exists.
   *
   * @example
   * ```ts
   * import { randomUUID } from 'node:crypto'
   *
   * const id = randomUUID()
   * const session = claude.session({ sessionId: id })
   * await session.query('Start the audit')
   * // `id` was already usable for logging before the query ran
   * ```
   */
  readonly sessionId?: string;
}

/**
 * Metadata about a stored session.
 *
 * Mirrors the SDK's `SDKSessionInfo`, as returned by `listSessions()` and
 * `getSessionInfo()`.
 */
export interface SessionInfo {
  /** Unique session identifier (UUID). */
  readonly sessionId: string;

  /**
   * Display title: custom title, auto-generated summary, or first prompt —
   * whichever is available, in that order.
   */
  readonly summary: string;

  /** Last modification time, in integer milliseconds since the epoch. */
  readonly lastModified: number;

  /** File size in bytes. Only populated for local JSONL storage. */
  readonly fileSize?: number;

  /** User-set session title (via `/rename` or `renameSession()`). */
  readonly customTitle?: string;

  /** First meaningful user prompt in the session. */
  readonly firstPrompt?: string;

  /** Git branch at the end of the session. */
  readonly gitBranch?: string;

  /** Working directory the session ran in. */
  readonly cwd?: string;

  /** User-set session tag (via `tagSession()`). */
  readonly tag?: string;

  /**
   * Creation time in integer milliseconds since the epoch, extracted from the
   * first transcript entry's timestamp.
   */
  readonly createdAt?: number;

  /**
   * Human-readable session name.
   *
   * @deprecated Use {@link SessionInfo.customTitle} — the SDK reports the
   * renamed title under that name. Kept for backwards compatibility only.
   */
  readonly name?: string;

  /**
   * ISO 8601 timestamp of last activity.
   *
   * @deprecated Use {@link SessionInfo.lastModified} (epoch milliseconds).
   * Kept for backwards compatibility only; it is never populated by the SDK.
   */
  readonly lastActive?: string;
}

// ── Session transcripts ───────────────────────────────────────────

/**
 * A single message from a session transcript.
 *
 * Returned by `getSessionMessages()` / `getSubagentMessages()` when reading
 * historical session data.
 */
export interface SessionMessage {
  /** Role of the transcript entry. */
  readonly type: 'user' | 'assistant' | 'system';

  /** Unique message identifier. */
  readonly uuid: string;

  /** Session this message belongs to. */
  readonly session_id: string;

  /**
   * Raw message payload, in the on-disk transcript format.
   * Shape is CLI-internal and deliberately not narrowed.
   */
  readonly message: unknown;

  /** Tool use that produced this message, or `null` for top-level turns. */
  readonly parent_tool_use_id: string | null;

  /**
   * `agentId` of the subagent that spawned this subagent, or `null` when the
   * message belongs to a depth-1 subagent (spawned by the main loop) or to the
   * main session itself. Sessions whose metadata predates the field report
   * `null`.
   *
   * This is what lets a flat transcript be re-assembled into a subagent tree.
   */
  readonly parent_agent_id: string | null;
}

// ── Session mutation ──────────────────────────────────────────────

/**
 * Options shared by every session mutation (`renameSession`, `tagSession`,
 * `deleteSession`, `forkSession`).
 */
export interface SessionMutationOptions {
  /**
   * Project directory the session lives in — same semantics as
   * `listSessions({ dir })`.
   *
   * When omitted, **every** project directory is searched for the session file:
   * location-independent but slower. Pass the session's `cwd` when known.
   */
  readonly dir?: string;

  /**
   * Read/write session data through this store instead of the local filesystem.
   *
   * @alpha
   */
  readonly sessionStore?: SessionStore;
}

/**
 * Options for forking a session into a new branch.
 *
 * Forking copies transcript messages into a new session file, remapping every
 * message UUID and preserving the parent chain. Forked sessions start without
 * undo history — file-history snapshots are not copied.
 */
export interface ForkSessionOptions extends SessionMutationOptions {
  /** Slice the transcript up to this message UUID (inclusive). Omit for a full copy. */
  readonly upToMessageId?: string;

  /** Title for the fork. When omitted, derives from the original title + `" (fork)"`. */
  readonly title?: string;
}

/**
 * Result of a fork operation.
 */
export interface ForkSessionResult {
  /**
   * UUID of the new session. Resumable via `claude.session({ resume: sessionId })`.
   */
  readonly sessionId: string;
}

// ── Session reads ─────────────────────────────────────────────────

/**
 * Options for reading a single session's metadata.
 */
export interface GetSessionInfoOptions {
  /**
   * Project directory the session lives in — same semantics as
   * `listSessions({ dir })`. When omitted, all project directories are searched.
   */
  readonly dir?: string;

  /**
   * Load session info from this store instead of the local filesystem.
   *
   * @alpha
   */
  readonly sessionStore?: SessionStore;
}

/**
 * Options for listing sessions.
 *
 * @example
 * ```ts
 * // Sessions for one project, newest first
 * const sessions = await listSessions({ dir: process.cwd() })
 *
 * // Paginate, hiding headless SDK runs
 * const page2 = await listSessions({ limit: 50, offset: 50, includeProgrammatic: false })
 * ```
 */
export interface ListSessionsOptions {
  /**
   * Directory to list sessions for. When provided, returns sessions for this
   * project directory (and, by default, its git worktrees). When omitted,
   * returns sessions across all projects.
   */
  readonly dir?: string;

  /** Maximum number of sessions to return. */
  readonly limit?: number;

  /**
   * Number of sessions to skip from the start of the sorted result set.
   * Use with `limit` for pagination. Defaults to `0`.
   */
  readonly offset?: number;

  /**
   * When `dir` is inside a git repository, include sessions from every git
   * worktree path. Defaults to `true`. Local filesystem only.
   */
  readonly includeWorktrees?: boolean;

  /**
   * Include programmatic/headless sessions (SDK entrypoints `sdk-cli`,
   * `sdk-ts`, `sdk-py`) and daemon sessions. Defaults to `true`, so every
   * headless run this library performs shows up in the list — pass `false`
   * for parity with the terminal's `/resume` picker.
   *
   * Local filesystem only; ignored when `sessionStore` is provided.
   */
  readonly includeProgrammatic?: boolean;

  /**
   * List sessions from this store instead of the local filesystem.
   * Requires the store to implement `listSessions`.
   *
   * @alpha
   */
  readonly sessionStore?: SessionStore;
}

/**
 * Options for reading a session's messages.
 */
export interface GetSessionMessagesOptions {
  /** Project directory to find the session in. When omitted, all projects are searched. */
  readonly dir?: string;

  /** Maximum number of messages to return. */
  readonly limit?: number;

  /** Number of messages to skip from the start. */
  readonly offset?: number;

  /**
   * Include system messages (compact boundaries, informational notices)
   * alongside user/assistant messages. Defaults to `false`.
   */
  readonly includeSystemMessages?: boolean;

  /**
   * Load messages from this store instead of the local filesystem.
   *
   * @alpha
   */
  readonly sessionStore?: SessionStore;
}

/**
 * Options for listing a session's subagents.
 */
export interface ListSubagentsOptions {
  /** Project directory to find the session in. When omitted, all projects are searched. */
  readonly dir?: string;

  /**
   * List subagents from this store instead of the local filesystem.
   * Requires the store to implement `listSubkeys`.
   *
   * @alpha
   */
  readonly sessionStore?: SessionStore;
}

/**
 * Options for reading a subagent's messages.
 *
 * Note: unlike {@link GetSessionMessagesOptions}, there is no
 * `includeSystemMessages` — subagent transcripts return user/assistant
 * messages only.
 */
export interface GetSubagentMessagesOptions {
  /** Project directory to find the session in. When omitted, all projects are searched. */
  readonly dir?: string;

  /** Maximum number of messages to return. */
  readonly limit?: number;

  /** Number of messages to skip from the start. */
  readonly offset?: number;

  /**
   * Load subagent messages from this store instead of the local filesystem.
   *
   * @alpha
   */
  readonly sessionStore?: SessionStore;
}

// ── Session stores ────────────────────────────────────────────────

/**
 * Identifies a session transcript, or a subagent transcript, inside a
 * {@link SessionStore}.
 *
 * @alpha
 */
export interface SessionKey {
  /**
   * Caller-defined scope. Defaults to the sanitized cwd; multi-tenant
   * deployments should set a tenant ID or project name. Paths longer than 200
   * characters are truncated and suffixed with a portable djb2 hash, so the
   * same path yields the same key under both Bun and Node.js.
   */
  readonly projectKey: string;

  /** Session UUID. */
  readonly sessionId: string;

  /**
   * Undefined for the main transcript; set for subagent files, mirroring the
   * on-disk layout (e.g. `'subagents/agent-{id}'`). An empty string is invalid
   * — omit the field instead. Opaque to the adapter: use it as a key suffix.
   */
  readonly subpath?: string;
}

/**
 * One JSONL transcript line as observed by a {@link SessionStore} adapter.
 *
 * The concrete entry shape is the on-disk transcript format — a large
 * CLI-internal union over `type`. Only the structural supertype is public:
 * every entry has a string `type`, most carry a `uuid` and an ISO `timestamp`,
 * and the rest of the payload is opaque JSON. Treat entries as pass-through
 * blobs; surviving a `JSON.stringify` / `JSON.parse` round-trip is the only
 * required invariant.
 *
 * @alpha
 */
export interface SessionStoreEntry {
  /** Entry discriminator, in the CLI's on-disk transcript vocabulary. */
  readonly type: string;

  /**
   * Stable entry identifier. Adapters SHOULD treat it as an idempotency key so
   * retries and `importSessionToStore()` replays do not duplicate rows.
   * Absent on entries such as titles, tags and mode markers.
   */
  readonly uuid?: string;

  /** ISO 8601 write time, when the entry carries one. */
  readonly timestamp?: string;

  /** Remaining payload, opaque to adapters. */
  [key: string]: unknown;
}

/**
 * Incrementally-maintained per-session summary.
 *
 * Stores update this from inside `append()` via the SDK's synchronous
 * `foldSessionSummary()` helper and return the full set from
 * {@link SessionStore.listSessionSummaries}. Adapters never re-read previously
 * appended entries.
 *
 * @alpha
 */
export interface SessionSummaryEntry {
  /** Session UUID this summary describes. */
  readonly sessionId: string;

  /**
   * Storage write time of the sidecar on the adapter. Must share a clock source
   * with the `mtime` returned by {@link SessionStore.listSessions} — file mtime,
   * S3 `LastModified`, Postgres `updated_at`, or whatever native timestamp the
   * adapter exposes. Never derive it from entry ISO timestamps: batching and
   * network latency make the two diverge and defeat the staleness check.
   */
  readonly mtime: number;

  /** Opaque SDK-owned state. Persist verbatim; never interpret it. */
  readonly data: Record<string, unknown>;
}

/**
 * Flush strategy for transcript mirroring into a {@link SessionStore}.
 *
 * - `'batched'` (default): buffer mirror frames, flush at end-of-turn or when
 *   pending thresholds are exceeded.
 * - `'eager'`: schedule a background flush after every frame for near-real-time
 *   delivery. Each frame becomes its own `append()` batch (no coalescing), so
 *   adapters must stay cheap per call.
 *
 * @alpha
 */
export type SessionStoreFlush = 'batched' | 'eager';

/**
 * Adapter for mirroring session transcripts to external storage.
 *
 * The subprocess still writes to local disk (set `CLAUDE_CONFIG_DIR=/tmp` for an
 * ephemeral local copy); the adapter receives a secondary copy, so it is
 * mutually exclusive in spirit with disabling local persistence — the mirror
 * hook only fires after a successful local write.
 *
 * The SDK never deletes from a store unless `deleteSession()` is called and
 * `delete` is implemented. Retention is the adapter's responsibility: TTLs, S3
 * lifecycle policies or scheduled cleanup, per your compliance requirements.
 * Local transcripts under `CLAUDE_CONFIG_DIR` are swept by the existing
 * `cleanupPeriodDays` setting, independently of the adapter.
 *
 * Method signatures intentionally mirror the SDK's `SessionStore` exactly (no
 * `readonly` array parameters), so an implementation of this interface can be
 * handed straight to the SDK.
 *
 * @alpha
 *
 * @example
 * ```ts
 * const store: SessionStore = {
 *   async append(key, entries) { await db.insertMany(key, entries) },
 *   async load(key) { return (await db.read(key)) ?? null },
 * }
 * ```
 */
export interface SessionStore {
  /**
   * Mirror a batch of transcript entries. Called **after** the subprocess's
   * local write succeeds — durability is already guaranteed locally.
   *
   * Batches arrive at roughly a 100ms cadence during active turns and contain
   * JSON-safe POJOs, one per line of the local JSONL file. Within one process,
   * persist entries in append-call order; across concurrent processes, order is
   * by storage commit time, not call time.
   *
   * Rejections are retried (3 attempts, short backoff); 60s timeouts are not
   * retried, since the in-flight call may still land. After the final failure
   * the batch is dropped and a mirror-error system message is emitted — the
   * subprocess continues unaffected.
   */
  append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void>;

  /**
   * Load a full session for resume. Called once, in the SDK parent, before the
   * subprocess spawns; the result is materialized to a temporary JSONL file.
   *
   * Return `null` for a key that was never written. Adapters that cannot
   * distinguish "never written" from "emptied" (e.g. Redis `LRANGE`) may return
   * `null` for both. Returned entries must be deep-equal to what was appended —
   * byte-equal serialization is not required.
   */
  load(key: SessionKey): Promise<SessionStoreEntry[] | null>;

  /**
   * List sessions for a `projectKey`, as IDs plus modification times.
   *
   * `mtime` is integer Unix epoch milliseconds (floor fractional sources);
   * adapters without a native modification time must maintain their own index.
   * Result order is unspecified — the SDK sorts by `mtime` descending.
   *
   * Optional: when undefined, listing sessions through this store throws.
   */
  listSessions?(projectKey: string): Promise<Array<{ sessionId: string; mtime: number }>>;

  /**
   * Return incrementally-maintained summaries for every session in one call.
   *
   * When implemented, listing sessions through the store reads all summary
   * metadata in a single round-trip; when undefined, it falls back to
   * `listSessions()` plus a per-session `load()`.
   *
   * Stores maintaining summaries inside `append()` MUST serialize sidecar
   * writes if `append()` calls can race for the same session — wrap the
   * read-fold-write in a transaction/CAS or hold a per-session lock. The SDK's
   * `foldSessionSummary()` is pure; concurrency control is the store's job.
   *
   * @alpha
   */
  listSessionSummaries?(projectKey: string): Promise<SessionSummaryEntry[]>;

  /**
   * Delete a session. Optional: when undefined, deletion is a silent no-op,
   * which is the right behaviour for WORM/append-only backends like S3.
   */
  delete?(key: SessionKey): Promise<void>;

  /**
   * List every subpath key under a session (e.g. subagent transcripts). Used
   * during resume to discover and materialize subagent data. When undefined,
   * resume only materializes the main transcript.
   */
  listSubkeys?(key: { projectKey: string; sessionId: string }): Promise<string[]>;
}

/**
 * Handle over the SDK's in-memory {@link SessionStore} implementation.
 *
 * Every optional store method is implemented, plus three test helpers. Not
 * suitable for production — all data dies with the process.
 *
 * @alpha
 *
 * @example
 * ```ts
 * const store = await createInMemorySessionStore()
 * await claude.query('hi', { sessionStore: store })
 * console.log(store.size)
 * store.clear()
 * ```
 */
export interface InMemorySessionStoreHandle extends SessionStore {
  listSessions(projectKey: string): Promise<Array<{ sessionId: string; mtime: number }>>;
  listSessionSummaries(projectKey: string): Promise<SessionSummaryEntry[]>;
  delete(key: SessionKey): Promise<void>;
  listSubkeys(key: { projectKey: string; sessionId: string }): Promise<string[]>;

  /** Test helper — every entry stored under a key. */
  getEntries(key: SessionKey): SessionStoreEntry[];

  /** Test helper — number of stored sessions (main transcripts only). */
  readonly size: number;

  /** Test helper — drop all stored data. */
  clear(): void;
}

/**
 * Options for importing a local JSONL session into a {@link SessionStore}.
 *
 * @alpha
 */
export interface ImportSessionToStoreOptions {
  /**
   * Project directory path — same semantics as `listSessions({ dir })`. When
   * omitted, all project directories are searched and the destination
   * `projectKey` is derived from the resolved cwd.
   */
  readonly dir?: string;

  /** Also import subagent transcripts. Defaults to `true`. */
  readonly includeSubagents?: boolean;

  /**
   * Maximum entries per `store.append()` call, to stay under backend payload
   * limits. Defaults to `500`, so `append()` is called repeatedly per session —
   * adapters must treat `uuid` as an idempotency key or replays duplicate rows.
   */
  readonly batchSize?: number;
}

// ── Pre-warmed queries ────────────────────────────────────────────

/**
 * A pre-warmed query handle: the subprocess is already spawned and has finished
 * its initialize handshake, so the first prompt hits a ready process.
 *
 * Most consumers should prefer `claude.init()` / `claude.ready`, which give the
 * same warm-up through the library's own lifecycle events. This handle is the
 * escape hatch for driving a raw SDK `Query` outside the `Claude` facade.
 *
 * The underlying SDK object also implements `AsyncDisposable` (usable with
 * `await using`); that member is omitted here because it requires the
 * `ESNext.Disposable` lib, which this package does not target.
 */
export interface WarmQuery {
  /**
   * Send a prompt to the pre-warmed subprocess and return the SDK `Query`.
   * May be called **only once** per handle.
   */
  query(
    prompt: string | AsyncIterable<import('@anthropic-ai/claude-agent-sdk').SDKUserMessage>,
  ): import('@anthropic-ai/claude-agent-sdk').Query;

  /** Close the subprocess without sending a prompt, discarding the warm-up. */
  close(): void;
}
