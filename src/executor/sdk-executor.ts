import { EventEmitter } from 'node:events';
import type {
  QueryResult, StreamEvent, TokenUsage,
  AccountInfo, ModelInfo, SlashCommand, AgentInfo,
  McpServerStatus, McpSetServersResult, RewindFilesResult,
  McpServerConfig, McpSdkServerConfig,
} from '../types/index.js';
import type {
  CanUseTool, ThinkingConfig, HookEvent, HookCallbackMatcher,
  OnElicitation, PermissionMode,
} from '../types/client.js';
import type { IExecutor, ExecuteOptions } from './interface.js';
import { CliExecutionError } from '../errors/errors.js';
import {
  INIT_IMPORTING,
  INIT_CREATING,
  INIT_CONNECTING,
  INIT_READY,
  DEFAULT_MODEL,
  INIT_EVENT_STAGE,
  INIT_EVENT_READY,
  INIT_EVENT_ERROR,
  SYSTEM_INIT,
  EVENT_SYSTEM,
  EVENT_RESULT,
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_TASK_STARTED,
  EVENT_TASK_PROGRESS,
  EVENT_TASK_NOTIFICATION,
  EVENT_RATE_LIMIT,
  SDK_RATE_LIMIT_EVENT,
  ROLE_ASSISTANT,
  KEY_MESSAGE,
  KEY_CONTENT,
  KEY_TYPE,
  KEY_TEXT,
  BLOCK_TOOL_USE,
  KEY_NAME,
  KEY_INPUT,
  KEY_RESULT,
  KEY_SESSION_ID,
  KEY_USAGE,
  KEY_INPUT_TOKENS,
  KEY_OUTPUT_TOKENS,
  KEY_TOTAL_COST,
  KEY_DURATION,
  KEY_MODEL,
  KEY_TOOLS,
  KEY_SUBTYPE,
  KEY_STRUCTURED_OUTPUT,
  FLAGS_WITH_VALUE,
  FORMAT_JSON,
  FORMAT_STREAM_JSON,
  DEFAULT_INIT_TIMEOUT_MS,
} from '../constants.js';

// Dynamic import types — avoid hard crash if SDK not installed
type SDKModule = typeof import('@anthropic-ai/claude-agent-sdk');
type SDKQuery = import('@anthropic-ai/claude-agent-sdk').Query;
type SDKOptions = import('@anthropic-ai/claude-agent-sdk').Options;
type SDKMessage = import('@anthropic-ai/claude-agent-sdk').SDKMessage;
type SDKUserMessage = import('@anthropic-ai/claude-agent-sdk').SDKUserMessage;

/**
 * Initialization stages emitted during SDK warm-up.
 */
export type InitStage =
  | typeof INIT_IMPORTING   // Loading SDK module
  | typeof INIT_CREATING    // Creating query via query()
  | typeof INIT_CONNECTING  // Waiting for first system message (init)
  | typeof INIT_READY;      // Session is warm and ready for queries

/**
 * Events emitted by SdkExecutor.
 */
export interface SdkExecutorEvents {
  /** Emitted as initialization progresses through stages. */
  [INIT_EVENT_STAGE]: [InitStage, string];
  /** Emitted once the session is fully warmed up. */
  [INIT_EVENT_READY]: [];
  /** Emitted if initialization fails. */
  [INIT_EVENT_ERROR]: [Error];
}

/**
 * Executor implementation using the Claude Agent SDK (V1 query API).
 *
 * ## Why V1 instead of V2
 *
 * The V2 `SDKSession` API is marked as unstable (@alpha) and only exposes
 * `send()` + `stream()`. The V1 `query()` API returns a `Query` object with
 * full control methods: setModel, setPermissionMode, rewindFiles, stopTask,
 * setMcpServers, accountInfo, supportedModels, and more.
 *
 * ## Lifecycle
 *
 * ```
 * const executor = new SdkExecutor({ model: 'sonnet' })
 * await executor.init()          // warm up (emits stage events)
 * executor.execute(args, opts)   // fast — query already running
 * executor.execute(args, opts)   // fast — uses streamInput()
 * executor.close()               // cleanup
 * ```
 *
 * ## Multi-turn
 *
 * Uses `query.streamInput()` with a controllable async iterable.
 * Each `execute()` / `stream()` sends a user message and reads the response.
 */
export class SdkExecutor extends EventEmitter<SdkExecutorEvents> implements IExecutor {
  private sdkModule: SDKModule | null = null;
  private activeQuery: SDKQuery | null = null;
  private inputController: InputController | null = null;
  private _ready = false;
  private initPromise: Promise<void> | null = null;
  private readonly sdkOptions: SdkExecutorOptions;

  constructor(options: SdkExecutorOptions) {
    super();
    this.sdkOptions = options;
  }

  /** Whether the session is initialized and ready for queries. */
  get ready(): boolean {
    return this._ready;
  }

  /**
   * Initialize the SDK session (warm up).
   *
   * This imports the SDK, creates a persistent query, and waits for
   * the `system/init` message confirming Claude Code is ready.
   *
   * Call this once at startup. Subsequent queries will be fast.
   * Safe to call multiple times — only initializes once.
   */
  async init(): Promise<void> {
    if (this._ready) return;
    if (this.initPromise) return this.initPromise;

    const timeoutMs = this.sdkOptions.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
    this.initPromise = Promise.race([
      this.doInit(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new CliExecutionError(`SDK initialization timed out after ${timeoutMs}ms`, 1, '')),
          timeoutMs,
        );
      }),
    ]).catch((err) => {
      // Reset so that subsequent init() calls can retry
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }

  async execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult> {
    await this.ensureReady();

    const prompt = extractPrompt(args);
    const systemPrompt = options.systemPrompt;

    // Prepend system prompt context if provided per-query
    const effectivePrompt = systemPrompt
      ? `[System instruction: ${systemPrompt}]\n\n${prompt}`
      : prompt;

    // Send message via streamInput
    this.sendMessage(effectivePrompt);

    let resultText = '';
    let sessionId = '';
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let cost: number | null = null;
    let durationMs = 0;
    let structured: unknown = null;

    // Use manual .next() instead of for-await to avoid calling .return()
    // which would close the generator and prevent reuse for subsequent queries.
    await readUntilResult(this.activeQuery!, (msg) => {
      const parsed = this.mapMessage(msg as SDKMessage);
      if (!parsed) return false;

      if (parsed.type === EVENT_TEXT) {
        resultText += parsed.text;
      } else if (parsed.type === EVENT_RESULT) {
        resultText = parsed.text || resultText;
        sessionId = parsed.sessionId;
        usage = parsed.usage;
        cost = parsed.cost;
        durationMs = parsed.durationMs;
        structured = parsed.structured ?? null;
        return true; // stop
      }
      return false;
    });

    return {
      text: resultText,
      sessionId,
      usage,
      cost,
      durationMs,
      messages: [],
      structured,
      raw: {},
    };
  }

  async *stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent> {
    await this.ensureReady();

    const prompt = extractPrompt(args);
    const systemPrompt = options.systemPrompt;

    const effectivePrompt = systemPrompt
      ? `[System instruction: ${systemPrompt}]\n\n${prompt}`
      : prompt;

    this.sendMessage(effectivePrompt);

    // Use manual .next() to avoid closing the generator on break.
    // Yield events to the caller until we see a result event.
    while (true) {
      const { value: msg, done } = await this.activeQuery!.next();
      if (done) break;

      const event = this.mapMessage(msg);
      if (event) {
        yield event;
        if (event.type === EVENT_RESULT) break;
      }
    }
  }

  abort(): void {
    if (this.activeQuery) {
      this.activeQuery.close();
      this.activeQuery = null;
      this.inputController = null;
    }
    this._ready = false;
    this.initPromise = null;
  }

  /**
   * Close the SDK session and free resources.
   */
  close(): void {
    if (this.activeQuery) {
      this.activeQuery.close();
      this.activeQuery = null;
      this.inputController = null;
    }
    this._ready = false;
    this.initPromise = null;
  }

  // ── Control Methods (V1 Query API) ─────────────────────────────

  /**
   * Change the model for subsequent responses. SDK mode only.
   * @param model - Model identifier, or undefined for default.
   */
  async setModel(model?: string): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.setModel(model);
  }

  /**
   * Change the permission mode. SDK mode only.
   * @param mode - The new permission mode.
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.setPermissionMode(mode as 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk');
  }

  /**
   * Rewind files to their state at a specific user message.
   * Requires `enableFileCheckpointing: true`.
   */
  async rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult> {
    this.ensureQuery();
    return await this.activeQuery!.rewindFiles(userMessageId, options) as RewindFilesResult;
  }

  /**
   * Stop a running subagent task.
   * @param taskId - The task ID from task_started/task_notification events.
   */
  async stopTask(taskId: string): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.stopTask(taskId);
  }

  /**
   * Dynamically set MCP servers for this session.
   * Replaces current dynamic servers.
   */
  async setMcpServers(servers: Record<string, McpServerConfig | McpSdkServerConfig>): Promise<McpSetServersResult> {
    this.ensureQuery();
    return await this.activeQuery!.setMcpServers(servers as Record<string, import('@anthropic-ai/claude-agent-sdk').McpServerConfig>) as McpSetServersResult;
  }

  /**
   * Reconnect a disconnected MCP server.
   */
  async reconnectMcpServer(serverName: string): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.reconnectMcpServer(serverName);
  }

  /**
   * Enable or disable an MCP server.
   */
  async toggleMcpServer(serverName: string, enabled: boolean): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.toggleMcpServer(serverName, enabled);
  }

  /**
   * Get account information (email, org, subscription).
   */
  async accountInfo(): Promise<AccountInfo> {
    this.ensureQuery();
    return await this.activeQuery!.accountInfo() as AccountInfo;
  }

  /**
   * Get available models with their capabilities.
   */
  async supportedModels(): Promise<ModelInfo[]> {
    this.ensureQuery();
    return await this.activeQuery!.supportedModels() as ModelInfo[];
  }

  /**
   * Get available slash commands.
   */
  async supportedCommands(): Promise<SlashCommand[]> {
    this.ensureQuery();
    return await this.activeQuery!.supportedCommands() as SlashCommand[];
  }

  /**
   * Get available subagents.
   */
  async supportedAgents(): Promise<AgentInfo[]> {
    this.ensureQuery();
    return await this.activeQuery!.supportedAgents() as AgentInfo[];
  }

  /**
   * Get MCP server connection statuses.
   */
  async mcpServerStatus(): Promise<McpServerStatus[]> {
    this.ensureQuery();
    return await this.activeQuery!.mcpServerStatus() as McpServerStatus[];
  }

  /**
   * Interrupt the current query execution.
   */
  async interrupt(): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.interrupt();
  }

  // ── Private ───────────────────────────────────────────────────────

  private async doInit(): Promise<void> {
    try {
      // Stage 1: Import SDK
      this.emit(INIT_EVENT_STAGE, INIT_IMPORTING, 'Loading Claude Agent SDK...');
      this.sdkModule = await import('@anthropic-ai/claude-agent-sdk');

      // Stage 2: Create query via V1 API
      this.emit(INIT_EVENT_STAGE, INIT_CREATING, 'Creating persistent query...');

      // Set up a controllable input stream for multi-turn
      this.inputController = new InputController();

      const sdkOptions: SDKOptions = {
        model: this.sdkOptions.model ?? DEFAULT_MODEL,
        permissionMode: this.sdkOptions.permissionMode as SDKOptions['permissionMode'],
        allowedTools: this.sdkOptions.allowedTools as string[] | undefined,
        disallowedTools: this.sdkOptions.disallowedTools as string[] | undefined,
        canUseTool: this.sdkOptions.canUseTool as SDKOptions['canUseTool'],
        thinking: this.sdkOptions.thinking as SDKOptions['thinking'],
        enableFileCheckpointing: this.sdkOptions.enableFileCheckpointing,
        onElicitation: this.sdkOptions.onElicitation as SDKOptions['onElicitation'],
        includePartialMessages: this.sdkOptions.includePartialMessages,
        promptSuggestions: this.sdkOptions.promptSuggestions,
        agentProgressSummaries: this.sdkOptions.agentProgressSummaries,
        debug: this.sdkOptions.debug,
        debugFile: this.sdkOptions.debugFile,
      };

      if (this.sdkOptions.pathToClaudeCodeExecutable) {
        sdkOptions.pathToClaudeCodeExecutable = this.sdkOptions.pathToClaudeCodeExecutable;
      }

      if (this.sdkOptions.cwd) {
        sdkOptions.cwd = this.sdkOptions.cwd;
      }

      if (this.sdkOptions.systemPrompt) {
        sdkOptions.systemPrompt = this.sdkOptions.systemPrompt;
      }
      if (this.sdkOptions.appendSystemPrompt) {
        sdkOptions.systemPrompt = {
          type: 'preset',
          preset: 'claude_code',
          append: this.sdkOptions.appendSystemPrompt,
        };
      }

      if (this.sdkOptions.maxTurns !== undefined) {
        sdkOptions.maxTurns = this.sdkOptions.maxTurns;
      }
      if (this.sdkOptions.maxBudget !== undefined) {
        sdkOptions.maxBudgetUsd = this.sdkOptions.maxBudget;
      }

      if (this.sdkOptions.effortLevel) {
        sdkOptions.effort = this.sdkOptions.effortLevel as SDKOptions['effort'];
      }

      if (this.sdkOptions.env) {
        sdkOptions.env = { ...process.env, ...this.sdkOptions.env } as Record<string, string | undefined>;
      }

      if (this.sdkOptions.mcpServers) {
        sdkOptions.mcpServers = this.sdkOptions.mcpServers as Record<string, import('@anthropic-ai/claude-agent-sdk').McpServerConfig>;
      }

      if (this.sdkOptions.agents) {
        sdkOptions.agents = this.sdkOptions.agents as Record<string, import('@anthropic-ai/claude-agent-sdk').AgentDefinition>;
      }

      if (this.sdkOptions.agent) {
        sdkOptions.agent = this.sdkOptions.agent;
      }

      if (this.sdkOptions.tools) {
        sdkOptions.tools = this.sdkOptions.tools as string[];
      }

      if (this.sdkOptions.hookCallbacks) {
        sdkOptions.hooks = this.sdkOptions.hookCallbacks as SDKOptions['hooks'];
      }

      if (this.sdkOptions.betas) {
        sdkOptions.betas = this.sdkOptions.betas as SDKOptions['betas'];
      }

      if (this.sdkOptions.additionalDirs) {
        sdkOptions.additionalDirectories = this.sdkOptions.additionalDirs as string[];
      }

      if (this.sdkOptions.schema) {
        sdkOptions.outputFormat = {
          type: 'json_schema',
          schema: this.sdkOptions.schema,
        };
      }

      if (this.sdkOptions.noSessionPersistence === true) {
        sdkOptions.persistSession = false;
      }

      if (this.sdkOptions.fallbackModel) {
        sdkOptions.fallbackModel = this.sdkOptions.fallbackModel;
      }

      if (this.sdkOptions.strictMcpConfig) {
        sdkOptions.strictMcpConfig = true;
      }

      if (this.sdkOptions.stderr) {
        sdkOptions.stderr = this.sdkOptions.stderr;
      }

      if (this.sdkOptions.allowDangerouslySkipPermissions) {
        sdkOptions.allowDangerouslySkipPermissions = true;
      }

      if (this.sdkOptions.settingSources) {
        sdkOptions.settingSources = this.sdkOptions.settingSources as SDKOptions['settingSources'];
      }

      if (this.sdkOptions.settings !== undefined) {
        sdkOptions.settings = this.sdkOptions.settings as SDKOptions['settings'];
      }

      if (this.sdkOptions.plugins) {
        sdkOptions.plugins = this.sdkOptions.plugins as SDKOptions['plugins'];
      }

      if (this.sdkOptions.spawnClaudeCodeProcess) {
        sdkOptions.spawnClaudeCodeProcess = this.sdkOptions.spawnClaudeCodeProcess as SDKOptions['spawnClaudeCodeProcess'];
      }

      // Create query with streaming input for multi-turn
      this.activeQuery = this.sdkModule.query({
        prompt: this.inputController.iterable,
        options: sdkOptions,
      });

      // Stage 3: Wait for init message
      this.emit(INIT_EVENT_STAGE, INIT_CONNECTING, 'Waiting for Claude Code to initialize...');

      // Send initial message to trigger initialization
      this.inputController.push('.');

      // Use manual .next() to avoid closing the generator via for-await's return().
      await readUntilResult(this.activeQuery!, (msg) => {
        if (msg.type === EVENT_SYSTEM && KEY_SUBTYPE in msg && (msg as Record<string, unknown>)[KEY_SUBTYPE] === SYSTEM_INIT) {
          const sysMsg = msg as Record<string, unknown>;
          this.emit(
            INIT_EVENT_STAGE,
            INIT_CONNECTING,
            `Connected: model=${sysMsg[KEY_MODEL]}, tools=${(sysMsg[KEY_TOOLS] as string[] | undefined)?.length ?? 0}`,
          );
        }
        return msg.type === EVENT_RESULT;
      });

      // Stage 4: Ready
      this._ready = true;
      this.emit(INIT_EVENT_STAGE, INIT_READY, 'Session is warm and ready');
      this.emit(INIT_EVENT_READY);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit(INIT_EVENT_ERROR, error);
      throw error;
    }
  }

  private async ensureReady(): Promise<void> {
    if (!this._ready) {
      await this.init();
    }
  }

  private ensureQuery(): void {
    if (!this.activeQuery) {
      throw new CliExecutionError('No active SDK query. Call init() first.', 1, '');
    }
  }

  private sendMessage(prompt: string): void {
    if (!this.inputController) {
      throw new CliExecutionError('No active input controller. Call init() first.', 1, '');
    }
    this.inputController.push(prompt);
  }

  /**
   * Map an SDK message to our StreamEvent type.
   */
  private mapMessage(msg: SDKMessage): StreamEvent | null {
    switch (msg.type) {
      case ROLE_ASSISTANT: {
        const assistantMsg = msg as Record<string, unknown>;
        const message = assistantMsg[KEY_MESSAGE] as Record<string, unknown> | undefined;
        const content = message?.[KEY_CONTENT] as Array<Record<string, unknown>> | undefined;
        if (!content?.length) return null;

        const lastBlock = content[content.length - 1]!;
        if (lastBlock[KEY_TYPE] === EVENT_TEXT && typeof lastBlock[KEY_TEXT] === 'string') {
          return { type: EVENT_TEXT, text: lastBlock[KEY_TEXT] };
        }
        if (lastBlock[KEY_TYPE] === BLOCK_TOOL_USE) {
          return {
            type: EVENT_TOOL_USE,
            toolName: String(lastBlock[KEY_NAME] ?? ''),
            toolInput: (lastBlock[KEY_INPUT] as Record<string, unknown>) ?? {},
          };
        }
        return null;
      }

      case EVENT_RESULT: {
        const result = msg as Record<string, unknown>;
        const usage = result[KEY_USAGE] as Record<string, unknown> | undefined;
        const subtype = result[KEY_SUBTYPE] as string | undefined;
        return {
          type: EVENT_RESULT,
          subtype: subtype === 'success' ? 'success' : subtype?.startsWith('error') ? 'error' : subtype ?? 'success',
          text: typeof result[KEY_RESULT] === 'string' ? result[KEY_RESULT] : '',
          sessionId: String(result[KEY_SESSION_ID] ?? ''),
          usage: {
            inputTokens: typeof usage?.[KEY_INPUT_TOKENS] === 'number' ? usage[KEY_INPUT_TOKENS] : 0,
            outputTokens: typeof usage?.[KEY_OUTPUT_TOKENS] === 'number' ? usage[KEY_OUTPUT_TOKENS] : 0,
          },
          cost: typeof result[KEY_TOTAL_COST] === 'number' ? result[KEY_TOTAL_COST] : null,
          durationMs: typeof result[KEY_DURATION] === 'number' ? result[KEY_DURATION] : 0,
          isError: result['is_error'] === true,
          stopReason: typeof result['stop_reason'] === 'string' ? result['stop_reason'] : null,
          numTurns: typeof result['num_turns'] === 'number' ? result['num_turns'] : undefined,
          structured: result[KEY_STRUCTURED_OUTPUT] ?? null,
        };
      }

      // Task lifecycle events
      case EVENT_SYSTEM: {
        const sysMsg = msg as Record<string, unknown>;
        const subtype = sysMsg[KEY_SUBTYPE] as string;

        if (subtype === 'task_started') {
          return {
            type: EVENT_TASK_STARTED,
            taskId: String(sysMsg['task_id'] ?? ''),
            toolUseId: sysMsg['tool_use_id'] as string | undefined,
            description: String(sysMsg['description'] ?? ''),
            taskType: sysMsg['task_type'] as string | undefined,
            prompt: sysMsg['prompt'] as string | undefined,
          };
        }

        if (subtype === 'task_progress') {
          const taskUsage = sysMsg['usage'] as Record<string, unknown> | undefined;
          return {
            type: EVENT_TASK_PROGRESS,
            taskId: String(sysMsg['task_id'] ?? ''),
            toolUseId: sysMsg['tool_use_id'] as string | undefined,
            description: String(sysMsg['description'] ?? ''),
            usage: {
              totalTokens: typeof taskUsage?.['total_tokens'] === 'number' ? taskUsage['total_tokens'] : 0,
              toolUses: typeof taskUsage?.['tool_uses'] === 'number' ? taskUsage['tool_uses'] : 0,
              durationMs: typeof taskUsage?.['duration_ms'] === 'number' ? taskUsage['duration_ms'] : 0,
            },
            lastToolName: sysMsg['last_tool_name'] as string | undefined,
            summary: sysMsg['summary'] as string | undefined,
          };
        }

        if (subtype === 'task_notification') {
          const taskUsage = sysMsg['usage'] as Record<string, unknown> | undefined;
          return {
            type: EVENT_TASK_NOTIFICATION,
            taskId: String(sysMsg['task_id'] ?? ''),
            toolUseId: sysMsg['tool_use_id'] as string | undefined,
            status: sysMsg['status'] as 'completed' | 'failed' | 'stopped',
            outputFile: String(sysMsg['output_file'] ?? ''),
            summary: String(sysMsg['summary'] ?? ''),
            usage: taskUsage ? {
              totalTokens: typeof taskUsage['total_tokens'] === 'number' ? taskUsage['total_tokens'] : 0,
              toolUses: typeof taskUsage['tool_uses'] === 'number' ? taskUsage['tool_uses'] : 0,
              durationMs: typeof taskUsage['duration_ms'] === 'number' ? taskUsage['duration_ms'] : 0,
            } : undefined,
          };
        }

        // Generic system event
        return {
          type: EVENT_SYSTEM,
          subtype: subtype ?? 'unknown',
          data: sysMsg as Record<string, unknown>,
        };
      }

      case SDK_RATE_LIMIT_EVENT: {
        const rlMsg = msg as Record<string, unknown>;
        const info = (rlMsg['rate_limit_info'] ?? {}) as Record<string, unknown>;
        return {
          type: EVENT_RATE_LIMIT,
          status: (info['status'] as 'allowed' | 'allowed_warning' | 'rejected') ?? 'allowed',
          resetsAt: typeof info['resetsAt'] === 'number' ? info['resetsAt'] : undefined,
          rateLimitType: typeof info['rateLimitType'] === 'string' ? info['rateLimitType'] : undefined,
          utilization: typeof info['utilization'] === 'number' ? info['utilization'] : undefined,
          data: info,
        };
      }

      default:
        // Forward unknown SDK message types as generic system events
        // so users can handle future SDK additions without connector updates
        return {
          type: EVENT_SYSTEM,
          subtype: String((msg as Record<string, unknown>)['type'] ?? 'unknown'),
          data: msg as Record<string, unknown>,
        };
    }
  }
}

/**
 * Options for SdkExecutor.
 */
export interface SdkExecutorOptions {
  /** Model to use. Default: 'sonnet'. */
  readonly model?: string;

  /** Path to Claude Code executable (for SDK internal use). */
  readonly pathToClaudeCodeExecutable?: string;

  /** Working directory. */
  readonly cwd?: string;

  /** Permission mode. */
  readonly permissionMode?: string;

  /** Auto-approved tools. */
  readonly allowedTools?: readonly string[];

  /** Denied tools. */
  readonly disallowedTools?: readonly string[];

  /** Extra environment variables. */
  readonly env?: Readonly<Record<string, string>>;

  /** System prompt for the session. */
  readonly systemPrompt?: string;

  /** Append to the default system prompt. */
  readonly appendSystemPrompt?: string;

  /** Maximum agentic turns. */
  readonly maxTurns?: number;

  /** Maximum budget in USD. */
  readonly maxBudget?: number;

  /** Effort level. */
  readonly effortLevel?: string;

  /** Fallback model. */
  readonly fallbackModel?: string;

  /** Programmatic permission callback. */
  readonly canUseTool?: CanUseTool;

  /** Thinking/reasoning config. */
  readonly thinking?: ThinkingConfig;

  /** Enable file checkpointing for rewindFiles(). */
  readonly enableFileCheckpointing?: boolean;

  /** MCP elicitation callback. */
  readonly onElicitation?: OnElicitation;

  /** JS hook callbacks (all 21 event types). */
  readonly hookCallbacks?: Partial<Record<HookEvent, readonly HookCallbackMatcher[]>>;

  /** MCP server configurations (including SDK in-process servers). */
  readonly mcpServers?: Readonly<Record<string, McpServerConfig | McpSdkServerConfig>>;

  /** Custom agent definitions. */
  readonly agents?: Readonly<Record<string, unknown>>;

  /** Main agent name. */
  readonly agent?: string;

  /** Available tools restriction. */
  readonly tools?: readonly string[];

  /** Additional directories. */
  readonly additionalDirs?: readonly string[];

  /** JSON Schema for structured output. */
  readonly schema?: Record<string, unknown>;

  /** Disable session persistence. */
  readonly noSessionPersistence?: boolean;

  /** Strict MCP config mode. */
  readonly strictMcpConfig?: boolean;

  /** Beta features. */
  readonly betas?: readonly string[];

  /** Include partial messages during streaming. */
  readonly includePartialMessages?: boolean;

  /** Enable prompt suggestions. */
  readonly promptSuggestions?: boolean;

  /** Enable progress summaries for subagents. */
  readonly agentProgressSummaries?: boolean;

  /** Enable debug logging. */
  readonly debug?: boolean;

  /** Debug log file path. */
  readonly debugFile?: string;

  /** Callback for stderr output. */
  readonly stderr?: (data: string) => void;

  /** Safety flag for bypassPermissions mode. */
  readonly allowDangerouslySkipPermissions?: boolean;

  /** Which filesystem settings to load ('user', 'project', 'local'). */
  readonly settingSources?: readonly string[];

  /** Inline settings object or path to settings JSON file. */
  readonly settings?: string | Record<string, unknown>;

  /** Plugin configurations. */
  readonly plugins?: readonly { type: 'local'; path: string }[];

  /** Custom spawn function for VMs/containers. */
  readonly spawnClaudeCodeProcess?: (options: unknown) => unknown;

  /** Timeout for SDK initialization in milliseconds. Default: 120000 (2 minutes). */
  readonly initTimeoutMs?: number;
}

/**
 * Read messages from an async generator using manual .next() calls.
 * This avoids for-await's implicit .return() call on break, which would
 * close the generator and prevent reuse for subsequent queries.
 *
 * @param gen - The async generator to read from.
 * @param onMessage - Callback for each message. Return true to stop reading.
 */
async function readUntilResult(
  gen: AsyncGenerator<unknown, void>,
  onMessage: (msg: Record<string, unknown>) => boolean,
): Promise<void> {
  while (true) {
    const { value, done } = await gen.next();
    if (done) break;
    if (onMessage(value as Record<string, unknown>)) break;
  }
}

/**
 * Extract the prompt string from a CLI args array.
 * In our args format, the prompt is the first positional argument
 * (after --print and --output-format flags).
 */
function extractPrompt(args: readonly string[]): string {
  // The prompt is typically the argument right after '--print', '--output-format', 'json/stream-json'
  // In buildArgs: ['--print', '--output-format', 'json', '--verbose'?, <prompt>, ...flags]
  // Find the first arg that doesn't start with '--' and isn't a flag value
  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg.startsWith('--')) {
      // Flags that take a value
      if ((FLAGS_WITH_VALUE as readonly string[]).includes(arg)) {
        skipNext = true;
      }
      continue;
    }
    // Skip format values
    if (arg === FORMAT_JSON || arg === FORMAT_STREAM_JSON || arg === 'text') continue;
    // This should be the prompt
    return arg;
  }
  return '';
}

/**
 * Controllable async iterable for sending user messages to the V1 query API.
 * Allows pushing messages that are consumed by `query.streamInput()`.
 */
class InputController {
  private queue: string[] = [];
  private resolve: ((value: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;

  /** Push a user message to be consumed by the query. */
  push(message: string): void {
    const userMsg: SDKUserMessage = {
      type: 'user' as const,
      message: { role: 'user' as const, content: message },
      parent_tool_use_id: null,
      session_id: '',
    };

    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r({ value: userMsg, done: false });
    } else {
      this.queue.push(message);
    }
  }

  /** Close the input stream. */
  close(): void {
    this.closed = true;
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r({ value: undefined as unknown as SDKUserMessage, done: true });
    }
  }

  /** AsyncIterable for the query's prompt parameter. */
  get iterable(): AsyncIterable<SDKUserMessage> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<SDKUserMessage>> {
            if (self.queue.length > 0) {
              const message = self.queue.shift()!;
              const userMsg: SDKUserMessage = {
                type: 'user' as const,
                message: { role: 'user' as const, content: message },
                parent_tool_use_id: null,
                session_id: '',
              };
              return Promise.resolve({ value: userMsg, done: false });
            }
            if (self.closed) {
              return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
            }
            return new Promise((resolve) => {
              self.resolve = resolve;
            });
          },
        };
      },
    };
  }
}
