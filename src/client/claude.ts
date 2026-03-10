import type { ClientOptions, QueryOptions, QueryResult, StreamEvent } from '../types/index.js';
import type { SessionOptions } from '../types/session.js';
import type { IExecutor } from '../executor/interface.js';
import { CliExecutor } from '../executor/cli-executor.js';
import { SdkExecutor, type InitStage, type SdkExecutorOptions } from '../executor/sdk-executor.js';
import { buildArgs, mergeOptions, resolveEnv } from '../builder/args-builder.js';
import { validateClientOptions, validateQueryOptions, validatePrompt } from '../utils/validation.js';
import { Session } from './session.js';
import { Scheduler, type ScheduledJob } from '../scheduler/scheduler.js';

/**
 * Main entry point for claude-connector.
 *
 * `Claude` is a **facade** that orchestrates the executor, argument builder,
 * and parsers behind a clean, minimal API.
 *
 * ## Execution modes
 *
 * - **CLI mode** (default): each query spawns a new `claude -p` process.
 *   Simple, no warm-up needed, but slower for interactive use.
 *
 * - **SDK mode** (`useSdk: true`): creates a persistent session via the
 *   Claude Agent SDK. First query requires warm-up (~5-10s), but subsequent
 *   queries are near-instant. Best for interactive and high-throughput use.
 *
 * @example
 * ```ts
 * // CLI mode (default)
 * const claude = new Claude({ model: 'sonnet' })
 *
 * // SDK mode (persistent session, fast queries)
 * const claude = new Claude({ useSdk: true, model: 'sonnet' })
 * claude.on('init:stage', (stage, msg) => console.log(`[${stage}] ${msg}`))
 * await claude.init()  // warm up once
 * const result = await claude.query('Fix bugs')  // fast!
 * ```
 */
export class Claude {
  /** Frozen client-level options. */
  private readonly options: Readonly<ClientOptions>;

  /** Executor responsible for running CLI commands. */
  private readonly executor: IExecutor;

  /** SdkExecutor reference (only when useSdk: true) for lifecycle control. */
  private readonly sdkExecutor: SdkExecutor | null = null;

  constructor(options: ClientOptions = {}, executor?: IExecutor) {
    validateClientOptions(options);
    this.options = Object.freeze({ ...options });

    if (executor) {
      this.executor = executor;
    } else if (options.useSdk) {
      const sdkOpts: SdkExecutorOptions = {
        model: options.model,
        pathToClaudeCodeExecutable: options.executable,
        permissionMode: options.permissionMode,
        allowedTools: options.allowedTools ? [...options.allowedTools] : undefined,
        disallowedTools: options.disallowedTools ? [...options.disallowedTools] : undefined,
        env: options.env,
      };
      this.sdkExecutor = new SdkExecutor(sdkOpts);
      this.executor = this.sdkExecutor;
    } else {
      this.executor = new CliExecutor(options.executable);
    }
  }

  /**
   * Initialize the SDK session (warm up).
   *
   * Only needed when `useSdk: true`. In CLI mode this is a no-op.
   *
   * Subscribe to initialization events before calling:
   * ```ts
   * claude.on('init:stage', (stage, message) => {
   *   console.log(`[${stage}] ${message}`)
   * })
   * claude.on('init:ready', () => console.log('Ready!'))
   * claude.on('init:error', (err) => console.error(err))
   *
   * await claude.init()
   * ```
   *
   * Safe to call multiple times — only initializes once.
   */
  async init(): Promise<void> {
    if (this.sdkExecutor) {
      await this.sdkExecutor.init();
    }
  }

  /** Whether the SDK session is initialized and ready (always true for CLI mode). */
  get ready(): boolean {
    if (this.sdkExecutor) return this.sdkExecutor.ready;
    return true;
  }

  /**
   * Subscribe to initialization events.
   *
   * Events:
   * - `init:stage` `(stage: InitStage, message: string)` — progress updates
   *    Stages: `'importing'` → `'creating'` → `'connecting'` → `'ready'`
   * - `init:ready` — session is warm and queries will be fast
   * - `init:error` `(error: Error)` — initialization failed
   *
   * Only meaningful when `useSdk: true`. In CLI mode, listeners are never called.
   */
  on(event: 'init:stage', listener: (stage: InitStage, message: string) => void): this;
  on(event: 'init:ready', listener: () => void): this;
  on(event: 'init:error', listener: (error: Error) => void): this;
  on(event: string, listener: (...args: never[]) => void): this;
  on(event: string, listener: (...args: never[]) => void): this {
    if (this.sdkExecutor) {
      this.sdkExecutor.on(event as 'init:stage', listener as (stage: InitStage, message: string) => void);
    }
    return this;
  }

  /**
   * Execute a one-shot query and return the complete result.
   *
   * In SDK mode, auto-initializes if `init()` hasn't been called yet.
   */
  async query(prompt: string, options?: QueryOptions): Promise<QueryResult> {
    validatePrompt(prompt);
    if (options) validateQueryOptions(options);

    const resolved = mergeOptions(this.options, options, {
      prompt,
      outputFormat: 'json',
    });
    const args = buildArgs(resolved);
    const env = resolveEnv(this.options, options);

    return this.executor.execute(args, {
      cwd: resolved.cwd,
      env,
      input: options?.input,
    });
  }

  /**
   * Execute a query with streaming response.
   *
   * Returns an async iterable that yields events as they arrive.
   * The final event is always `type: 'result'` or `type: 'error'`.
   */
  async *stream(prompt: string, options?: QueryOptions): AsyncIterable<StreamEvent> {
    validatePrompt(prompt);
    if (options) validateQueryOptions(options);

    const resolved = mergeOptions(this.options, options, {
      prompt,
      outputFormat: 'stream-json',
    });
    const args = buildArgs(resolved);
    const env = resolveEnv(this.options, options);

    yield* this.executor.stream(args, {
      cwd: resolved.cwd,
      env,
      input: options?.input,
    });
  }

  /**
   * Create a session for multi-turn conversation.
   */
  session(sessionOptions?: SessionOptions): Session {
    return new Session(this.options, this.executor, sessionOptions);
  }

  /**
   * Schedule a recurring query (equivalent of /loop).
   */
  loop(interval: string | number, prompt: string, options?: QueryOptions): ScheduledJob {
    const scheduler = new Scheduler(this);
    return scheduler.schedule(interval, prompt, options);
  }

  /**
   * Run multiple queries in parallel.
   */
  async parallel(
    queries: readonly { prompt: string; options?: QueryOptions }[],
  ): Promise<QueryResult[]> {
    return Promise.all(
      queries.map(({ prompt, options }) => this.query(prompt, options)),
    );
  }

  /**
   * Abort any running execution on the underlying executor.
   */
  abort(): void {
    this.executor.abort?.();
  }

  /**
   * Close the SDK session and free resources.
   * Only needed when `useSdk: true`. In CLI mode this is a no-op.
   */
  close(): void {
    if (this.sdkExecutor) {
      this.sdkExecutor.close();
    }
  }

  /**
   * Access the underlying executor (for advanced use / testing).
   */
  getExecutor(): IExecutor {
    return this.executor;
  }
}
