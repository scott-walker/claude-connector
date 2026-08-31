import type { QueryResult, StreamEvent } from '../types/index.js';
import type {
  EffortLevel,
  PermissionMode,
  ThinkingConfig,
  ToolsPresetConfig,
} from '../types/client.js';

/**
 * Abstract execution interface — the core abstraction of kraube-konnektor.
 *
 * All interaction with Claude Code goes through an executor. This decouples
 * the public API ({@link Claude}, {@link Session}) from the underlying
 * transport mechanism.
 *
 * ## Why this abstraction exists
 *
 * Today the only executor is {@link CliExecutor} (spawns `claude -p`).
 * Tomorrow Anthropic may ship a native Node.js SDK, an HTTP API,
 * or a Unix socket interface. By coding against `IExecutor`, the entire
 * public surface remains stable — only a new executor implementation is needed.
 *
 * ## Contract
 *
 * - `execute()` runs a query to completion and returns a structured result.
 * - `stream()` runs a query and yields incremental events as an async iterator.
 * - Both methods receive a fully resolved argument list (no option merging here).
 * - Executors must NOT hold mutable state between calls (stateless per invocation).
 * - Error conditions must throw {@link KraubeKonnektorError} subclasses.
 */
export interface IExecutor {
  /**
   * Execute a query and return the complete result.
   *
   * @param args  - Resolved CLI arguments (produced by ArgsBuilder).
   * @param options - Execution-level options (cwd, env, input).
   * @returns Parsed query result.
   */
  execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult>;

  /**
   * Execute a query and stream incremental events.
   *
   * The returned async iterable yields events as they arrive.
   * `'result'` marks the end of the answer, but it is not always the last
   * event: SDK mode drains the informational frames the SDK delivers after
   * it (`prompt_suggestion`, a trailing `task_notification`,
   * `session_state_changed`) before the stream ends.
   *
   * @param args  - Resolved CLI arguments (produced by ArgsBuilder).
   * @param options - Execution-level options (cwd, env, input).
   * @returns Async iterable of stream events.
   */
  stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent>;

  /**
   * Abort a running execution.
   * Implementations should kill the underlying process gracefully.
   */
  abort?(): void;
}

/**
 * Low-level options passed directly to the executor.
 * These are resolved from ClientOptions + QueryOptions by the client layer.
 *
 * ## Two channels, two audiences
 *
 * CLI mode reads everything from `args` — every per-query override is already
 * encoded there as a flag. SDK mode cannot: its session is created once, so the
 * flags in `args` are inert and the per-query fields below are the only way an
 * override reaches it. Both channels are therefore populated, and each executor
 * reads the one it can act on.
 *
 * The per-query fields mirror {@link QueryOptions} field for field. A field
 * being present is not a promise that the SDK can honour it mid-session: it
 * bridges `model`, `permissionMode`, `thinking`, `effortLevel`,
 * `fallbackModel`, `allowedTools`, `disallowedTools` and `additionalDirs`, and
 * fixes the rest at session construction. See {@link SdkExecutor.execute} for
 * the exact split, including which of the fixed ones are still per-query flags
 * in CLI mode.
 *
 * @example
 * ```ts
 * await executor.execute(args, {
 *   cwd: process.cwd(),
 *   env: {},
 *   prompt: 'Summarize the diff',
 *   model: 'opus',
 *   permissionMode: 'plan',
 * })
 * ```
 */
export interface ExecuteOptions {
  /** Working directory for the CLI process. */
  readonly cwd: string;

  /** Environment variables merged with process.env. */
  readonly env: Readonly<Record<string, string>>;

  /**
   * The prompt for this execution, verbatim.
   *
   * Preferred over recovering it from `args`: an executor that does not spawn a
   * process (SDK mode) would otherwise have to parse the flag array back apart,
   * which loses quoting and mis-handles flags whose value is optional.
   */
  readonly prompt?: string;

  /**
   * Data piped to the CLI's stdin.
   * Equivalent to `echo "data" | claude -p "prompt"`.
   */
  readonly input?: string;

  /**
   * System prompt for this execution.
   *
   * CLI mode ignores it — `--system-prompt` is already in `args`. SDK mode
   * cannot send one mid-session, so it prepends the value to the turn's text
   * as `[System instruction: …]`.
   *
   * Pass the *per-query* value only. A client-level system prompt is already
   * installed as the SDK session's own system prompt, and repeating it here
   * would put it in front of every user message as well. The SDK executor drops
   * a value the session already carries — including the joined spelling of one
   * configured as an array — but a value a caller has reformatted some other
   * way is indistinguishable from a genuine per-query override.
   */
  readonly systemPrompt?: string;

  /**
   * AbortSignal for cancelling this specific execution.
   * When signaled, the executor should terminate the running query.
   */
  readonly signal?: AbortSignal;

  // ── Per-query overrides (mirrors QueryOptions) ──────────────────

  /** Model override for this query only. SDK mode switches and switches back. */
  readonly model?: string;

  /** Fallback model(s) for this query only. SDK mode switches and switches back. */
  readonly fallbackModel?: string | readonly string[];

  /** Effort level override for this query only. SDK mode switches and switches back. */
  readonly effortLevel?: EffortLevel;

  /** Permission mode override. SDK mode switches and switches back. */
  readonly permissionMode?: PermissionMode;

  /**
   * Plan-mode workflow override, used when `permissionMode` is `'plan'`.
   * Construction-time only in SDK mode.
   */
  readonly planModeInstructions?: string;

  /** Auto-approved tools for this query only. SDK mode switches and switches back. */
  readonly allowedTools?: readonly string[];

  /** Denied tools for this query only. SDK mode switches and switches back. */
  readonly disallowedTools?: readonly string[];

  /** Text appended to the default system prompt for this query only. */
  readonly appendSystemPrompt?: string;

  /** Path to a file whose contents replace the system prompt. */
  readonly systemPromptFile?: string;

  /** Path to a file whose contents are appended to the system prompt. */
  readonly appendSystemPromptFile?: string;

  /** Maximum agentic turns for this query only. Construction-time only in SDK mode. */
  readonly maxTurns?: number;

  /** Maximum spend in USD for this query only. Construction-time only in SDK mode. */
  readonly maxBudget?: number;

  /** API-side token budget for this query only. Construction-time only in SDK mode. */
  readonly taskBudgetTokens?: number;

  /**
   * JSON Schema requested for this query's structured output.
   * Construction-time only in SDK mode.
   */
  readonly schema?: Record<string, unknown>;

  /**
   * Run this query in a git worktree — `true` for an auto-named one, or a name.
   * Construction-time only in SDK mode.
   */
  readonly worktree?: boolean | string;

  /** Extra directories the query may read. SDK mode switches and switches back. */
  readonly additionalDirs?: readonly string[];

  /** Subagent to answer this query. Construction-time only in SDK mode. */
  readonly agent?: string;

  /**
   * Tool set for this query — an explicit list, or the Claude Code preset.
   * Construction-time only in SDK mode.
   */
  readonly tools?: readonly string[] | ToolsPresetConfig;

  /** Skills to load for this query, or `'all'`. Not honoured per query in either mode. */
  readonly skills?: readonly string[] | 'all';

  /** Files attached to this query. Construction-time only in SDK mode. */
  readonly files?: readonly string[];

  /** Run this query as a background task. Not honoured per query in either mode. */
  readonly background?: boolean;

  /** Thinking configuration for this query. SDK mode switches and switches back. */
  readonly thinking?: ThinkingConfig;
}
