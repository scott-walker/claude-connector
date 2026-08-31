import type {
  ClientOptions, QueryOptions, QueryResult, StreamEvent,
  AccountInfo, ModelInfo, SlashCommand, AgentInfo,
  McpServerStatus, McpSetServersResult, RewindFilesResult,
  McpServerConfig, McpSdkServerConfig, PermissionMode,
} from '../types/index.js';
import type {
  FlagSettings, McpPermissionModeOverride, ThinkingDisplay,
} from '../types/client.js';
import type {
  ContextUsage, InitializationResult, InterruptResult,
  McpPermissionModeOverrideResult, ReadFileResult,
  ReloadPluginsResult, ReloadSkillsResult, UsageReport,
} from '../types/result.js';
import type { SessionOptions } from '../types/session.js';
import type { ExecuteOptions, IExecutor } from '../executor/interface.js';
import { CliExecutor } from '../executor/cli-executor.js';
import { SdkExecutor, type InitStage } from '../executor/sdk-executor.js';
import { buildArgs, mergeOptions, resolveEnv } from '../builder/args-builder.js';
import { validateClientOptions, validateQueryOptions, validatePrompt } from '../utils/validation.js';
import {
  FORMAT_JSON,
  FORMAT_STREAM_JSON,
  DEFAULT_EXECUTABLE,
  INIT_EVENT_STAGE,
  INIT_EVENT_READY,
  INIT_EVENT_ERROR,
} from '../constants.js';
import { toSdkExecutorOptions } from './sdk-options.js';
import { Session } from './session.js';
import { StreamHandle } from './stream-handle.js';
import { ChatHandle } from './chat-handle.js';
import { Scheduler, type ScheduledJob } from '../scheduler/scheduler.js';

/**
 * Main entry point for kraube-konnektor.
 *
 * @example
 * ```ts
 * const claude = new Claude({ model: 'sonnet' })
 * const result = await claude.query('Fix bugs')
 *
 * // Streaming with fluent API
 * await claude.stream('Explain auth.ts')
 *   .on('text', (t) => process.stdout.write(t))
 *   .done()
 *
 * // Bidirectional chat
 * const chat = claude.chat()
 * await chat.send('What files are in src?')
 * await chat.send('Fix the largest one')
 * chat.end()
 * ```
 */
export class Claude {
  private readonly options: Readonly<ClientOptions>;
  private readonly executor: IExecutor;
  private readonly sdkExecutor: SdkExecutor | null = null;

  constructor(options: ClientOptions = {}, executor?: IExecutor) {
    validateClientOptions(options);
    this.options = Object.freeze({ ...options });

    const useSdk = options.useSdk !== false;

    if (executor) {
      this.executor = executor;
    } else if (useSdk) {
      this.sdkExecutor = new SdkExecutor(toSdkExecutorOptions(options));
      this.executor = this.sdkExecutor;
    } else {
      this.executor = new CliExecutor(options.executable);
    }
  }

  /**
   * Initialize the SDK session (warm up).
   * Only needed when `useSdk: true`. In CLI mode this is a no-op.
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
   */
  on(event: typeof INIT_EVENT_STAGE, listener: (stage: InitStage, message: string) => void): this;
  on(event: typeof INIT_EVENT_READY, listener: () => void): this;
  on(event: typeof INIT_EVENT_ERROR, listener: (error: Error) => void): this;
  on(event: string, listener: (...args: never[]) => void): this;
  on(event: string, listener: (...args: never[]) => void): this {
    if (this.sdkExecutor) {
      this.sdkExecutor.on(event as typeof INIT_EVENT_STAGE, listener as (stage: InitStage, message: string) => void);
    }
    return this;
  }

  /**
   * Execute a one-shot query and return the complete result.
   */
  async query(prompt: string, options?: QueryOptions): Promise<QueryResult> {
    validatePrompt(prompt);
    if (options) validateQueryOptions(options);

    const resolved = mergeOptions(this.options, options, {
      prompt,
      outputFormat: FORMAT_JSON,
    });
    const args = buildArgs(resolved);
    const env = resolveEnv(this.options, options);

    return this.executor.execute(args, {
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
  }

  /**
   * Execute a query with streaming response.
   * Returns a {@link StreamHandle} with fluent callbacks, Node.js stream support,
   * and backward-compatible async iteration.
   */
  stream(prompt: string, options?: QueryOptions): StreamHandle {
    validatePrompt(prompt);
    if (options) validateQueryOptions(options);

    const resolved = mergeOptions(this.options, options, {
      prompt,
      outputFormat: FORMAT_STREAM_JSON,
    });
    const args = buildArgs(resolved);
    const env = resolveEnv(this.options, options);

    const executor = this.executor;
    const execOpts: ExecuteOptions = {
      // Same channels as query(): resolved flags in `args`, raw prompt and
      // per-query overrides here, for the executor that cannot read argv.
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

    return new StreamHandle(() => executor.stream(args, execOpts));
  }

  /**
   * Open a bidirectional chat — a persistent CLI process for real-time conversation.
   * Uses `--input-format stream-json` for multi-turn dialogue over a single process.
   *
   * Unlike {@link Claude.query} and {@link Claude.stream}, chat never goes
   * through the executor: it owns its own process and each turn's prompt is
   * carried by `chat.send()`, so there is no prompt to hand over up front.
   */
  chat(options?: QueryOptions): ChatHandle {
    if (options) validateQueryOptions(options);

    const resolved = mergeOptions(this.options, options, {
      prompt: undefined as unknown as string,
      outputFormat: FORMAT_STREAM_JSON,
    });

    // Override: chat mode uses bidirectional stream-json
    const args = buildArgs({
      ...resolved,
      prompt: undefined,
      inputFormat: FORMAT_STREAM_JSON,
    });

    const env = resolveEnv(this.options, options);
    const executable = this.options.executable ?? DEFAULT_EXECUTABLE;

    return new ChatHandle(executable, args, {
      cwd: resolved.cwd,
      env: { ...process.env, ...env } as Record<string, string>,
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

  // ── SDK Control Methods ─────────────────────────────────────────
  // These methods delegate to the underlying SdkExecutor.
  // In CLI mode they throw an error.

  /**
   * Change the model for subsequent responses.
   * SDK mode only — throws in CLI mode.
   */
  async setModel(model?: string): Promise<void> {
    this.requireSdk('setModel');
    await this.sdkExecutor!.setModel(model);
  }

  /**
   * Change the permission mode for the session.
   * SDK mode only — throws in CLI mode.
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.requireSdk('setPermissionMode');
    await this.sdkExecutor!.setPermissionMode(mode);
  }

  /**
   * Change the thinking budget mid-session.
   * SDK mode only — throws in CLI mode.
   *
   * @param maxThinkingTokens - Token budget; `0` disables thinking, `null`
   *   clears the budget so the model's default maximum applies again. Any
   *   other value caps an adaptive budget.
   * @param thinkingDisplay - `'summarized'` to show a summary, `'omitted'` to
   *   hide the blocks, `null` to restore the default.
   *
   * @deprecated Prefer {@link ClientOptions.thinking} at construction; this
   *   exists for mid-session changes and mirrors the SDK's own deprecated
   *   control method.
   */
  async setMaxThinkingTokens(
    maxThinkingTokens: number | null,
    thinkingDisplay?: ThinkingDisplay | null,
  ): Promise<void> {
    this.requireSdk('setMaxThinkingTokens');
    await this.sdkExecutor!.setMaxThinkingTokens(maxThinkingTokens, thinkingDisplay);
  }

  /**
   * Apply settings to the flag layer — the highest-priority settings tier —
   * for the rest of the session. The mid-session twin of
   * {@link ClientOptions.settings}.
   * SDK mode only — throws in CLI mode.
   *
   * Shallow merge: keys you pass replace that key, keys you omit are left
   * alone, and an explicit `null` clears the key so the next tier down wins
   * again. Nothing is written to any settings file.
   *
   * @example
   * ```ts
   * await claude.applyFlagSettings({ effortLevel: 'high' })
   * await claude.applyFlagSettings({ effortLevel: null })  // back to settings
   * ```
   */
  async applyFlagSettings(settings: FlagSettings): Promise<void> {
    this.requireSdk('applyFlagSettings');
    await this.sdkExecutor!.applyFlagSettings(settings);
  }

  /**
   * Rewind files to their state at a specific user message.
   * Requires `enableFileCheckpointing: true`.
   * SDK mode only — throws in CLI mode.
   */
  async rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult> {
    this.requireSdk('rewindFiles');
    return this.sdkExecutor!.rewindFiles(userMessageId, options);
  }

  /**
   * Tell the session a file is already known to the caller, so the
   * Read-before-Edit guard accepts an edit the session never read itself.
   * SDK mode only — throws in CLI mode.
   *
   * @param path - File path, absolute or relative to cwd.
   * @param mtime - Modification time the caller observed, in milliseconds.
   */
  async seedReadState(path: string, mtime: number): Promise<void> {
    this.requireSdk('seedReadState');
    await this.sdkExecutor!.seedReadState(path, mtime);
  }

  /**
   * Read a file through the session, so the read honours the same permission
   * rules as the Read tool.
   * SDK mode only — throws in CLI mode.
   *
   * Returns `null` — never throws — on permission denial, a missing file, or a
   * transport error.
   *
   * @param path - File path, absolute or relative to cwd.
   * @param options - `maxBytes` caps the read (default 1 MB); pass
   *   `encoding: 'base64'` for binary files.
   */
  async readFile(
    path: string,
    options?: { maxBytes?: number; encoding?: 'utf-8' | 'base64' },
  ): Promise<ReadFileResult | null> {
    this.requireSdk('readFile');
    return this.sdkExecutor!.readFile(path, options);
  }

  /**
   * Stop a running subagent task.
   * SDK mode only — throws in CLI mode.
   */
  async stopTask(taskId: string): Promise<void> {
    this.requireSdk('stopTask');
    await this.sdkExecutor!.stopTask(taskId);
  }

  /**
   * Send the running tool call to the background — the Ctrl+B affordance.
   * SDK mode only — throws in CLI mode.
   *
   * @param toolUseId - Tool call to background. Omit for the current one.
   * @returns `true` when something was backgrounded.
   */
  async backgroundTasks(toolUseId?: string): Promise<boolean> {
    this.requireSdk('backgroundTasks');
    return this.sdkExecutor!.backgroundTasks(toolUseId);
  }

  /**
   * Dynamically set MCP servers for this session.
   * SDK mode only — throws in CLI mode.
   */
  async setMcpServers(servers: Record<string, McpServerConfig | McpSdkServerConfig>): Promise<McpSetServersResult> {
    this.requireSdk('setMcpServers');
    return this.sdkExecutor!.setMcpServers(servers);
  }

  /**
   * Reconnect a disconnected MCP server.
   * SDK mode only — throws in CLI mode.
   */
  async reconnectMcpServer(serverName: string): Promise<void> {
    this.requireSdk('reconnectMcpServer');
    await this.sdkExecutor!.reconnectMcpServer(serverName);
  }

  /**
   * Enable or disable an MCP server.
   * SDK mode only — throws in CLI mode.
   */
  async toggleMcpServer(serverName: string, enabled: boolean): Promise<void> {
    this.requireSdk('toggleMcpServer');
    await this.sdkExecutor!.toggleMcpServer(serverName, enabled);
  }

  /**
   * Pin one MCP server's permission mode, independent of the session's.
   * SDK mode only — throws in CLI mode.
   *
   * @param serverName - Server to pin.
   * @param mode - `'auto'` to let the CLI decide, `'default'` to always prompt,
   *   `null` to clear the pin.
   */
  async setMcpPermissionModeOverride(
    serverName: string,
    mode: McpPermissionModeOverride,
  ): Promise<McpPermissionModeOverrideResult> {
    this.requireSdk('setMcpPermissionModeOverride');
    return this.sdkExecutor!.setMcpPermissionModeOverride(serverName, mode);
  }

  /**
   * Get account information (email, org, subscription).
   * SDK mode only — throws in CLI mode.
   */
  async accountInfo(): Promise<AccountInfo> {
    this.requireSdk('accountInfo');
    return this.sdkExecutor!.accountInfo();
  }

  /**
   * Get available models with their capabilities.
   * SDK mode only — throws in CLI mode.
   */
  async supportedModels(): Promise<ModelInfo[]> {
    this.requireSdk('supportedModels');
    return this.sdkExecutor!.supportedModels();
  }

  /**
   * Get available slash commands.
   * SDK mode only — throws in CLI mode.
   */
  async supportedCommands(): Promise<SlashCommand[]> {
    this.requireSdk('supportedCommands');
    return this.sdkExecutor!.supportedCommands();
  }

  /**
   * Get available subagents.
   * SDK mode only — throws in CLI mode.
   */
  async supportedAgents(): Promise<AgentInfo[]> {
    this.requireSdk('supportedAgents');
    return this.sdkExecutor!.supportedAgents();
  }

  /**
   * Get MCP server connection statuses.
   * SDK mode only — throws in CLI mode.
   */
  async mcpServerStatus(): Promise<McpServerStatus[]> {
    this.requireSdk('mcpServerStatus');
    return this.sdkExecutor!.mcpServerStatus();
  }

  /**
   * What the session loaded when it started: commands, agents, models, output
   * styles and the signed-in account.
   * SDK mode only — throws in CLI mode.
   *
   * Cached from warm-up — this does not hit the control protocol. Use
   * {@link Claude.reinitialize} to re-request it.
   */
  async initializationResult(): Promise<InitializationResult> {
    this.requireSdk('initializationResult');
    return this.sdkExecutor!.initializationResult();
  }

  /**
   * Re-send `initialize` and refresh the cached result.
   * SDK mode only — throws in CLI mode.
   *
   * Use after a transport gap: it redelivers pending `canUseTool` /
   * `onUserDialog` requests and re-registers stdio hooks.
   */
  async reinitialize(): Promise<InitializationResult> {
    this.requireSdk('reinitialize');
    return this.sdkExecutor!.reinitialize();
  }

  /**
   * Reload plugins from disk and return what the session now has.
   * SDK mode only — throws in CLI mode.
   */
  async reloadPlugins(): Promise<ReloadPluginsResult> {
    this.requireSdk('reloadPlugins');
    return this.sdkExecutor!.reloadPlugins();
  }

  /**
   * Reload skills from disk and return the refreshed list.
   * SDK mode only — throws in CLI mode.
   */
  async reloadSkills(): Promise<ReloadSkillsResult> {
    this.requireSdk('reloadSkills');
    return this.sdkExecutor!.reloadSkills();
  }

  /**
   * Structured `/context` report — what is filling the context window right now.
   * SDK mode only — throws in CLI mode.
   *
   * @example
   * ```ts
   * const usage = await claude.getContextUsage()
   * console.log(`${usage.percentage}% of ${usage.rawMaxTokens}`)
   * ```
   */
  async getContextUsage(): Promise<ContextUsage> {
    this.requireSdk('getContextUsage');
    return this.sdkExecutor!.getContextUsage();
  }

  /**
   * Session cost totals plus plan rate-limit utilization — the structured form
   * of what `/usage` prints.
   * SDK mode only — throws in CLI mode.
   *
   * @experimental The SDK marks the underlying control request unstable; this
   *   wrapper keeps a stable name, but the payload may still change.
   */
  async usage(): Promise<UsageReport> {
    this.requireSdk('usage');
    return this.sdkExecutor!.usage();
  }

  /**
   * Attach an extra input stream to the running session.
   * SDK mode only — throws in CLI mode.
   *
   * Normal turns do not go through here — `query()` / `stream()` push onto the
   * session's own input. Use this to inject pre-built user messages
   * (attachments, caller-chosen uuids) alongside them.
   *
   * @param stream - Async iterable of SDK user messages.
   */
  async streamInput(stream: AsyncIterable<unknown>): Promise<void> {
    this.requireSdk('streamInput');
    await this.sdkExecutor!.streamInput(stream);
  }

  /**
   * Interrupt the current query execution.
   * SDK mode only — throws in CLI mode.
   *
   * @returns Which queued user messages survived the interrupt, or `undefined`
   *   on a CLI that predates the interrupt receipt protocol — the interrupt
   *   still happened, it just reported nothing.
   */
  async interrupt(): Promise<InterruptResult | undefined> {
    this.requireSdk('interrupt');
    return this.sdkExecutor!.interrupt();
  }

  private requireSdk(method: string): void {
    if (!this.sdkExecutor) {
      throw new Error(`${method}() is only available in SDK mode. Set useSdk: true (default) to use this method.`);
    }
  }
}
