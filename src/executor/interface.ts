import type { QueryResult, StreamEvent } from '../types/index.js';

/**
 * Abstract execution interface — the core abstraction of claude-connector.
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
 * - Error conditions must throw {@link ClaudeConnectorError} subclasses.
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
   * The final event is always of type `'result'` or `'error'`.
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
 */
export interface ExecuteOptions {
  /** Working directory for the CLI process. */
  readonly cwd: string;

  /** Environment variables merged with process.env. */
  readonly env: Readonly<Record<string, string>>;

  /**
   * Data piped to the CLI's stdin.
   * Equivalent to `echo "data" | claude -p "prompt"`.
   */
  readonly input?: string;

  /**
   * System prompt for this execution.
   * CLI executor ignores this (it's in the args).
   * SDK executor uses it to override/prepend system instructions.
   */
  readonly systemPrompt?: string;
}
