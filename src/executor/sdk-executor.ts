import { EventEmitter } from 'node:events';
import type {
  QueryResult, StreamEvent, TokenUsage,
  AccountInfo, ModelInfo, SlashCommand, AgentInfo,
  McpServerStatus, McpSetServersResult, RewindFilesResult,
  ContextUsage, ContextUsageCategory, DeferredToolUse,
  FastModeState, InitializationResult, InterruptResult, McpPermissionModeOverrideResult,
  MessageOrigin, ModelUsageEntry, PermissionDenial, RateLimitStatus, RateLimitType,
  RateLimitWindow, RateLimitWindows, ReadFileResult, ReloadPluginsResult,
  ReloadSkillsResult, ResultSubtype, TerminalReason, UsageBehaviorWindow, UsageReport,
} from '../types/result.js';
import type {
  CanUseTool, EffortLevel, FlagSettings, HookEvent, HookCallbackMatcher,
  McpPermissionModeOverride, McpServerConfig, McpSdkServerConfig,
  OnElicitation, OnUserDialog, PermissionMode, PluginConfig, SandboxConfig,
  ThinkingConfig, ThinkingDisplay, ToolConfig, ToolsPresetConfig,
} from '../types/client.js';
import type { Settings } from '../types/settings.js';
import type { SessionStore, SessionStoreFlush } from '../types/session.js';
import type { IExecutor, ExecuteOptions } from './interface.js';
import { CliExecutionError } from '../errors/errors.js';
import { mapToolResultContent } from '../parser/content-blocks.js';
import {
  INIT_IMPORTING,
  INIT_CREATING,
  INIT_CONNECTING,
  INIT_READY,
  DEFAULT_MODEL,
  INIT_EVENT_STAGE,
  INIT_EVENT_READY,
  INIT_EVENT_ERROR,
  EVENT_SYSTEM,
  EVENT_RESULT,
  EVENT_ERROR,
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_TOOL_RESULT,
  EVENT_TASK_STARTED,
  EVENT_TASK_PROGRESS,
  EVENT_TASK_NOTIFICATION,
  EVENT_TASK_UPDATED,
  EVENT_BACKGROUND_TASKS_CHANGED,
  EVENT_RATE_LIMIT,
  EVENT_TOOL_PROGRESS,
  EVENT_TOOL_USE_SUMMARY,
  EVENT_AUTH_STATUS,
  EVENT_HOOK_STARTED,
  EVENT_HOOK_PROGRESS,
  EVENT_HOOK_RESPONSE,
  EVENT_FILES_PERSISTED,
  EVENT_COMPACT_BOUNDARY,
  EVENT_CONTEXT_USAGE,
  EVENT_LOCAL_COMMAND_OUTPUT,
  EVENT_THINKING,
  EVENT_THINKING_TOKENS,
  EVENT_API_RETRY,
  EVENT_MODEL_REFUSAL_FALLBACK,
  EVENT_MODEL_REFUSAL_NO_FALLBACK,
  EVENT_SESSION_STATE_CHANGED,
  EVENT_STATUS,
  EVENT_WORKER_SHUTTING_DOWN,
  EVENT_CONVERSATION_RESET,
  EVENT_MIRROR_ERROR,
  EVENT_INIT,
  EVENT_PERMISSION_DENIED,
  EVENT_NOTIFICATION,
  EVENT_INFORMATIONAL,
  EVENT_PROMPT_SUGGESTION,
  EVENT_PARTIAL_MESSAGE,
  EVENT_MEMORY_RECALL,
  EVENT_COMMANDS_CHANGED,
  EVENT_PLUGIN_INSTALL,
  EVENT_ELICITATION_COMPLETE,
  EVENT_CONTROL_REQUEST_PROGRESS,
  SDK_RATE_LIMIT_EVENT,
  SDK_STREAM_EVENT,
  ROLE_ASSISTANT,
  ROLE_USER,
  BLOCK_TEXT,
  BLOCK_TOOL_USE,
  BLOCK_TOOL_RESULT,
  BLOCK_THINKING,
  BLOCK_REDACTED_THINKING,
  PERMISSION_DEFAULT,
  PERMISSION_MANUAL,
  RESULT_SUCCESS,
  RESULT_ERROR_DURING_EXECUTION,
  RESUME_REJECTED_PREFIX,
  SYSTEM_UNKNOWN,
  KEY_MESSAGE,
  KEY_CONTENT,
  KEY_TYPE,
  KEY_TEXT,
  KEY_NAME,
  KEY_ID,
  KEY_INPUT,
  KEY_RESULT,
  KEY_SESSION_ID,
  KEY_USAGE,
  KEY_INPUT_TOKENS,
  KEY_OUTPUT_TOKENS,
  KEY_TOTAL_COST,
  KEY_DURATION,
  KEY_SUBTYPE,
  KEY_STRUCTURED_OUTPUT,
  KEY_ERROR,
  KEY_MODEL,
  KEY_TOOLS,
  KEY_IS_ERROR,
  KEY_STOP_REASON,
  KEY_NUM_TURNS,
  KEY_ERRORS,
  KEY_TERMINAL_REASON,
  KEY_PERMISSION_DENIALS,
  KEY_DEFERRED_TOOL_USE,
  KEY_DURATION_API,
  KEY_QUEUED_TURN_COUNT,
  KEY_TTFT_MS,
  KEY_API_ERROR_STATUS,
  KEY_FAST_MODE_STATE,
  KEY_FAST_MODE_DISABLED_REASON,
  KEY_ORIGIN,
  KEY_USER_MESSAGE_UUID,
  KEY_MODEL_USAGE,
  KEY_CACHE_CREATION_INPUT_TOKENS,
  KEY_CACHE_READ_INPUT_TOKENS,
  KEY_SERVER_TOOL_USE,
  KEY_SERVICE_TIER,
  KEY_TOTAL_TOKENS,
  KEY_TOOL_USES,
  KEY_WEB_SEARCH_REQUESTS,
  KEY_TOOL_NAME,
  KEY_TOOL_USE_ID,
  KEY_TOOL_INPUT,
  KEY_TOOL_USE_RESULT,
  KEY_PARENT_TOOL_USE_ID,
  KEY_IS_REPLAY,
  KEY_IS_SYNTHETIC,
  KEY_TASK_ID,
  KEY_TASK_TYPE,
  KEY_TASKS,
  KEY_PATCH,
  KEY_DESCRIPTION,
  KEY_SUBAGENT_TYPE,
  KEY_SUBAGENT_RETRY,
  KEY_IS_BACKGROUNDED,
  KEY_SPAWN_DEPTH,
  KEY_WORKFLOW_NAME,
  KEY_SKIP_TRANSCRIPT,
  KEY_AMBIENT,
  KEY_END_TIME,
  KEY_TOTAL_PAUSED_MS,
  KEY_HEARTBEAT,
  KEY_ATTEMPT,
  KEY_MAX_RETRIES,
  KEY_RETRY_DELAY_MS,
  KEY_ERROR_STATUS,
  KEY_ERROR_CATEGORY,
  KEY_REQUEST_ID,
  KEY_DIRECTION,
  KEY_SCOPE,
  KEY_ORIGINAL_MODEL,
  KEY_FALLBACK_MODEL,
  KEY_API_REFUSAL_CATEGORY,
  KEY_API_REFUSAL_EXPLANATION,
  KEY_RETRACTED_MESSAGE_UUIDS,
  KEY_REFUSED_USER_MESSAGE_UUID,
  KEY_AGENT_ID,
  KEY_DECISION_REASON,
  KEY_DECISION_REASON_TYPE,
  KEY_LEVEL,
  KEY_PREVENT_CONTINUATION,
  KEY_PRIORITY,
  KEY_COLOR,
  KEY_TIMEOUT_MS,
  KEY_KEY,
  KEY_SUGGESTION,
  KEY_STATE,
  KEY_STATUS,
  KEY_REASON,
  KEY_MODE,
  KEY_NEW_CONVERSATION_ID,
  KEY_MEMORIES,
  KEY_COMMANDS,
  KEY_PATH,
  KEY_VERSION,
  KEY_MCP_SERVER_NAME,
  KEY_ELICITATION_ID,
  KEY_THINKING,
  KEY_SIGNATURE,
  KEY_DATA,
  KEY_ESTIMATED_TOKENS,
  KEY_ESTIMATED_TOKENS_DELTA,
  KEY_EVENT,
  KEY_COMPACT_METADATA,
  KEY_TRIGGER,
  KEY_PRE_TOKENS,
  KEY_POST_TOKENS,
  KEY_PRESERVED_SEGMENT,
  KEY_PRESERVED_MESSAGES,
  KEY_COMPACT_RESULT,
  KEY_COMPACT_ERROR,
  KEY_CWD,
  KEY_API_KEY_SOURCE,
  KEY_PERMISSION_MODE,
  KEY_CLAUDE_CODE_VERSION,
  KEY_SLASH_COMMANDS,
  KEY_TERMINAL_SLASH_COMMANDS,
  KEY_MCP_SERVERS,
  KEY_OUTPUT_STYLE,
  KEY_SKILLS,
  KEY_PLUGINS,
  KEY_AGENTS,
  KEY_BETAS,
  KEY_EFFORT,
  KEY_CAPABILITIES,
  KEY_CONTEXT_USAGE,
  KEY_RAW_MAX_TOKENS,
  KEY_PERCENTAGE,
  KEY_OVER_LIMIT,
  KEY_TOKENS_OVER,
  KEY_KIND,
  KEY_CATEGORIES,
  KEY_MCP_TOOLS,
  KEY_MEMORY_FILES,
  KEY_TOKENS,
  KEY_RATE_LIMIT_INFO,
  KEY_RATE_LIMIT_TYPE,
  KEY_RESETS_AT,
  KEY_UTILIZATION,
  KEY_OVERAGE_STATUS,
  KEY_OVERAGE_RESETS_AT,
  KEY_OVERAGE_DISABLED_REASON,
  KEY_IS_USING_OVERAGE,
  KEY_OVERAGE_IN_USE,
  FLAGS_WITH_VALUE,
  FLAGS_WITH_OPTIONAL_VALUE,
  FLAGS_VARIADIC,
  FORMAT_JSON,
  FORMAT_STREAM_JSON,
  FORMAT_TEXT,
  PLUGIN_LOCAL,
  LIST_SEPARATOR,
  ABORT_MESSAGE,
  KEY_ABORTED,
  SYSTEM_PROMPT_SEPARATOR,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  DEFAULT_INIT_TIMEOUT_MS,
  CANCEL_RETRY_INTERVAL_MS,
  CANCEL_RETRY_LIMIT,
  TOOLS_PRESET_SENTINEL,
  PRESET_TYPE,
  PRESET_CLAUDE_CODE,
  SETTINGS_EFFORT_LEVEL,
  SETTINGS_FALLBACK_MODEL,
  SETTINGS_PERMISSIONS,
  PERMISSIONS_ALLOW,
  PERMISSIONS_DENY,
  PERMISSIONS_ADDITIONAL_DIRECTORIES,
  SESSION_STATE_IDLE,
} from '../constants.js';

// Dynamic import types — avoid hard crash if SDK not installed
type SDKModule = typeof import('@anthropic-ai/claude-agent-sdk');
type SDKQuery = import('@anthropic-ai/claude-agent-sdk').Query;
type SDKOptions = import('@anthropic-ai/claude-agent-sdk').Options;
type SDKMessage = import('@anthropic-ai/claude-agent-sdk').SDKMessage;
type SDKUserMessage = import('@anthropic-ai/claude-agent-sdk').SDKUserMessage;
type SDKPermissionMode = import('@anthropic-ai/claude-agent-sdk').PermissionMode;

/** Shapes of the control-protocol responses, taken from the SDK's own signatures. */
type SDKInitializeResponse = Awaited<ReturnType<SDKQuery['initializationResult']>>;
type SDKContextUsageResponse = Awaited<ReturnType<SDKQuery['getContextUsage']>>;
type SDKReloadPluginsResponse = Awaited<ReturnType<SDKQuery['reloadPlugins']>>;
type SDKUsageResponse = Awaited<
  ReturnType<SDKQuery['usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET']>
>;

/** Sentinel resolved by the abort watcher when a per-query signal fires. */
const ABORTED = Symbol('aborted');

/** Sentinel resolved when the post-result drain window closes. */
const DRAIN_EXPIRED = Symbol('drain-expired');

/**
 * Default post-result drain window, in milliseconds.
 *
 * `0` means "one event-loop turn": trailing frames the transport has already
 * delivered are read, nothing still in flight is waited for. See
 * {@link SdkExecutorOptions.postResultDrainMs}.
 */
const DEFAULT_POST_RESULT_DRAIN_MS = 0;

/** Restore function used when a query needed no session-level override. */
const NO_OVERRIDES = async (): Promise<void> => { /* nothing to restore */ };

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

/** A bounded window that ends the post-result drain of a turn. */
interface DrainWindow {
  /** Resolves with {@link DRAIN_EXPIRED} once the window closes. Never rejects. */
  readonly promise: Promise<typeof DRAIN_EXPIRED>;

  /** Cancels the underlying timer so a finished turn does not keep one armed. */
  readonly dispose: () => void;
}

/** Handle for the repeated cancel of an aborted turn. */
interface CancelRetries {
  /** Stops the retry timer. Safe to call more than once. */
  readonly dispose: () => void;
}

/** Thinking budget in the shape `Query.setMaxThinkingTokens()` accepts. */
interface ThinkingBudget {
  readonly tokens: number | null;
  readonly display: ThinkingDisplay | null;
}

/** One SDK message plus the library events it mapped to. */
interface MappedMessage {
  readonly source: SDKMessage;
  readonly events: readonly StreamEvent[];

  /**
   * Whether a cancel had already landed when this message was read. Events that
   * arrive after an abort are the tail of a turn the caller no longer wants.
   */
  readonly aborted: boolean;
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
 * executor.execute(args, opts)   // fast — same session, same process
 * executor.close()               // cleanup
 * ```
 *
 * ## Multi-turn
 *
 * The session is created once, with a controllable async iterable handed to
 * `query()` as its `prompt`. Each `execute()` / `stream()` pushes one user
 * message onto that iterable and reads the response off the same generator —
 * `Query.streamInput()` is *not* used for normal operation; it is exposed
 * separately for callers who want to attach a second input stream.
 */
export class SdkExecutor extends EventEmitter<SdkExecutorEvents> implements IExecutor {
  private sdkModule: SDKModule | null = null;
  private activeQuery: SDKQuery | null = null;
  private inputController: InputController | null = null;
  private _ready = false;
  private initPromise: Promise<void> | null = null;
  private readonly sdkOptions: SdkExecutorOptions;
  private initResult: InitializationResult | null = null;

  /**
   * Session-level state we mirror locally, because the SDK exposes setters but
   * no getters. Per-query overrides read these to know what to restore.
   */
  private currentModel: string;
  private currentPermissionMode: PermissionMode;
  private currentThinking: ThinkingBudget;

  /**
   * Mirror of the flag-settings layer — the tier `applyFlagSettings()` writes.
   *
   * Seeded from inline `settings` — object or serialized JSON, both of which
   * the SDK installs into that same tier. A `settings` *path* cannot be read
   * here, so keys it contains are invisible to the mirror and a per-query
   * override of one of them restores to `null` (clearing the flag layer)
   * rather than to the file's value. See {@link seedFlagSettings}.
   */
  private readonly currentFlagSettings: Record<string, unknown>;

  /**
   * A read started for the previous turn that its drain window outlived.
   *
   * Kept on the executor rather than in `readMessages`, so the message it is
   * about to deliver is picked up by the next turn instead of being dropped —
   * calling `next()` again would consume the message *after* it.
   */
  private pendingRead: Promise<IteratorResult<SDKMessage, void>> | null = null;

  constructor(options: SdkExecutorOptions) {
    super();
    this.sdkOptions = options;
    this.currentModel = options.model ?? DEFAULT_MODEL;
    this.currentPermissionMode = (options.permissionMode as PermissionMode | undefined) ?? PERMISSION_DEFAULT;
    this.currentThinking = thinkingBudgetOf(options.thinking)
      ?? { tokens: options.maxThinkingTokens ?? null, display: null };
    this.currentFlagSettings = seedFlagSettings(options.settings);
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
    // The timer must be cleared on success: an armed setTimeout keeps the event
    // loop referenced, so a script that finished its work would otherwise sit
    // idle until the (two-minute, by default) deadline elapsed.
    let timer: ReturnType<typeof setTimeout> | undefined;
    this.initPromise = Promise.race([
      this.doInit(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new CliExecutionError(`SDK initialization timed out after ${timeoutMs}ms`, 1, '')),
          timeoutMs,
        );
      }),
    ]).catch((err) => {
      // Reset so that subsequent init() calls can retry
      this.initPromise = null;
      throw err;
    }).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
    return this.initPromise;
  }

  /**
   * Run one turn and return the aggregated result.
   *
   * ## Per-query overrides
   *
   * The SDK session is created once, so the flags in `args` are inert here —
   * `options` is the channel that works. These overrides are bridged through
   * the control protocol and reverted afterwards:
   *
   * - `options.model` → `setModel()`
   * - `options.permissionMode` → `setPermissionMode()`
   * - `options.thinking` → `setMaxThinkingTokens()` (`'adaptive'` has no
   *   token-budget spelling and is skipped)
   * - `options.effortLevel` → `applyFlagSettings({ effortLevel })`
   * - `options.fallbackModel` → `applyFlagSettings({ fallbackModel })`
   * - `options.allowedTools` / `options.disallowedTools` /
   *   `options.additionalDirs` → `applyFlagSettings({ permissions })`, whose
   *   `allow` / `deny` / `additionalDirectories` lists are the settings-file
   *   spelling of those three flags
   *
   * The flag-settings tier is shallow-merged, so each of those keys is written
   * whole and put back the way {@link SdkExecutor.applyFlagSettings} last left
   * it (or cleared, when this session never set it).
   *
   * One caveat comes from the tier itself: a client-level `fallbackModel` is
   * handed to `query()`, which spells it as the process's own
   * `--fallback-model`, and a CLI flag outranks every settings tier. A
   * per-query `fallbackModel` therefore only takes effect on a client that did
   * not set one.
   *
   * ## Overrides the SDK fixes at session construction
   *
   * `maxTurns`, `maxBudget`, `taskBudgetTokens`, `schema`, `worktree`, `agent`,
   * `tools`, `files`, `planModeInstructions`, `skills` and `background` are
   * **ignored in SDK mode**: set them on the client, which passes them to
   * `query()` once. All but the last two do become per-query flags under
   * `useSdk: false`; `skills` has no flag on the binary and `background`
   * conflicts with `--print`, so neither is honoured per query in either mode.
   *
   * All but one of those have neither a mid-session control request nor a
   * settings key, so there is nothing to bridge them through. `agent` is the
   * exception — `Settings.agent` exists — and is left out on purpose: the main
   * thread's agent supplies its system prompt, which the session assembles once
   * at construction, so writing the key mid-turn would layer the new agent's
   * tool restrictions and model over the old agent's prompt. A half-applied
   * agent is worse than a documented one.
   *
   * `options.systemPrompt` is likewise construction-time in the SDK, so a
   * per-query value is prepended to the prompt text instead. A value equal to
   * the session's own system prompt is dropped rather than repeated — see
   * {@link ExecuteOptions.systemPrompt}.
   */
  async execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult> {
    await this.ensureReady();

    if (options.signal?.aborted) {
      throw new CliExecutionError(ABORT_MESSAGE, 1, '');
    }

    const effectivePrompt = buildPrompt(args, options, this.sdkOptions.systemPrompt);
    const restoreOverrides = await this.applyPerQueryOverrides(options);

    let resultText = '';
    let raw: Record<string, unknown> = {};
    let resultEvent: Extract<StreamEvent, { type: typeof EVENT_RESULT }> | null = null;

    try {
      this.sendMessage(effectivePrompt);

      const reader = this.readMessages(options.signal);
      let aborted = false;
      try {
        while (true) {
          const step = await reader.next();
          if (step.done) {
            aborted = step.value;
            break;
          }
          for (const event of step.value.events) {
            // Text is only the turn's answer up to the result; anything the
            // post-result drain picks up is informational, not more answer.
            if (event.type === EVENT_TEXT && resultEvent === null) {
              resultText += event.text;
            } else if (event.type === EVENT_RESULT) {
              resultEvent = event;
              resultText = event.text || resultText;
              raw = step.value.source as unknown as Record<string, unknown>;
            }
          }
        }
      } finally {
        // Releases the abort listener if the loop left early on an exception.
        await reader.return(aborted);
      }

      // `aborted` is only set for a cancel that landed BEFORE the result —
      // readMessages closes the post-result drain window without raising it,
      // so a late abort keeps the answer the turn already produced.
      if (aborted) {
        throw new CliExecutionError(ABORT_MESSAGE, 1, '');
      }
    } finally {
      await restoreOverrides();
    }

    return {
      text: resultText,
      sessionId: resultEvent?.sessionId ?? '',
      usage: resultEvent?.usage ?? { inputTokens: 0, outputTokens: 0 },
      cost: resultEvent?.cost ?? null,
      durationMs: resultEvent?.durationMs ?? 0,
      messages: [],
      structured: resultEvent?.structured ?? null,
      raw,
      subtype: resultEvent?.subtype,
      isError: resultEvent?.isError,
      errors: resultEvent?.errors,
      terminalReason: resultEvent?.terminalReason,
      modelUsage: resultEvent?.modelUsage,
      permissionDenials: resultEvent?.permissionDenials,
      deferredToolUse: resultEvent?.deferredToolUse,
      durationApiMs: resultEvent?.durationApiMs,
      queuedTurnCount: resultEvent?.queuedTurnCount,
      ttftMs: resultEvent?.ttftMs,
      apiErrorStatus: resultEvent?.apiErrorStatus,
      fastModeState: resultEvent?.fastModeState,
      origin: resultEvent?.origin,
    };
  }

  /**
   * Run one turn and yield events as they arrive.
   *
   * Same per-query override rules as {@link SdkExecutor.execute}.
   *
   * Ends shortly after the `result` event: the informational frames the SDK
   * documents as arriving *after* the result — `prompt_suggestion`, a trailing
   * `task_notification`, `session_state_changed` — are drained first, bounded
   * by {@link SdkExecutorOptions.postResultDrainMs}. When `options.signal`
   * fires, the running turn is interrupted and the remaining events (including
   * the aborted result) are still yielded, so the session stays in sync for the
   * next turn.
   */
  async *stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent> {
    await this.ensureReady();

    if (options.signal?.aborted) return;

    const effectivePrompt = buildPrompt(args, options, this.sdkOptions.systemPrompt);
    const restoreOverrides = await this.applyPerQueryOverrides(options);

    try {
      this.sendMessage(effectivePrompt);

      for await (const step of this.readMessages(options.signal)) {
        for (const event of step.events) {
          // Once a cancel has landed the turn is only winding down: its
          // remaining text is an answer the caller no longer wants. The result
          // still goes through, so the consumer sees the turn close rather than
          // the iterator ending mid-answer.
          if (step.aborted && event.type !== EVENT_RESULT) continue;
          yield event;
        }
      }
    } finally {
      await restoreOverrides();
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
    this.initResult = null;
    this.pendingRead = null;
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
    this.initResult = null;
    this.pendingRead = null;
  }

  // ── Control Methods (V1 Query API) ─────────────────────────────

  /**
   * Change the model for subsequent responses. SDK mode only.
   * @param model - Model identifier, or undefined for default.
   */
  async setModel(model?: string): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.setModel(model);
    this.currentModel = model ?? DEFAULT_MODEL;
  }

  /**
   * Change the permission mode. SDK mode only.
   *
   * `'manual'` is the CLI's spelling of `'default'` and is sent as `'default'`.
   *
   * @param mode - The new permission mode.
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.setPermissionMode(toSdkPermissionMode(mode)!);
    this.currentPermissionMode = mode;
  }

  /**
   * Change the thinking budget mid-session. SDK mode only.
   *
   * @param maxThinkingTokens - Token budget. `0` turns thinking off; `null`
   *   does *not* — it clears any previously set limit so the model's default
   *   budget applies again.
   * @param thinkingDisplay - `'summarized'` to show a summary, `'omitted'` to
   *   hide the blocks, `null` to restore the default.
   *
   * @deprecated Prefer the `thinking` option at construction; this mirrors the
   *   SDK's own deprecated control method and exists for mid-session changes.
   */
  async setMaxThinkingTokens(
    maxThinkingTokens: number | null,
    thinkingDisplay?: ThinkingDisplay | null,
  ): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.setMaxThinkingTokens(maxThinkingTokens, thinkingDisplay ?? null);
    this.currentThinking = { tokens: maxThinkingTokens, display: thinkingDisplay ?? null };
  }

  /**
   * Apply settings to the flag layer — the highest-priority settings tier —
   * for the rest of the session. SDK mode only.
   *
   * Shallow merge: keys you pass replace that key, keys you omit are left
   * alone, and an explicit `null` clears the key from the flag layer so the
   * next tier down wins again. Nothing is written to any settings file.
   *
   * The executor mirrors what it sends here, because per-query overrides use
   * the same tier and restore each key to the value this method last put there.
   *
   * @example
   * ```ts
   * await executor.applyFlagSettings({ effortLevel: 'high' })
   * await executor.applyFlagSettings({ effortLevel: null })  // back to settings
   * ```
   */
  async applyFlagSettings(settings: FlagSettings): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.applyFlagSettings(
      settings as Parameters<SDKQuery['applyFlagSettings']>[0],
    );
    this.mirrorFlagSettings(settings as Readonly<Record<string, unknown>>);
  }

  /**
   * Track a flag-layer merge locally, with the SDK's own semantics: `null`
   * clears the key, `undefined` is dropped by JSON serialization and therefore
   * changes nothing, anything else replaces the key wholesale.
   */
  private mirrorFlagSettings(settings: Readonly<Record<string, unknown>>): void {
    for (const [key, value] of Object.entries(settings)) {
      if (value === undefined) continue;
      if (value === null) delete this.currentFlagSettings[key];
      else this.currentFlagSettings[key] = value;
    }
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
   * Tell the session a file is already known to the caller, so the Read-before-Edit
   * guard accepts an edit the session never read itself. SDK mode only.
   *
   * @param path - File path, absolute or relative to cwd.
   * @param mtime - Modification time the caller observed, in milliseconds.
   */
  async seedReadState(path: string, mtime: number): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.seedReadState(path, mtime);
  }

  /**
   * Read a file through the session, so the read honours the same permission
   * rules as the Read tool. SDK mode only.
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
    this.ensureQuery();
    const response = await this.activeQuery!.readFile(path, options);
    return response === null ? null : (response as ReadFileResult);
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
   * Send the running tool call to the background — the Ctrl+B affordance.
   * SDK mode only.
   *
   * @param toolUseId - Tool call to background. Omit for the current one.
   * @returns `true` when something was backgrounded.
   */
  async backgroundTasks(toolUseId?: string): Promise<boolean> {
    this.ensureQuery();
    return await this.activeQuery!.backgroundTasks(toolUseId);
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
   * Pin one MCP server's permission mode, independent of the session's.
   * SDK mode only.
   *
   * @param serverName - Server to pin.
   * @param mode - `'auto'` to let the CLI decide, `'default'` to always prompt,
   *   `null` to clear the pin.
   */
  async setMcpPermissionModeOverride(
    serverName: string,
    mode: McpPermissionModeOverride,
  ): Promise<McpPermissionModeOverrideResult> {
    this.ensureQuery();
    return await this.activeQuery!.setMcpPermissionModeOverride(serverName, mode);
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
   * What the session loaded when it started: commands, agents, models, output
   * styles and the signed-in account. SDK mode only.
   *
   * Cached from warm-up — this does not hit the control protocol. Use
   * {@link SdkExecutor.reinitialize} to re-request it.
   */
  async initializationResult(): Promise<InitializationResult> {
    await this.ensureReady();
    if (!this.initResult) {
      this.initResult = mapInitializationResult(await this.activeQuery!.initializationResult());
    }
    return this.initResult;
  }

  /**
   * Re-send `initialize` and refresh the cached result. SDK mode only.
   *
   * Use after a transport gap: it redelivers pending `canUseTool` /
   * `onUserDialog` requests and re-registers stdio hooks.
   */
  async reinitialize(): Promise<InitializationResult> {
    this.ensureQuery();
    this.initResult = mapInitializationResult(await this.activeQuery!.reinitialize());
    return this.initResult;
  }

  /**
   * Reload plugins from disk and return what the session now has.
   * SDK mode only.
   */
  async reloadPlugins(): Promise<ReloadPluginsResult> {
    this.ensureQuery();
    return mapReloadPluginsResult(await this.activeQuery!.reloadPlugins());
  }

  /**
   * Reload skills from disk and return the refreshed list. SDK mode only.
   */
  async reloadSkills(): Promise<ReloadSkillsResult> {
    this.ensureQuery();
    const response = await this.activeQuery!.reloadSkills();
    return { skills: response.skills as SlashCommand[] };
  }

  /**
   * Structured `/context` report — what is filling the context window right now.
   * SDK mode only.
   *
   * @example
   * ```ts
   * const usage = await executor.getContextUsage()
   * console.log(`${usage.percentage}% of ${usage.rawMaxTokens}`)
   * ```
   */
  async getContextUsage(): Promise<ContextUsage> {
    this.ensureQuery();
    return mapContextUsageResponse(await this.activeQuery!.getContextUsage());
  }

  /**
   * Session cost totals plus plan rate-limit utilization — the structured form
   * of what `/usage` prints. SDK mode only.
   *
   * @experimental The SDK marks the underlying control request unstable and
   *   spells it `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`.
   *   This wrapper keeps a stable name; the payload may still change.
   */
  async usage(): Promise<UsageReport> {
    this.ensureQuery();
    return mapUsageReport(
      await this.activeQuery!.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET(),
    );
  }

  /**
   * Attach an extra input stream to the running session. SDK mode only.
   *
   * Normal turns do not go through here — `execute()` / `stream()` push onto
   * the iterable handed to `query()` at construction. Use this to inject
   * pre-built user messages (attachments, caller-chosen uuids) alongside them.
   *
   * @param stream - Async iterable of SDK user messages.
   */
  async streamInput(stream: AsyncIterable<unknown>): Promise<void> {
    this.ensureQuery();
    await this.activeQuery!.streamInput(stream as AsyncIterable<SDKUserMessage>);
  }

  /**
   * Interrupt the current query execution.
   *
   * @returns Which queued user messages survived the interrupt, or `undefined`
   *   on a CLI that predates the interrupt receipt protocol — the interrupt
   *   still happened, it just reported nothing.
   */
  async interrupt(): Promise<InterruptResult | undefined> {
    this.ensureQuery();
    const receipt = await this.activeQuery!.interrupt();
    if (!receipt) return undefined;
    return {
      stillQueued: receipt.still_queued ?? [],
      cancelled: receipt.cancelled,
    };
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
        permissionMode: toSdkPermissionMode(this.sdkOptions.permissionMode as PermissionMode | undefined),
        allowedTools: this.sdkOptions.allowedTools as string[] | undefined,
        disallowedTools: this.sdkOptions.disallowedTools as string[] | undefined,
        canUseTool: this.sdkOptions.canUseTool as SDKOptions['canUseTool'],
        thinking: this.sdkOptions.thinking as SDKOptions['thinking'],
        enableFileCheckpointing: this.sdkOptions.enableFileCheckpointing,
        onElicitation: this.sdkOptions.onElicitation as SDKOptions['onElicitation'],
        includePartialMessages: this.sdkOptions.includePartialMessages,
        includeHookEvents: this.sdkOptions.includeHookEvents,
        promptSuggestions: this.sdkOptions.promptSuggestions,
        agentProgressSummaries: this.sdkOptions.agentProgressSummaries,
        forwardSubagentText: this.sdkOptions.forwardSubagentText,
        perTaskStopAffordance: this.sdkOptions.perTaskStopAffordance,
        debugFile: this.sdkOptions.debugFile,
      };

      // `--debug [filter]` accepts a filter string on the CLI; the SDK option is
      // a plain boolean, so any non-false value turns debugging on.
      if (this.sdkOptions.debug !== undefined) {
        sdkOptions.debug = this.sdkOptions.debug !== false;
      }

      if (this.sdkOptions.pathToClaudeCodeExecutable) {
        sdkOptions.pathToClaudeCodeExecutable = this.sdkOptions.pathToClaudeCodeExecutable;
      }

      if (this.sdkOptions.runtime) {
        sdkOptions.executable = this.sdkOptions.runtime;
      }

      if (this.sdkOptions.runtimeArgs) {
        sdkOptions.executableArgs = [...this.sdkOptions.runtimeArgs];
      }

      if (this.sdkOptions.cwd) {
        sdkOptions.cwd = this.sdkOptions.cwd;
      }

      // Three mutually exclusive system-prompt forms, in precedence order:
      //   1. a custom prompt (string, or an array split on the cache boundary)
      //      replaces the preset entirely;
      //   2. the Claude Code preset, optionally appended to and/or stripped of
      //      its dynamic sections;
      //   3. nothing — whatever the CLI defaults to.
      const customSystemPrompt = this.sdkOptions.systemPrompt;
      const appendSystemPrompt = this.sdkOptions.appendSystemPrompt;
      const excludeDynamicSections = this.sdkOptions.excludeDynamicSystemPromptSections;
      if (customSystemPrompt !== undefined) {
        sdkOptions.systemPrompt = typeof customSystemPrompt === 'string'
          ? customSystemPrompt
          : [...customSystemPrompt];
      } else if (appendSystemPrompt !== undefined || excludeDynamicSections !== undefined) {
        sdkOptions.systemPrompt = {
          type: PRESET_TYPE,
          preset: PRESET_CLAUDE_CODE,
          ...(appendSystemPrompt !== undefined ? { append: appendSystemPrompt } : {}),
          ...(excludeDynamicSections !== undefined ? { excludeDynamicSections } : {}),
        };
      }

      if (this.sdkOptions.planModeInstructions !== undefined) {
        sdkOptions.planModeInstructions = this.sdkOptions.planModeInstructions;
      }

      if (this.sdkOptions.maxTurns !== undefined) {
        sdkOptions.maxTurns = this.sdkOptions.maxTurns;
      }
      if (this.sdkOptions.maxBudget !== undefined) {
        sdkOptions.maxBudgetUsd = this.sdkOptions.maxBudget;
      }
      if (this.sdkOptions.taskBudgetTokens !== undefined) {
        sdkOptions.taskBudget = { total: this.sdkOptions.taskBudgetTokens };
      }

      // Superseded by `thinking`; only honoured when that is unset.
      if (this.sdkOptions.maxThinkingTokens !== undefined && this.sdkOptions.thinking === undefined) {
        sdkOptions.maxThinkingTokens = this.sdkOptions.maxThinkingTokens;
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

      // `['default']` is the legacy CLI spelling of "every default tool"; the
      // SDK wants the preset object instead, so translate rather than forward a
      // literal tool named `default`.
      const tools = this.sdkOptions.tools;
      if (tools !== undefined) {
        if (!Array.isArray(tools)) {
          sdkOptions.tools = { type: PRESET_TYPE, preset: PRESET_CLAUDE_CODE };
        } else if (tools.length === 1 && tools[0] === TOOLS_PRESET_SENTINEL) {
          sdkOptions.tools = { type: PRESET_TYPE, preset: PRESET_CLAUDE_CODE };
        } else {
          sdkOptions.tools = [...(tools as readonly string[])];
        }
      }

      if (this.sdkOptions.toolAliases) {
        sdkOptions.toolAliases = { ...this.sdkOptions.toolAliases };
      }

      if (this.sdkOptions.toolConfig) {
        sdkOptions.toolConfig = this.sdkOptions.toolConfig as SDKOptions['toolConfig'];
      }

      if (this.sdkOptions.skills) {
        sdkOptions.skills = (this.sdkOptions.skills === 'all'
          ? 'all'
          : [...this.sdkOptions.skills]) as SDKOptions['skills'];
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

      if (this.sdkOptions.sessionStore) {
        sdkOptions.sessionStore = this.sdkOptions.sessionStore as SDKOptions['sessionStore'];
      }
      if (this.sdkOptions.sessionStoreFlush) {
        sdkOptions.sessionStoreFlush = this.sdkOptions.sessionStoreFlush;
      }
      if (this.sdkOptions.sessionStoreLoadTimeoutMs !== undefined) {
        sdkOptions.loadTimeoutMs = this.sdkOptions.sessionStoreLoadTimeoutMs;
      }

      if (this.sdkOptions.resume) {
        sdkOptions.resume = this.sdkOptions.resume;
      }
      if (this.sdkOptions.sessionId) {
        sdkOptions.sessionId = this.sdkOptions.sessionId;
      }
      if (this.sdkOptions.continueSession === true) {
        sdkOptions.continue = true;
      }
      // The SDK only accepts a fork alongside the session it forks from.
      if (this.sdkOptions.forkSession === true && (this.sdkOptions.resume || this.sdkOptions.sessionId)) {
        sdkOptions.forkSession = true;
      }
      if (this.sdkOptions.resumeSessionAt) {
        sdkOptions.resumeSessionAt = this.sdkOptions.resumeSessionAt;
      }
      if (this.sdkOptions.resumeDropsTurn) {
        sdkOptions.resumeDropsTurn = this.sdkOptions.resumeDropsTurn;
      }

      if (this.sdkOptions.abortController) {
        sdkOptions.abortController = this.sdkOptions.abortController;
      }

      if (this.sdkOptions.name) {
        sdkOptions.title = this.sdkOptions.name;
      }

      // `fallbackModel` is forwarded verbatim to `--fallback-model`, which takes
      // the whole ordered list comma-separated — exactly what CLI mode builds.
      const fallbackModel = this.sdkOptions.fallbackModel;
      if (typeof fallbackModel === 'string') {
        sdkOptions.fallbackModel = fallbackModel;
      } else if (fallbackModel !== undefined && fallbackModel.length > 0) {
        sdkOptions.fallbackModel = fallbackModel.join(LIST_SEPARATOR);
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

      if (this.sdkOptions.permissionPromptToolName) {
        sdkOptions.permissionPromptToolName = this.sdkOptions.permissionPromptToolName;
      }

      if (this.sdkOptions.onUserDialog) {
        sdkOptions.onUserDialog = this.sdkOptions.onUserDialog as SDKOptions['onUserDialog'];
      }
      if (this.sdkOptions.supportedDialogKinds) {
        sdkOptions.supportedDialogKinds = [...this.sdkOptions.supportedDialogKinds];
      }

      if (this.sdkOptions.sandbox) {
        sdkOptions.sandbox = this.sdkOptions.sandbox as SDKOptions['sandbox'];
      }

      if (this.sdkOptions.settingSources) {
        sdkOptions.settingSources = this.sdkOptions.settingSources as SDKOptions['settingSources'];
      }

      if (this.sdkOptions.settings !== undefined) {
        sdkOptions.settings = this.sdkOptions.settings as SDKOptions['settings'];
      }

      if (this.sdkOptions.managedSettings !== undefined) {
        sdkOptions.managedSettings = this.sdkOptions.managedSettings as SDKOptions['managedSettings'];
      }

      // The SDK's arg builder throws on any plugin entry that is not `'local'`;
      // the `'url'` form is a CLI flag (`--plugin-url`) with no SDK spelling, so
      // it is filtered out here instead of failing the whole session.
      if (this.sdkOptions.plugins) {
        const localPlugins = this.sdkOptions.plugins.filter(
          (plugin) => plugin.type === PLUGIN_LOCAL,
        );
        if (localPlugins.length > 0) {
          sdkOptions.plugins = localPlugins as SDKOptions['plugins'];
        }
      }

      if (this.sdkOptions.extraArgs) {
        sdkOptions.extraArgs = { ...this.sdkOptions.extraArgs };
      }

      if (this.sdkOptions.spawnClaudeCodeProcess) {
        sdkOptions.spawnClaudeCodeProcess = this.sdkOptions.spawnClaudeCodeProcess as SDKOptions['spawnClaudeCodeProcess'];
      }

      // Create query with streaming input for multi-turn
      this.activeQuery = this.sdkModule.query({
        prompt: this.inputController.iterable,
        options: sdkOptions,
      });

      // Stage 3: Wait for initialization via SDK control protocol
      this.emit(INIT_EVENT_STAGE, INIT_CONNECTING, 'Waiting for Claude Code to initialize...');

      // Use initializationResult() instead of sending a probe message.
      // This retrieves readiness data (models, commands, account) through
      // the SDK's control protocol without creating a phantom session.
      const rawInit = await this.activeQuery!.initializationResult();
      this.initResult = mapInitializationResult(rawInit);

      this.emit(
        INIT_EVENT_STAGE,
        INIT_CONNECTING,
        `Connected: model=${rawInit.models?.[0]?.value ?? 'unknown'}, commands=${rawInit.commands?.length ?? 0}`,
      );

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
   * Apply the per-query overrides the SDK can honour mid-session and return a
   * function that puts the session back the way it was.
   *
   * See {@link SdkExecutor.execute} for the full list, and for the overrides
   * the SDK fixes at session construction and therefore cannot bridge.
   */
  private async applyPerQueryOverrides(options: ExecuteOptions): Promise<() => Promise<void>> {
    const restores: Array<() => Promise<void>> = [];

    if (options.model !== undefined && options.model !== this.currentModel) {
      const previous = this.currentModel;
      await this.setModel(options.model);
      restores.push(async () => { await this.setModel(previous); });
    }

    if (options.permissionMode !== undefined && options.permissionMode !== this.currentPermissionMode) {
      const previous = this.currentPermissionMode;
      await this.setPermissionMode(options.permissionMode);
      restores.push(async () => { await this.setPermissionMode(previous); });
    }

    const thinking = thinkingBudgetOf(options.thinking);
    if (thinking && !sameThinking(thinking, this.currentThinking)) {
      const previous = this.currentThinking;
      await this.setMaxThinkingTokens(thinking.tokens, thinking.display);
      restores.push(async () => { await this.setMaxThinkingTokens(previous.tokens, previous.display); });
    }

    const flagOverrides = this.buildFlagOverrides(options);
    if (flagOverrides) {
      // Computed before the merge: each key restores to whatever the flag layer
      // held for it, or to `null` when this session never set it.
      const flagRestore = Object.fromEntries(
        Object.keys(flagOverrides).map((key) => [key, this.currentFlagSettings[key] ?? null]),
      );
      await this.applyFlagSettings(flagOverrides as FlagSettings);
      restores.push(async () => { await this.applyFlagSettings(flagRestore as FlagSettings); });
    }

    if (restores.length === 0) return NO_OVERRIDES;

    return async () => {
      for (const restore of restores.reverse()) {
        // Best effort: a failed restore must not mask the query's own outcome.
        try {
          await restore();
        } catch {
          // ignore
        }
      }
    };
  }

  /**
   * Collect the per-query overrides that reach the SDK through the flag
   * settings layer, or `null` when this turn needs none.
   *
   * `permissions` is written whole — the tier shallow-merges top-level keys —
   * so the sub-keys this turn does not override are copied from whatever the
   * layer already holds.
   */
  private buildFlagOverrides(options: ExecuteOptions): Record<string, unknown> | null {
    const overrides: Record<string, unknown> = {};

    if (options.effortLevel !== undefined) {
      overrides[SETTINGS_EFFORT_LEVEL] = options.effortLevel;
    }

    if (typeof options.fallbackModel === 'string') {
      overrides[SETTINGS_FALLBACK_MODEL] = [options.fallbackModel];
    } else if (options.fallbackModel !== undefined && options.fallbackModel.length > 0) {
      overrides[SETTINGS_FALLBACK_MODEL] = [...options.fallbackModel];
    }

    const permissions = { ...(asRecord(this.currentFlagSettings[SETTINGS_PERMISSIONS]) ?? {}) };
    let permissionsChanged = false;
    if (options.allowedTools !== undefined) {
      permissions[PERMISSIONS_ALLOW] = [...options.allowedTools];
      permissionsChanged = true;
    }
    if (options.disallowedTools !== undefined) {
      permissions[PERMISSIONS_DENY] = [...options.disallowedTools];
      permissionsChanged = true;
    }
    if (options.additionalDirs !== undefined) {
      permissions[PERMISSIONS_ADDITIONAL_DIRECTORIES] = [...options.additionalDirs];
      permissionsChanged = true;
    }
    if (permissionsChanged) {
      overrides[SETTINGS_PERMISSIONS] = permissions;
    }

    return Object.keys(overrides).length > 0 ? overrides : null;
  }

  /**
   * Read the session generator through the turn's `result` message and the
   * informational frames that trail it.
   *
   * Uses manual `.next()` rather than `for await`, whose implicit `.return()`
   * on break would close the generator and make the session unusable for the
   * next turn.
   *
   * ## Post-result drain
   *
   * `result` is not the last frame of a turn: the SDK documents
   * `prompt_suggestion` as arriving after it, `task_notification` can trail a
   * backgrounded task, and `session_state_changed: 'idle'` is the authoritative
   * turn-over signal. Breaking on `result` made all three unreachable, so the
   * loop keeps reading afterwards until whichever comes first:
   *
   * - `session_state_changed: 'idle'`,
   * - the generator ending,
   * - {@link SdkExecutorOptions.postResultDrainMs} elapsing.
   *
   * The window is what keeps a turn from hanging on a session that never sends
   * either signal, and it only ever costs time when nothing more is coming: a
   * frame already in the transport wins the race immediately. A read still in
   * flight when the window closes is handed to {@link SdkExecutor.pendingRead}
   * rather than abandoned, so its message reaches the next turn instead of
   * being swallowed.
   *
   * @param signal - Cancels the turn. On abort the running turn is interrupted
   *   and the loop keeps reading until the result arrives, so the generator is
   *   left positioned at the start of the next turn.
   * @returns `true` when the turn ended because of an abort.
   */
  private async *readMessages(signal: AbortSignal | undefined): AsyncGenerator<MappedMessage, boolean, void> {
    const watcher = watchAbort(signal);
    let abortPromise = watcher.promise;
    let aborted = false;
    let pending = this.pendingRead;
    let drain: DrainWindow | null = null;
    let cancel: CancelRetries | null = null;
    this.pendingRead = null;

    try {
      while (true) {
        pending ??= this.activeQuery!.next() as Promise<IteratorResult<SDKMessage, void>>;

        if (abortPromise || drain) {
          // Race a marker derived from `pending`, never `pending` itself: losing
          // the race must not consume the message we are about to read. Both
          // deadlines run in one race — waiting on the abort signal first would
          // sit past the drain window on a session that sends nothing more.
          const contenders: Array<Promise<unknown>> = [pending.then(() => null)];
          if (abortPromise) contenders.push(abortPromise);
          if (drain) contenders.push(drain.promise);

          const winner = await Promise.race(contenders);
          if (winner === ABORTED) {
            abortPromise = null;
            // Past the result the turn has already produced its answer and we
            // are only draining informational frames, so an abort here closes
            // the window instead of throwing away a result the caller has.
            if (drain !== null) {
              void this.activeQuery!.interrupt().catch(() => { /* already tearing down */ });
              break;
            }
            aborted = true;
            // One interrupt is not enough: a cancel that lands between
            // `ensureReady()` and the CLI picking up the turn hits a worker with
            // nothing to interrupt, and the turn then runs to completion. Retry
            // on a short cadence until the turn is over, so the cancel catches
            // the turn whenever it actually starts.
            cancel ??= startCancelRetries(() => this.activeQuery?.interrupt());
            continue;
          }
          if (winner === DRAIN_EXPIRED) break;
        }

        const step = await pending;
        pending = null;
        if (step.done) break;

        const events = this.mapMessages(step.value);
        yield { source: step.value, events, aborted };

        if (drain === null && events.some((event) => event.type === EVENT_RESULT)) {
          drain = openDrainWindow(this.sdkOptions.postResultDrainMs);
          continue;
        }
        if (drain !== null && events.some(isIdleSessionState)) break;
      }
    } finally {
      // A read the drain window outlived belongs to the next turn, not to the bin.
      this.pendingRead = pending;
      cancel?.dispose();
      drain?.dispose();
      watcher.dispose();
    }

    return aborted;
  }

  /**
   * Map one SDK message to zero or more library stream events.
   *
   * One message can produce several events: an assistant turn carries every
   * content block plus, optionally, a wrapper-level error and a context-usage
   * report.
   */
  private mapMessages(msg: SDKMessage): readonly StreamEvent[] {
    switch (msg.type) {
      case ROLE_ASSISTANT:
        return mapAssistantMessage(msg as unknown as Record<string, unknown>);

      case ROLE_USER:
        return mapUserMessage(msg as unknown as Record<string, unknown>);

      case EVENT_RESULT:
        return mapResultMessage(msg as unknown as Record<string, unknown>);

      case EVENT_SYSTEM:
        return mapSystemMessage(msg as unknown as Record<string, unknown>);

      case SDK_RATE_LIMIT_EVENT: {
        const rlMsg = msg as unknown as Record<string, unknown>;
        const info = asRecord(rlMsg[KEY_RATE_LIMIT_INFO]) ?? {};
        return [{
          type: EVENT_RATE_LIMIT,
          status: (asString(info[KEY_STATUS]) as RateLimitStatus | undefined) ?? 'allowed',
          resetsAt: asNumber(info[KEY_RESETS_AT]),
          rateLimitType: asString(info[KEY_RATE_LIMIT_TYPE]) as RateLimitType | undefined,
          utilization: asNumber(info[KEY_UTILIZATION]),
          overageStatus: asString(info[KEY_OVERAGE_STATUS]) as RateLimitStatus | undefined,
          overageResetsAt: asNumber(info[KEY_OVERAGE_RESETS_AT]),
          overageDisabledReason: asString(info[KEY_OVERAGE_DISABLED_REASON]),
          isUsingOverage: asBoolean(info[KEY_IS_USING_OVERAGE]),
          overageInUse: asBoolean(info[KEY_OVERAGE_IN_USE]),
          data: info,
        }];
      }

      // Tool progress (long-running tool execution updates)
      case EVENT_TOOL_PROGRESS: {
        const tpMsg = msg as unknown as Record<string, unknown>;
        const retry = asRecord(tpMsg[KEY_SUBAGENT_RETRY]);
        return [{
          type: EVENT_TOOL_PROGRESS,
          toolUseId: String(tpMsg[KEY_TOOL_USE_ID] ?? ''),
          toolName: String(tpMsg[KEY_TOOL_NAME] ?? ''),
          parentToolUseId: asString(tpMsg[KEY_PARENT_TOOL_USE_ID]) ?? null,
          elapsedTimeSeconds: asNumber(tpMsg['elapsed_time_seconds']) ?? 0,
          taskId: asString(tpMsg[KEY_TASK_ID]),
          heartbeat: asBoolean(tpMsg[KEY_HEARTBEAT]),
          subagentType: asString(tpMsg[KEY_SUBAGENT_TYPE]),
          subagentRetry: retry ? {
            agentId: String(retry[KEY_AGENT_ID] ?? ''),
            attempt: asNumber(retry[KEY_ATTEMPT]) ?? 0,
            maxRetries: asNumber(retry[KEY_MAX_RETRIES]) ?? 0,
            retryDelayMs: asNumber(retry[KEY_RETRY_DELAY_MS]) ?? 0,
            errorStatus: asNumberOrNull(retry[KEY_ERROR_STATUS]),
            errorCategory: String(retry[KEY_ERROR_CATEGORY] ?? ''),
          } : undefined,
        }];
      }

      // Tool use summary (AI-generated summary of preceding tool calls)
      case EVENT_TOOL_USE_SUMMARY: {
        const tsMsg = msg as unknown as Record<string, unknown>;
        return [{
          type: EVENT_TOOL_USE_SUMMARY,
          summary: String(tsMsg['summary'] ?? ''),
          precedingToolUseIds: asStringArray(tsMsg['preceding_tool_use_ids']),
        }];
      }

      // MCP authentication status
      case EVENT_AUTH_STATUS: {
        const asMsg = msg as unknown as Record<string, unknown>;
        return [{
          type: EVENT_AUTH_STATUS,
          isAuthenticating: asMsg['isAuthenticating'] === true,
          output: asStringArray(asMsg['output']),
          error: asString(asMsg[KEY_ERROR]),
        }];
      }

      // Raw Anthropic streaming events (opt-in via includePartialMessages)
      case SDK_STREAM_EVENT: {
        const pmMsg = msg as unknown as Record<string, unknown>;
        return [{
          type: EVENT_PARTIAL_MESSAGE,
          event: asRecord(pmMsg[KEY_EVENT]) ?? {},
          parentToolUseId: asString(pmMsg[KEY_PARENT_TOOL_USE_ID]) ?? null,
          ttftMs: asNumber(pmMsg[KEY_TTFT_MS]),
          userMessageUuid: asString(pmMsg[KEY_USER_MESSAGE_UUID]),
        }];
      }

      case EVENT_CONVERSATION_RESET: {
        const crMsg = msg as unknown as Record<string, unknown>;
        return [{
          type: EVENT_CONVERSATION_RESET,
          newConversationId: String(crMsg[KEY_NEW_CONVERSATION_ID] ?? ''),
        }];
      }

      case EVENT_PROMPT_SUGGESTION: {
        const psMsg = msg as unknown as Record<string, unknown>;
        return [{
          type: EVENT_PROMPT_SUGGESTION,
          suggestion: String(psMsg[KEY_SUGGESTION] ?? ''),
        }];
      }

      default:
        // Forward unknown SDK message types as generic system events
        // so users can handle future SDK additions without connector updates
        return [genericSystemEvent(msg as unknown as Record<string, unknown>)];
    }
  }
}

/**
 * Options for SdkExecutor.
 *
 * Mostly a flattened mirror of {@link ClientOptions}: the client resolves user
 * options once and hands the executor exactly what the SDK session needs. Every
 * field here maps to one `Options` key in `doInit()`; fields the SDK has no
 * equivalent for (CLI-only flags) are deliberately absent.
 */
export interface SdkExecutorOptions {
  /** Model to use. Default: 'sonnet'. */
  readonly model?: string;

  /** Path to Claude Code executable (for SDK internal use). */
  readonly pathToClaudeCodeExecutable?: string;

  /**
   * JS runtime used to run Claude Code. Distinct from
   * {@link SdkExecutorOptions.pathToClaudeCodeExecutable}, which is the bundle.
   */
  readonly runtime?: 'bun' | 'deno' | 'node';

  /** Extra argv for the JS runtime itself, e.g. `['--max-old-space-size=8192']`. */
  readonly runtimeArgs?: readonly string[];

  /** Working directory. */
  readonly cwd?: string;

  /** Permission mode. `'manual'` is sent as `'default'`. */
  readonly permissionMode?: string;

  /** Replacement body for the plan-mode workflow, used when `permissionMode` is `'plan'`. */
  readonly planModeInstructions?: string;

  /** Auto-approved tools. */
  readonly allowedTools?: readonly string[];

  /** Denied tools. */
  readonly disallowedTools?: readonly string[];

  /** Extra environment variables. */
  readonly env?: Readonly<Record<string, string>>;

  /**
   * System prompt for the session. An array is joined by the SDK with a cache
   * boundary between the entries.
   */
  readonly systemPrompt?: string | readonly string[];

  /** Append to the default system prompt. Ignored when `systemPrompt` is set. */
  readonly appendSystemPrompt?: string;

  /**
   * Drop the environment/git/directory sections from the preset system prompt.
   * Ignored when `systemPrompt` is set.
   */
  readonly excludeDynamicSystemPromptSections?: boolean;

  /** Maximum agentic turns. */
  readonly maxTurns?: number;

  /** Maximum budget in USD. */
  readonly maxBudget?: number;

  /**
   * API-side token budget for the turn, sent as `output_config.task_budget`.
   * @alpha
   */
  readonly taskBudgetTokens?: number;

  /** Effort level. */
  readonly effortLevel?: string;

  /**
   * Fallback model, or an ordered list tried left to right. The list is sent as
   * one comma-separated `--fallback-model` value, exactly as in CLI mode.
   */
  readonly fallbackModel?: string | readonly string[];

  /** Programmatic permission callback. */
  readonly canUseTool?: CanUseTool;

  /** MCP tool that answers permission prompts, instead of `canUseTool`. */
  readonly permissionPromptToolName?: string;

  /** Thinking/reasoning config. */
  readonly thinking?: ThinkingConfig;

  /**
   * Raw thinking-token budget.
   * @deprecated Prefer `thinking`; this is only used when `thinking` is unset.
   */
  readonly maxThinkingTokens?: number;

  /** Enable file checkpointing for rewindFiles(). */
  readonly enableFileCheckpointing?: boolean;

  /** MCP elicitation callback. */
  readonly onElicitation?: OnElicitation;

  /** Host callback for CLI-raised user dialogs. */
  readonly onUserDialog?: OnUserDialog;

  /** Dialog kinds the host can render. Requires `onUserDialog`. */
  readonly supportedDialogKinds?: readonly string[];

  /** JS hook callbacks (all 33 event types). */
  readonly hookCallbacks?: Partial<Record<HookEvent, readonly HookCallbackMatcher[]>>;

  /** Emit `hook_started` / `hook_progress` / `hook_response` stream events. */
  readonly includeHookEvents?: boolean;

  /** MCP server configurations (including SDK in-process servers). */
  readonly mcpServers?: Readonly<Record<string, McpServerConfig | McpSdkServerConfig>>;

  /** Custom agent definitions. */
  readonly agents?: Readonly<Record<string, unknown>>;

  /** Main agent name. */
  readonly agent?: string;

  /**
   * Available tools restriction. `['default']` is the legacy spelling of the
   * `{ type: 'preset' }` form and is translated to it.
   */
  readonly tools?: readonly string[] | ToolsPresetConfig;

  /** Redirect built-in tools to MCP tools, e.g. `{ Bash: 'mcp__workspace__bash' }`. */
  readonly toolAliases?: Readonly<Record<string, string>>;

  /** Per-tool configuration for built-in tools. */
  readonly toolConfig?: ToolConfig;

  /** Skills to load, by name, or `'all'`. */
  readonly skills?: readonly string[] | 'all';

  /** Additional directories. */
  readonly additionalDirs?: readonly string[];

  /** JSON Schema for structured output. */
  readonly schema?: Record<string, unknown>;

  /** Disable session persistence. Cannot be combined with `sessionStore`. */
  readonly noSessionPersistence?: boolean;

  /** Adapter that mirrors the transcript to external storage. @alpha */
  readonly sessionStore?: SessionStore;

  /** How eagerly the transcript mirror flushes. @alpha */
  readonly sessionStoreFlush?: SessionStoreFlush;

  /** Timeout for the session store's initial load, in milliseconds. @alpha */
  readonly sessionStoreLoadTimeoutMs?: number;

  /** Session ID to resume. */
  readonly resume?: string;

  /** Pin the new session's ID. Must be a UUID. */
  readonly sessionId?: string;

  /** Continue the most recent session. Mutually exclusive with `resume`. */
  readonly continueSession?: boolean;

  /** Fork the resumed session instead of appending to it. Requires `resume` or `sessionId`. */
  readonly forkSession?: boolean;

  /** Resume only up to and including this message uuid. */
  readonly resumeSessionAt?: string;

  /**
   * Uuid of the turn a truncating resume intends to discard. The CLI validates
   * it and refuses deterministically — a refusal must be routed to a rewind
   * path, never retried.
   */
  readonly resumeDropsTurn?: string;

  /** Controller that aborts the whole session, not one query. */
  readonly abortController?: AbortController;

  /** Custom title for a new session. */
  readonly name?: string;

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

  /** Forward subagent text and thinking blocks as messages of their own. */
  readonly forwardSubagentText?: boolean;

  /** Declare that the host renders a per-task stop control wired to `stopTask()`. */
  readonly perTaskStopAffordance?: boolean;

  /** Enable debug logging. A string is the CLI's filter form and reads as `true` here. */
  readonly debug?: boolean | string;

  /** Debug log file path. */
  readonly debugFile?: string;

  /** Callback for stderr output. */
  readonly stderr?: (data: string) => void;

  /** Safety flag for bypassPermissions mode. */
  readonly allowDangerouslySkipPermissions?: boolean;

  /** Run tool calls inside the OS sandbox. */
  readonly sandbox?: SandboxConfig;

  /** Which filesystem settings to load ('user', 'project', 'local'). */
  readonly settingSources?: readonly string[];

  /** Inline settings object or path to settings JSON file. */
  readonly settings?: string | Settings | Readonly<Record<string, unknown>>;

  /** Policy-tier settings from a spawning parent. Filtered restrictive-only. */
  readonly managedSettings?: Settings | Readonly<Record<string, unknown>>;

  /**
   * Plugin configurations. Only the `'local'` form has an SDK spelling; the
   * SDK's arg builder throws on anything else, so `{ type: 'url' }` entries are
   * dropped here and reach Claude Code only in CLI mode (`--plugin-url`).
   *
   * `Claude` rejects that combination at construction, naming the option — this
   * filter is what keeps a directly-constructed executor from failing with an
   * opaque error from inside the SDK instead.
   */
  readonly plugins?: readonly PluginConfig[];

  /** Escape hatch for CLI flags the wrapper does not model. `null` means a boolean flag. */
  readonly extraArgs?: Readonly<Record<string, string | null>>;

  /** Custom spawn function for VMs/containers. */
  readonly spawnClaudeCodeProcess?: (options: unknown) => unknown;

  /** Timeout for SDK initialization in milliseconds. Default: 120000 (2 minutes). */
  readonly initTimeoutMs?: number;

  /**
   * How long to keep reading after a turn's `result` message, in milliseconds.
   *
   * `result` is not the last frame of a turn — `prompt_suggestion`, a trailing
   * `task_notification` and `session_state_changed` follow it — so the executor
   * drains what comes next before ending the turn. `session_state_changed:
   * 'idle'` closes the window early, whatever this is set to.
   *
   * Default `0`: one event-loop turn, which picks up frames the transport has
   * already delivered and costs no measurable latency. Raise it when you rely
   * on `prompt_suggestion`, which the session produces with a separate model
   * call and can therefore deliver well after the result. Every turn then pays
   * up to this much extra when no trailing frame ever arrives.
   */
  readonly postResultDrainMs?: number;
}

// ── Message mapping ─────────────────────────────────────────────────

/** Assistant turn: wrapper error, every content block, and the context report. */
function mapAssistantMessage(assistantMsg: Record<string, unknown>): readonly StreamEvent[] {
  const events: StreamEvent[] = [];
  const message = asRecord(assistantMsg[KEY_MESSAGE]);
  const content = asRecordArray(message?.[KEY_CONTENT]);

  // The wrapper-level `error` is the only signal an overloaded / rate-limited /
  // refused API turn produces — the content array is empty in that case.
  const error = asString(assistantMsg[KEY_ERROR]);
  if (error !== undefined) {
    const text = content.map((block) => asString(block[KEY_TEXT]) ?? '').join('');
    events.push({
      type: EVENT_ERROR,
      message: text.length > 0 ? text : error,
      code: error,
      aborted: assistantMsg[KEY_ABORTED] === true ? true : undefined,
      requestId: asString(assistantMsg[KEY_REQUEST_ID]),
    });
  }

  for (const block of content) {
    const blockType = block[KEY_TYPE];
    if (blockType === BLOCK_TEXT) {
      const text = asString(block[KEY_TEXT]);
      if (text !== undefined) events.push({ type: EVENT_TEXT, text });
    } else if (blockType === BLOCK_TOOL_USE) {
      events.push({
        type: EVENT_TOOL_USE,
        toolName: String(block[KEY_NAME] ?? ''),
        toolInput: asRecord(block[KEY_INPUT]) ?? {},
        // The block's own id is what the answering tool_result carries as
        // `tool_use_id`; without it a result cannot be tied to its invocation.
        toolUseId: asString(block[KEY_ID]),
      });
    } else if (blockType === BLOCK_THINKING) {
      events.push({
        type: EVENT_THINKING,
        thinking: String(block[KEY_THINKING] ?? ''),
        signature: asString(block[KEY_SIGNATURE]),
      });
    } else if (blockType === BLOCK_REDACTED_THINKING) {
      events.push({
        type: EVENT_THINKING,
        thinking: String(block[KEY_DATA] ?? ''),
        redacted: true,
      });
    }
  }

  const contextUsage = asRecord(assistantMsg[KEY_CONTEXT_USAGE]);
  if (contextUsage) {
    events.push({ type: EVENT_CONTEXT_USAGE, contextUsage: mapMessageContextUsage(contextUsage) });
  }

  return events;
}

/**
 * User turn. In a `--print` session these are almost always the `tool_result`
 * blocks answering the assistant's `tool_use` calls; anything else (a replayed
 * prompt, a synthetic message) keeps its raw shape as a system event so nothing
 * is lost.
 */
function mapUserMessage(userMsg: Record<string, unknown>): readonly StreamEvent[] {
  const message = asRecord(userMsg[KEY_MESSAGE]);
  const blocks = asRecordArray(message?.[KEY_CONTENT]);
  const events: StreamEvent[] = [];

  for (const block of blocks) {
    if (block[KEY_TYPE] !== BLOCK_TOOL_RESULT) continue;
    events.push({
      type: EVENT_TOOL_RESULT,
      toolUseId: String(block[KEY_TOOL_USE_ID] ?? ''),
      content: mapToolResultContent(block[KEY_CONTENT]),
      isError: asBoolean(block[KEY_IS_ERROR]),
      toolUseResult: userMsg[KEY_TOOL_USE_RESULT],
      parentToolUseId: asString(userMsg[KEY_PARENT_TOOL_USE_ID]) ?? null,
      isReplay: asBoolean(userMsg[KEY_IS_REPLAY]),
      isSynthetic: asBoolean(userMsg[KEY_IS_SYNTHETIC]),
      subagentType: asString(userMsg[KEY_SUBAGENT_TYPE]),
      taskDescription: asString(userMsg['task_description']),
      timestamp: asString(userMsg['timestamp']),
      origin: userMsg[KEY_ORIGIN] as MessageOrigin | undefined,
    });
  }

  return events.length > 0 ? events : [genericSystemEvent(userMsg)];
}

/** Final message of a turn, success or error. */
function mapResultMessage(result: Record<string, unknown>): readonly StreamEvent[] {
  const events: StreamEvent[] = [];
  const errors = asStringArray(result[KEY_ERRORS]);

  // A `--resume-drops-turn` refusal is deterministic: surface it as an error
  // event so callers can route to a rewind path instead of retrying.
  const resumeRejected = errors.find((message) => message.startsWith(RESUME_REJECTED_PREFIX));
  if (resumeRejected !== undefined) {
    events.push({
      type: EVENT_ERROR,
      message: resumeRejected,
      code: RESULT_ERROR_DURING_EXECUTION,
    });
  }

  events.push({
    type: EVENT_RESULT,
    subtype: (asString(result[KEY_SUBTYPE]) as ResultSubtype | undefined) ?? RESULT_SUCCESS,
    text: asString(result[KEY_RESULT]) ?? '',
    sessionId: String(result[KEY_SESSION_ID] ?? ''),
    usage: mapTokenUsage(asRecord(result[KEY_USAGE])),
    cost: asNumber(result[KEY_TOTAL_COST]) ?? null,
    durationMs: asNumber(result[KEY_DURATION]) ?? 0,
    isError: result[KEY_IS_ERROR] === true,
    stopReason: asString(result[KEY_STOP_REASON]) ?? null,
    numTurns: asNumber(result[KEY_NUM_TURNS]),
    structured: result[KEY_STRUCTURED_OUTPUT] ?? null,
    errors: errors.length > 0 ? errors : undefined,
    terminalReason: asString(result[KEY_TERMINAL_REASON]) as TerminalReason | undefined,
    modelUsage: mapModelUsageRecord(result[KEY_MODEL_USAGE]),
    permissionDenials: mapPermissionDenials(result[KEY_PERMISSION_DENIALS]),
    deferredToolUse: mapDeferredToolUse(result[KEY_DEFERRED_TOOL_USE]),
    durationApiMs: asNumber(result[KEY_DURATION_API]),
    queuedTurnCount: asNumber(result[KEY_QUEUED_TURN_COUNT]),
    ttftMs: asNumber(result[KEY_TTFT_MS]),
    apiErrorStatus: KEY_API_ERROR_STATUS in result ? asNumberOrNull(result[KEY_API_ERROR_STATUS]) : undefined,
    fastModeState: asString(result[KEY_FAST_MODE_STATE]) as FastModeState | undefined,
    origin: result[KEY_ORIGIN] as MessageOrigin | undefined,
  });

  return events;
}

/** `type: 'system'` messages, dispatched on `subtype`. */
function mapSystemMessage(sysMsg: Record<string, unknown>): readonly StreamEvent[] {
  const subtype = asString(sysMsg[KEY_SUBTYPE]);

  switch (subtype) {
    // ── Session handshake ──────────────────────────────────────────
    case EVENT_INIT:
      return [{
        type: EVENT_INIT,
        model: String(sysMsg[KEY_MODEL] ?? ''),
        cwd: String(sysMsg[KEY_CWD] ?? ''),
        tools: asStringArray(sysMsg[KEY_TOOLS]),
        skills: asStringArray(sysMsg[KEY_SKILLS]),
        slashCommands: asStringArray(sysMsg[KEY_SLASH_COMMANDS]),
        terminalSlashCommands: KEY_TERMINAL_SLASH_COMMANDS in sysMsg
          ? asStringArray(sysMsg[KEY_TERMINAL_SLASH_COMMANDS])
          : undefined,
        mcpServers: asRecordArray(sysMsg[KEY_MCP_SERVERS]).map((server) => ({
          name: String(server[KEY_NAME] ?? ''),
          status: String(server[KEY_STATUS] ?? ''),
        })),
        plugins: asRecordArray(sysMsg[KEY_PLUGINS]).map((plugin) => ({
          name: String(plugin[KEY_NAME] ?? ''),
          path: String(plugin[KEY_PATH] ?? ''),
          version: asString(plugin[KEY_VERSION]),
        })),
        agents: KEY_AGENTS in sysMsg ? asStringArray(sysMsg[KEY_AGENTS]) : undefined,
        permissionMode: (asString(sysMsg[KEY_PERMISSION_MODE]) as PermissionMode | undefined) ?? PERMISSION_DEFAULT,
        apiKeySource: String(sysMsg[KEY_API_KEY_SOURCE] ?? ''),
        claudeCodeVersion: String(sysMsg[KEY_CLAUDE_CODE_VERSION] ?? ''),
        outputStyle: String(sysMsg[KEY_OUTPUT_STYLE] ?? ''),
        betas: KEY_BETAS in sysMsg ? asStringArray(sysMsg[KEY_BETAS]) : undefined,
        effort: (asString(sysMsg[KEY_EFFORT]) as EffortLevel | undefined) ?? null,
        capabilities: KEY_CAPABILITIES in sysMsg ? asStringArray(sysMsg[KEY_CAPABILITIES]) : undefined,
        fastModeState: asString(sysMsg[KEY_FAST_MODE_STATE]) as FastModeState | undefined,
        fastModeDisabledReason: asString(sysMsg[KEY_FAST_MODE_DISABLED_REASON]),
      }];

    // ── Task lifecycle ─────────────────────────────────────────────
    case EVENT_TASK_STARTED:
      return [{
        type: EVENT_TASK_STARTED,
        taskId: String(sysMsg[KEY_TASK_ID] ?? ''),
        toolUseId: asString(sysMsg[KEY_TOOL_USE_ID]),
        description: String(sysMsg[KEY_DESCRIPTION] ?? ''),
        taskType: asString(sysMsg[KEY_TASK_TYPE]),
        prompt: asString(sysMsg['prompt']),
        subagentType: asString(sysMsg[KEY_SUBAGENT_TYPE]),
        isBackgrounded: asBoolean(sysMsg[KEY_IS_BACKGROUNDED]),
        spawnDepth: asNumber(sysMsg[KEY_SPAWN_DEPTH]),
        workflowName: asString(sysMsg[KEY_WORKFLOW_NAME]),
        skipTranscript: asBoolean(sysMsg[KEY_SKIP_TRANSCRIPT]),
        ambient: asBoolean(sysMsg[KEY_AMBIENT]),
      }];

    case EVENT_TASK_PROGRESS:
      return [{
        type: EVENT_TASK_PROGRESS,
        taskId: String(sysMsg[KEY_TASK_ID] ?? ''),
        toolUseId: asString(sysMsg[KEY_TOOL_USE_ID]),
        description: String(sysMsg[KEY_DESCRIPTION] ?? ''),
        usage: mapTaskUsage(asRecord(sysMsg[KEY_USAGE])),
        lastToolName: asString(sysMsg['last_tool_name']),
        summary: asString(sysMsg['summary']),
        subagentType: asString(sysMsg[KEY_SUBAGENT_TYPE]),
      }];

    case EVENT_TASK_NOTIFICATION: {
      const taskUsage = asRecord(sysMsg[KEY_USAGE]);
      return [{
        type: EVENT_TASK_NOTIFICATION,
        taskId: String(sysMsg[KEY_TASK_ID] ?? ''),
        toolUseId: asString(sysMsg[KEY_TOOL_USE_ID]),
        status: (asString(sysMsg[KEY_STATUS]) ?? 'completed') as 'completed' | 'failed' | 'stopped',
        outputFile: String(sysMsg['output_file'] ?? ''),
        summary: String(sysMsg['summary'] ?? ''),
        usage: taskUsage ? mapTaskUsage(taskUsage) : undefined,
        skipTranscript: asBoolean(sysMsg[KEY_SKIP_TRANSCRIPT]),
        ambient: asBoolean(sysMsg[KEY_AMBIENT]),
      }];
    }

    case EVENT_TASK_UPDATED: {
      const patch = asRecord(sysMsg[KEY_PATCH]) ?? {};
      return [{
        type: EVENT_TASK_UPDATED,
        taskId: String(sysMsg[KEY_TASK_ID] ?? ''),
        patch: {
          status: asString(patch[KEY_STATUS]) as
            'pending' | 'running' | 'completed' | 'failed' | 'killed' | 'paused' | undefined,
          description: asString(patch[KEY_DESCRIPTION]),
          endTime: asNumber(patch[KEY_END_TIME]),
          totalPausedMs: asNumber(patch[KEY_TOTAL_PAUSED_MS]),
          error: asString(patch[KEY_ERROR]),
          isBackgrounded: asBoolean(patch[KEY_IS_BACKGROUNDED]),
        },
      }];
    }

    case EVENT_BACKGROUND_TASKS_CHANGED:
      return [{
        type: EVENT_BACKGROUND_TASKS_CHANGED,
        tasks: asRecordArray(sysMsg[KEY_TASKS]).map((task) => ({
          taskId: String(task[KEY_TASK_ID] ?? ''),
          taskType: String(task[KEY_TASK_TYPE] ?? ''),
          description: String(task[KEY_DESCRIPTION] ?? ''),
          ambient: asBoolean(task[KEY_AMBIENT]),
        })),
      }];

    // ── Hook lifecycle ─────────────────────────────────────────────
    case EVENT_HOOK_STARTED:
      return [{
        type: EVENT_HOOK_STARTED,
        hookId: String(sysMsg['hook_id'] ?? ''),
        hookName: String(sysMsg['hook_name'] ?? ''),
        hookEvent: String(sysMsg['hook_event'] ?? ''),
      }];

    case EVENT_HOOK_PROGRESS:
      return [{
        type: EVENT_HOOK_PROGRESS,
        hookId: String(sysMsg['hook_id'] ?? ''),
        hookName: String(sysMsg['hook_name'] ?? ''),
        hookEvent: String(sysMsg['hook_event'] ?? ''),
        stdout: String(sysMsg['stdout'] ?? ''),
        stderr: String(sysMsg['stderr'] ?? ''),
        output: String(sysMsg['output'] ?? ''),
      }];

    case EVENT_HOOK_RESPONSE:
      return [{
        type: EVENT_HOOK_RESPONSE,
        hookId: String(sysMsg['hook_id'] ?? ''),
        hookName: String(sysMsg['hook_name'] ?? ''),
        hookEvent: String(sysMsg['hook_event'] ?? ''),
        output: String(sysMsg['output'] ?? ''),
        stdout: String(sysMsg['stdout'] ?? ''),
        stderr: String(sysMsg['stderr'] ?? ''),
        exitCode: asNumber(sysMsg['exit_code']),
        outcome: (asString(sysMsg['outcome']) ?? 'success') as 'success' | 'error' | 'cancelled',
      }];

    // ── File persistence ───────────────────────────────────────────
    case EVENT_FILES_PERSISTED:
      return [{
        type: EVENT_FILES_PERSISTED,
        files: asRecordArray(sysMsg['files']).map((file) => ({
          filename: String(file['filename'] ?? ''),
          fileId: String(file['file_id'] ?? ''),
        })),
        failed: asRecordArray(sysMsg['failed']).map((file) => ({
          filename: String(file['filename'] ?? ''),
          error: String(file[KEY_ERROR] ?? ''),
        })),
        processedAt: String(sysMsg['processed_at'] ?? ''),
      }];

    // ── Context compaction ─────────────────────────────────────────
    case EVENT_COMPACT_BOUNDARY: {
      const meta = asRecord(sysMsg[KEY_COMPACT_METADATA]) ?? {};
      const preservedMessages = asRecord(meta[KEY_PRESERVED_MESSAGES]);
      const preservedSegment = asRecord(meta[KEY_PRESERVED_SEGMENT]);
      return [{
        type: EVENT_COMPACT_BOUNDARY,
        trigger: (asString(meta[KEY_TRIGGER]) ?? 'auto') as 'manual' | 'auto',
        preTokens: asNumber(meta[KEY_PRE_TOKENS]) ?? 0,
        postTokens: asNumber(meta[KEY_POST_TOKENS]),
        durationMs: asNumber(meta[KEY_DURATION]),
        preservedMessages: preservedMessages ? {
          anchorUuid: String(preservedMessages['anchor_uuid'] ?? ''),
          uuids: asStringArray(preservedMessages['uuids']),
        } : undefined,
        preservedSegment: preservedSegment ? {
          headUuid: String(preservedSegment['head_uuid'] ?? ''),
          anchorUuid: String(preservedSegment['anchor_uuid'] ?? ''),
          tailUuid: String(preservedSegment['tail_uuid'] ?? ''),
        } : undefined,
      }];
    }

    // ── Slash command output ───────────────────────────────────────
    case EVENT_LOCAL_COMMAND_OUTPUT:
      return [{
        type: EVENT_LOCAL_COMMAND_OUTPUT,
        content: String(sysMsg[KEY_CONTENT] ?? ''),
      }];

    // ── Activity & thinking ────────────────────────────────────────
    case EVENT_STATUS:
      return [{
        type: EVENT_STATUS,
        status: (asString(sysMsg[KEY_STATUS]) ?? null) as 'compacting' | 'requesting' | null,
        permissionMode: asString(sysMsg[KEY_PERMISSION_MODE]) as PermissionMode | undefined,
        compactResult: asString(sysMsg[KEY_COMPACT_RESULT]) as 'success' | 'failed' | undefined,
        compactError: asString(sysMsg[KEY_COMPACT_ERROR]),
      }];

    case EVENT_THINKING_TOKENS:
      return [{
        type: EVENT_THINKING_TOKENS,
        estimatedTokens: asNumber(sysMsg[KEY_ESTIMATED_TOKENS]) ?? 0,
        estimatedTokensDelta: asNumber(sysMsg[KEY_ESTIMATED_TOKENS_DELTA]) ?? 0,
      }];

    // ── API retry & model refusal ──────────────────────────────────
    case EVENT_API_RETRY:
      return [{
        type: EVENT_API_RETRY,
        attempt: asNumber(sysMsg[KEY_ATTEMPT]) ?? 0,
        maxRetries: asNumber(sysMsg[KEY_MAX_RETRIES]) ?? 0,
        retryDelayMs: asNumber(sysMsg[KEY_RETRY_DELAY_MS]) ?? 0,
        errorStatus: asNumberOrNull(sysMsg[KEY_ERROR_STATUS]),
        error: String(sysMsg[KEY_ERROR] ?? ''),
      }];

    case EVENT_MODEL_REFUSAL_FALLBACK:
      return [{
        type: EVENT_MODEL_REFUSAL_FALLBACK,
        direction: (asString(sysMsg[KEY_DIRECTION]) ?? 'retry') as 'retry' | 'revert' | 'sticky',
        scope: asString(sysMsg[KEY_SCOPE]) as 'session' | 'local' | undefined,
        originalModel: String(sysMsg[KEY_ORIGINAL_MODEL] ?? ''),
        fallbackModel: String(sysMsg[KEY_FALLBACK_MODEL] ?? ''),
        requestId: asString(sysMsg[KEY_REQUEST_ID]) ?? null,
        refusalCategory: KEY_API_REFUSAL_CATEGORY in sysMsg
          ? asString(sysMsg[KEY_API_REFUSAL_CATEGORY]) ?? null
          : undefined,
        refusalExplanation: KEY_API_REFUSAL_EXPLANATION in sysMsg
          ? asString(sysMsg[KEY_API_REFUSAL_EXPLANATION]) ?? null
          : undefined,
        retractedMessageUuids: KEY_RETRACTED_MESSAGE_UUIDS in sysMsg
          ? asStringArray(sysMsg[KEY_RETRACTED_MESSAGE_UUIDS])
          : undefined,
        refusedUserMessageUuid: KEY_REFUSED_USER_MESSAGE_UUID in sysMsg
          ? asString(sysMsg[KEY_REFUSED_USER_MESSAGE_UUID]) ?? null
          : undefined,
        content: String(sysMsg[KEY_CONTENT] ?? ''),
      }];

    case EVENT_MODEL_REFUSAL_NO_FALLBACK:
      return [{
        type: EVENT_MODEL_REFUSAL_NO_FALLBACK,
        originalModel: String(sysMsg[KEY_ORIGINAL_MODEL] ?? ''),
        requestId: asString(sysMsg[KEY_REQUEST_ID]) ?? null,
        refusalCategory: KEY_API_REFUSAL_CATEGORY in sysMsg
          ? asString(sysMsg[KEY_API_REFUSAL_CATEGORY]) ?? null
          : undefined,
        refusalExplanation: KEY_API_REFUSAL_EXPLANATION in sysMsg
          ? asString(sysMsg[KEY_API_REFUSAL_EXPLANATION]) ?? null
          : undefined,
        refusedUserMessageUuid: KEY_REFUSED_USER_MESSAGE_UUID in sysMsg
          ? asString(sysMsg[KEY_REFUSED_USER_MESSAGE_UUID]) ?? null
          : undefined,
        content: String(sysMsg[KEY_CONTENT] ?? ''),
      }];

    // ── Permissions & notifications ────────────────────────────────
    case EVENT_PERMISSION_DENIED:
      return [{
        type: EVENT_PERMISSION_DENIED,
        toolName: String(sysMsg[KEY_TOOL_NAME] ?? ''),
        toolUseId: String(sysMsg[KEY_TOOL_USE_ID] ?? ''),
        agentId: asString(sysMsg[KEY_AGENT_ID]),
        decisionReasonType: asString(sysMsg[KEY_DECISION_REASON_TYPE]),
        decisionReason: asString(sysMsg[KEY_DECISION_REASON]),
        message: String(sysMsg[KEY_MESSAGE] ?? ''),
      }];

    case EVENT_NOTIFICATION:
      return [{
        type: EVENT_NOTIFICATION,
        key: String(sysMsg[KEY_KEY] ?? ''),
        text: String(sysMsg[KEY_TEXT] ?? ''),
        priority: (asString(sysMsg[KEY_PRIORITY]) ?? 'low') as 'low' | 'medium' | 'high' | 'immediate',
        color: asString(sysMsg[KEY_COLOR]),
        timeoutMs: asNumber(sysMsg[KEY_TIMEOUT_MS]),
      }];

    case EVENT_INFORMATIONAL:
      return [{
        type: EVENT_INFORMATIONAL,
        content: String(sysMsg[KEY_CONTENT] ?? ''),
        level: (asString(sysMsg[KEY_LEVEL]) ?? 'info') as 'info' | 'notice' | 'suggestion' | 'warning',
        toolUseId: asString(sysMsg[KEY_TOOL_USE_ID]),
        preventContinuation: asBoolean(sysMsg[KEY_PREVENT_CONTINUATION]),
      }];

    // ── Session & runtime signals ──────────────────────────────────
    case EVENT_SESSION_STATE_CHANGED:
      return [{
        type: EVENT_SESSION_STATE_CHANGED,
        state: (asString(sysMsg[KEY_STATE]) ?? 'idle') as 'idle' | 'running' | 'requires_action',
      }];

    case EVENT_WORKER_SHUTTING_DOWN:
      return [{
        type: EVENT_WORKER_SHUTTING_DOWN,
        reason: String(sysMsg[KEY_REASON] ?? ''),
      }];

    case EVENT_MIRROR_ERROR: {
      const key = asRecord(sysMsg[KEY_KEY]) ?? {};
      return [{
        type: EVENT_MIRROR_ERROR,
        error: String(sysMsg[KEY_ERROR] ?? ''),
        key: {
          projectKey: String(key['projectKey'] ?? ''),
          sessionId: String(key['sessionId'] ?? ''),
          subpath: asString(key['subpath']),
        },
      }];
    }

    // ── Memory, commands & plugins ─────────────────────────────────
    case EVENT_MEMORY_RECALL:
      return [{
        type: EVENT_MEMORY_RECALL,
        mode: (asString(sysMsg[KEY_MODE]) ?? 'select') as 'select' | 'synthesize',
        memories: asRecordArray(sysMsg[KEY_MEMORIES]).map((memory) => ({
          path: String(memory[KEY_PATH] ?? ''),
          scope: (asString(memory[KEY_SCOPE]) ?? 'personal') as 'personal' | 'team' | 'organization',
          content: asString(memory[KEY_CONTENT]),
        })),
      }];

    case EVENT_COMMANDS_CHANGED:
      return [{
        type: EVENT_COMMANDS_CHANGED,
        commands: asRecordArray(sysMsg[KEY_COMMANDS]) as unknown as readonly SlashCommand[],
      }];

    case EVENT_PLUGIN_INSTALL:
      return [{
        type: EVENT_PLUGIN_INSTALL,
        status: (asString(sysMsg[KEY_STATUS]) ?? 'started') as 'started' | 'installed' | 'failed' | 'completed',
        name: asString(sysMsg[KEY_NAME]),
        error: asString(sysMsg[KEY_ERROR]),
      }];

    // ── Elicitation & control requests ─────────────────────────────
    case EVENT_ELICITATION_COMPLETE:
      return [{
        type: EVENT_ELICITATION_COMPLETE,
        mcpServerName: String(sysMsg[KEY_MCP_SERVER_NAME] ?? ''),
        elicitationId: String(sysMsg[KEY_ELICITATION_ID] ?? ''),
      }];

    case EVENT_CONTROL_REQUEST_PROGRESS:
      return [{
        type: EVENT_CONTROL_REQUEST_PROGRESS,
        requestId: String(sysMsg[KEY_REQUEST_ID] ?? ''),
        status: (asString(sysMsg[KEY_STATUS]) ?? 'started') as 'started' | 'api_retry',
        attempt: asNumber(sysMsg[KEY_ATTEMPT]),
        maxRetries: asNumber(sysMsg[KEY_MAX_RETRIES]),
        retryDelayMs: asNumber(sysMsg[KEY_RETRY_DELAY_MS]),
        errorStatus: KEY_ERROR_STATUS in sysMsg ? asNumberOrNull(sysMsg[KEY_ERROR_STATUS]) : undefined,
      }];

    default:
      return [genericSystemEvent(sysMsg)];
  }
}

/** Fallback for message shapes this version does not model. Nothing is lost. */
function genericSystemEvent(msg: Record<string, unknown>): StreamEvent {
  return {
    type: EVENT_SYSTEM,
    subtype: asString(msg[KEY_SUBTYPE]) ?? asString(msg[KEY_TYPE]) ?? SYSTEM_UNKNOWN,
    data: msg,
  };
}

// ── Payload mappers (snake_case wire → camelCase library) ───────────

function mapTokenUsage(usage: Record<string, unknown> | undefined): TokenUsage {
  const serverToolUse = asRecord(usage?.[KEY_SERVER_TOOL_USE]);
  return {
    inputTokens: asNumber(usage?.[KEY_INPUT_TOKENS]) ?? 0,
    outputTokens: asNumber(usage?.[KEY_OUTPUT_TOKENS]) ?? 0,
    cacheCreationInputTokens: asNumber(usage?.[KEY_CACHE_CREATION_INPUT_TOKENS]),
    cacheReadInputTokens: asNumber(usage?.[KEY_CACHE_READ_INPUT_TOKENS]),
    serverToolUse: serverToolUse ? {
      webSearchRequests: asNumber(serverToolUse[KEY_WEB_SEARCH_REQUESTS]),
      webFetchRequests: asNumber(serverToolUse['web_fetch_requests']),
    } : undefined,
    serviceTier: asString(usage?.[KEY_SERVICE_TIER]) as TokenUsage['serviceTier'],
  };
}

function mapTaskUsage(usage: Record<string, unknown> | undefined): {
  totalTokens: number;
  toolUses: number;
  durationMs: number;
} {
  return {
    totalTokens: asNumber(usage?.[KEY_TOTAL_TOKENS]) ?? 0,
    toolUses: asNumber(usage?.[KEY_TOOL_USES]) ?? 0,
    durationMs: asNumber(usage?.[KEY_DURATION]) ?? 0,
  };
}

/** `modelUsage` is already camelCase on the wire; only `costUSD` differs. */
function mapModelUsageRecord(raw: unknown): Readonly<Record<string, ModelUsageEntry>> | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const mapped: Record<string, ModelUsageEntry> = {};
  for (const [model, value] of Object.entries(record)) {
    const entry = asRecord(value);
    if (!entry) continue;
    mapped[model] = mapModelUsageEntry(entry);
  }
  return mapped;
}

function mapModelUsageEntry(entry: Record<string, unknown>): ModelUsageEntry {
  return {
    inputTokens: asNumber(entry['inputTokens']) ?? 0,
    outputTokens: asNumber(entry['outputTokens']) ?? 0,
    cacheReadInputTokens: asNumber(entry['cacheReadInputTokens']) ?? 0,
    cacheCreationInputTokens: asNumber(entry['cacheCreationInputTokens']) ?? 0,
    webSearchRequests: asNumber(entry['webSearchRequests']) ?? 0,
    costUsd: asNumber(entry['costUSD']) ?? 0,
    contextWindow: asNumber(entry['contextWindow']) ?? 0,
    maxOutputTokens: asNumber(entry['maxOutputTokens']) ?? 0,
    canonicalModel: asString(entry['canonicalModel']),
    provider: asString(entry['provider']),
    costBasis: asString(entry['costBasis']) as ModelUsageEntry['costBasis'],
  };
}

function mapPermissionDenials(raw: unknown): readonly PermissionDenial[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return asRecordArray(raw).map((denial) => ({
    toolName: String(denial[KEY_TOOL_NAME] ?? ''),
    toolUseId: String(denial[KEY_TOOL_USE_ID] ?? ''),
    toolInput: asRecord(denial[KEY_TOOL_INPUT]) ?? {},
  }));
}

function mapDeferredToolUse(raw: unknown): DeferredToolUse | null | undefined {
  const deferred = asRecord(raw);
  if (!deferred) return undefined;
  return {
    id: String(deferred['id'] ?? ''),
    name: String(deferred[KEY_NAME] ?? ''),
    input: asRecord(deferred[KEY_INPUT]) ?? {},
  };
}

/** The `/context` report carried on an assistant message (snake_case). */
function mapMessageContextUsage(raw: Record<string, unknown>): ContextUsage {
  const overLimit = asRecord(raw[KEY_OVER_LIMIT]);
  const skills = Array.isArray(raw[KEY_SKILLS])
    ? asRecordArray(raw[KEY_SKILLS]).map((skill) => ({
        name: String(skill[KEY_NAME] ?? ''),
        source: String(skill['source'] ?? ''),
        pluginName: asString(skill['plugin_name']),
        tokens: asNumber(skill[KEY_TOKENS]) ?? 0,
      }))
    : undefined;

  return {
    model: String(raw[KEY_MODEL] ?? ''),
    totalTokens: asNumber(raw[KEY_TOTAL_TOKENS]) ?? 0,
    rawMaxTokens: asNumber(raw[KEY_RAW_MAX_TOKENS]) ?? 0,
    percentage: asNumber(raw[KEY_PERCENTAGE]) ?? 0,
    overLimit: overLimit ? {
      tokensOver: asNumber(overLimit[KEY_TOKENS_OVER]) ?? 0,
      kind: (asString(overLimit[KEY_KIND]) ?? 'hard_limit') as 'hard_limit' | 'compaction_window',
    } : undefined,
    categories: asRecordArray(raw[KEY_CATEGORIES]).map((category): ContextUsageCategory => ({
      name: String(category[KEY_NAME] ?? ''),
      tokens: asNumber(category[KEY_TOKENS]) ?? 0,
      kind: asString(category[KEY_KIND]) as ContextUsageCategory['kind'],
    })),
    mcpTools: asRecordArray(raw[KEY_MCP_TOOLS]).map((tool) => ({
      name: String(tool[KEY_NAME] ?? ''),
      serverName: String(tool['server_name'] ?? ''),
      tokens: asNumber(tool[KEY_TOKENS]) ?? 0,
    })),
    memoryFiles: asRecordArray(raw[KEY_MEMORY_FILES]).map((file) => ({
      path: String(file[KEY_PATH] ?? ''),
      type: String(file[KEY_TYPE] ?? ''),
      tokens: asNumber(file[KEY_TOKENS]) ?? 0,
    })),
    agents: asRecordArray(raw[KEY_AGENTS]).map((agent) => ({
      agentType: String(agent['agent_type'] ?? ''),
      source: String(agent['source'] ?? ''),
      tokens: asNumber(agent[KEY_TOKENS]) ?? 0,
    })),
    skills,
  };
}

/**
 * The `/context` report from the control protocol. Already camelCase, except
 * `apiUsage`, whose token counts arrive in the API's snake_case spelling.
 */
function mapContextUsageResponse(response: SDKContextUsageResponse): ContextUsage {
  const { apiUsage, ...rest } = response;
  return {
    ...(rest as unknown as ContextUsage),
    apiUsage: apiUsage ? mapTokenUsage(apiUsage as unknown as Record<string, unknown>) : null,
  };
}

function mapInitializationResult(response: SDKInitializeResponse): InitializationResult {
  return {
    commands: response.commands as unknown as readonly SlashCommand[],
    agents: response.agents as unknown as readonly AgentInfo[],
    outputStyle: response.output_style,
    availableOutputStyles: response.available_output_styles,
    models: response.models as unknown as readonly ModelInfo[],
    account: response.account as AccountInfo,
    hooksApplied: response.hooks_applied,
    fastModeState: response.fast_mode_state as FastModeState | undefined,
    fastModeDisabledReason: response.fast_mode_disabled_reason,
  };
}

function mapReloadPluginsResult(response: SDKReloadPluginsResponse): ReloadPluginsResult {
  return {
    commands: response.commands as unknown as readonly SlashCommand[],
    agents: response.agents as unknown as readonly AgentInfo[],
    plugins: response.plugins,
    mcpServers: response.mcpServers as unknown as readonly McpServerStatus[],
    errorCount: response.error_count,
  };
}

function mapUsageReport(response: SDKUsageResponse): UsageReport {
  const session = response.session;
  const modelUsage: Record<string, ModelUsageEntry> = {};
  for (const [model, entry] of Object.entries(session.model_usage)) {
    modelUsage[model] = mapModelUsageEntry(entry as unknown as Record<string, unknown>);
  }

  return {
    session: {
      totalCostUsd: session.total_cost_usd,
      totalApiDurationMs: session.total_api_duration_ms,
      totalDurationMs: session.total_duration_ms,
      totalLinesAdded: session.total_lines_added,
      totalLinesRemoved: session.total_lines_removed,
      modelUsage,
    },
    subscriptionType: response.subscription_type,
    rateLimitsAvailable: response.rate_limits_available,
    rateLimits: response.rate_limits ? mapRateLimitWindows(response.rate_limits) : null,
    behaviors: response.behaviors ? {
      day: mapUsageBehaviorWindow(response.behaviors.day),
      week: mapUsageBehaviorWindow(response.behaviors.week),
    } : null,
  };
}

function mapRateLimitWindows(raw: NonNullable<SDKUsageResponse['rate_limits']>): RateLimitWindows {
  const window = (
    value: { utilization: number | null; resets_at: string | null; display_name?: string } | null | undefined,
  ): RateLimitWindow | null | undefined => {
    if (value === null || value === undefined) return value;
    return {
      utilization: value.utilization,
      resetsAt: value.resets_at,
      displayName: value.display_name,
    };
  };

  return {
    fiveHour: window(raw.five_hour),
    sevenDay: window(raw.seven_day),
    sevenDayOauthApps: window(raw.seven_day_oauth_apps),
    sevenDayOpus: window(raw.seven_day_opus),
    sevenDaySonnet: window(raw.seven_day_sonnet),
    modelScoped: raw.model_scoped?.map((entry) => ({
      utilization: entry.utilization,
      resetsAt: entry.resets_at,
      displayName: entry.display_name,
    })),
    extraUsage: raw.extra_usage ? {
      isEnabled: raw.extra_usage.is_enabled,
      monthlyLimit: raw.extra_usage.monthly_limit,
      usedCredits: raw.extra_usage.used_credits,
      utilization: raw.extra_usage.utilization,
      currency: raw.extra_usage.currency,
    } : raw.extra_usage,
  };
}

function mapUsageBehaviorWindow(
  raw: NonNullable<SDKUsageResponse['behaviors']>['day'],
): UsageBehaviorWindow {
  return {
    requestCount: raw.request_count,
    sessionCount: raw.session_count,
    behaviors: raw.behaviors,
    agents: raw.agents,
    skills: raw.skills,
    plugins: raw.plugins,
    mcpServers: raw.mcp_servers,
  };
}

// ── Small helpers ───────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** `'manual'` is the CLI's spelling of `'default'`; the SDK only knows the latter. */
function toSdkPermissionMode(mode: PermissionMode | undefined): SDKPermissionMode | undefined {
  if (mode === undefined) return undefined;
  return (mode === PERMISSION_MANUAL ? PERMISSION_DEFAULT : mode) as SDKPermissionMode;
}

/**
 * Seed the flag-settings mirror from whatever `settings` the client supplied.
 *
 * The facade hands the SDK a pre-serialized JSON string — that is the only form
 * the SDK's own arg builder passes through intact — so an object arrives here
 * as text and has to be parsed back to be mirrored. A settings *path* is not
 * readable from here and yields an empty mirror, which is why a per-query
 * override of a key that lives in such a file restores to `null` (clearing the
 * flag layer) instead of to the file's value.
 */
function seedFlagSettings(settings: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (typeof settings === 'object' && settings !== null) return { ...settings };
  if (typeof settings !== 'string') return {};

  try {
    const parsed: unknown = JSON.parse(settings);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  } catch {
    // A filesystem path, not inline settings — nothing to mirror.
    return {};
  }
}

/**
 * Express a {@link ThinkingConfig} as the token budget `setMaxThinkingTokens()`
 * takes. Returns `null` for `'adaptive'`, which has no token-budget spelling.
 *
 * `'disabled'` is `0`, not `null`: the SDK reads `null` as "clear any limit and
 * use the default budget", which re-enables thinking rather than turning it
 * off. Keeping the two apart is also what lets an `'enabled'` config with no
 * explicit budget (`null`) be told apart from a disabled one, so a per-query
 * override between them is not mistaken for a no-op.
 */
function thinkingBudgetOf(config: ThinkingConfig | undefined): ThinkingBudget | null {
  if (!config) return null;
  if (config.type === 'disabled') return { tokens: 0, display: null };
  if (config.type === 'enabled') {
    return { tokens: config.budgetTokens ?? null, display: config.display ?? null };
  }
  return null;
}

function sameThinking(left: ThinkingBudget, right: ThinkingBudget): boolean {
  return left.tokens === right.tokens && left.display === right.display;
}

/**
 * Resolve the prompt for one turn and fold in any per-query system prompt.
 *
 * `options.prompt` is authoritative; {@link extractPrompt} is the fallback for
 * callers that only hand over an argv array.
 *
 * The SDK fixes the system prompt at session construction, so a per-query one
 * can only be prepended to the turn's text. A value the session already carries
 * is dropped instead: the model has it, and repeating it in front of every user
 * message is noise, not instruction. The comparison folds the array form down
 * first, because a caller that merged client and query options hands over the
 * joined spelling of a session prompt that was configured as an array.
 */
function buildPrompt(
  args: readonly string[],
  options: ExecuteOptions,
  sessionSystemPrompt: string | readonly string[] | undefined,
): string {
  const prompt = options.prompt ?? extractPrompt(args);
  const systemPrompt = options.systemPrompt;
  if (!systemPrompt || systemPrompt === foldSystemPrompt(sessionSystemPrompt)) return prompt;
  return `[System instruction: ${systemPrompt}]\n\n${prompt}`;
}

/**
 * The single-string spelling of a system prompt configured as an array.
 *
 * Mirrors what `ArgsBuilder` emits for `--system-prompt`: the parts joined, with
 * {@link SYSTEM_PROMPT_DYNAMIC_BOUNDARY} dropped rather than joined in — it is a
 * marker splitting a cacheable prefix from a per-run suffix, not prompt text.
 */
function foldSystemPrompt(prompt: string | readonly string[] | undefined): string | undefined {
  if (prompt === undefined || typeof prompt === 'string') return prompt;
  return prompt
    .filter((part) => part !== SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
    .join(SYSTEM_PROMPT_SEPARATOR);
}

/**
 * Watch a per-query abort signal.
 *
 * The returned promise resolves with {@link ABORTED} once, and never rejects.
 * `dispose()` unsubscribes so a completed query does not pin the signal.
 */
function watchAbort(signal: AbortSignal | undefined): {
  promise: Promise<typeof ABORTED> | null;
  dispose: () => void;
} {
  if (!signal) return { promise: null, dispose: () => { /* nothing to unsubscribe */ } };

  let listener: (() => void) | null = null;
  const promise = new Promise<typeof ABORTED>((resolve) => {
    if (signal.aborted) {
      resolve(ABORTED);
      return;
    }
    listener = () => resolve(ABORTED);
    signal.addEventListener('abort', listener, { once: true });
  });

  return {
    promise,
    dispose: () => {
      if (listener) signal.removeEventListener('abort', listener);
    },
  };
}

/**
 * Keep interrupting an aborted turn until it actually stops.
 *
 * `interrupt()` only cancels work the worker has already started. A cancel that
 * lands in the gap between the prompt being sent and the CLI picking it up
 * therefore does nothing, and the turn runs to completion — billed and
 * discarded. Retrying on a short cadence closes that window: whenever the turn
 * begins, the next retry catches it.
 *
 * The retries stop when the read loop finishes (its `finally` disposes this),
 * and are capped so a session that never acknowledges the cancel cannot leave a
 * timer running for the life of the process.
 */
function startCancelRetries(interrupt: () => Promise<unknown> | undefined): CancelRetries {
  void interrupt()?.catch(() => { /* already tearing down */ });

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (attempts > CANCEL_RETRY_LIMIT) {
      clearInterval(timer);
      return;
    }
    void interrupt()?.catch(() => { /* already tearing down */ });
  }, CANCEL_RETRY_INTERVAL_MS);

  return { dispose: () => clearInterval(timer) };
}

/**
 * Open the bounded window that ends a turn's post-result drain.
 *
 * A window of `0` (the default) is one event-loop turn: a message the transport
 * has already delivered resolves as a microtask and therefore always beats it,
 * while a read still in flight loses immediately — which is what keeps a turn
 * from waiting on a session that sends nothing after the result.
 *
 * The handle is deliberately *not* `unref()`-ed. An unreferenced immediate or
 * timer does not hold the event loop open, and libuv will then happily block in
 * its poll phase past the due time until some other event wakes it — turning a
 * "one tick" window into however long the process stays otherwise idle. Since
 * {@link DrainWindow.dispose} is called from the read loop's `finally` on every
 * path, the handle never outlives the turn that opened it anyway.
 */
function openDrainWindow(windowMs: number | undefined): DrainWindow {
  const ms = windowMs ?? DEFAULT_POST_RESULT_DRAIN_MS;

  if (ms <= 0) {
    let handle: ReturnType<typeof setImmediate> | null = null;
    const promise = new Promise<typeof DRAIN_EXPIRED>((resolve) => {
      handle = setImmediate(() => resolve(DRAIN_EXPIRED));
    });
    return { promise, dispose: () => { if (handle) clearImmediate(handle); } };
  }

  let handle: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<typeof DRAIN_EXPIRED>((resolve) => {
    handle = setTimeout(() => resolve(DRAIN_EXPIRED), ms);
  });
  return { promise, dispose: () => { if (handle) clearTimeout(handle); } };
}

/** The SDK's authoritative turn-over signal, which closes a drain window. */
function isIdleSessionState(event: StreamEvent): boolean {
  return event.type === EVENT_SESSION_STATE_CHANGED && event.state === SESSION_STATE_IDLE;
}

/**
 * Extract the prompt string from a CLI args array.
 *
 * In our args format the prompt is the first positional argument — `buildArgs`
 * emits `['--print', '--output-format', 'json', '--verbose'?, <prompt>, …flags]`
 * — so the scan walks the flags, skips whatever each of them consumes, and
 * returns the first token left over.
 *
 * Three flag shapes consume differently, and they are tested in this order
 * because a variadic flag is also listed in {@link FLAGS_WITH_VALUE}:
 *
 * - {@link FLAGS_VARIADIC} (`--allowedTools Bash Edit`) swallow every following
 *   token up to the next `-`-prefixed one;
 * - {@link FLAGS_WITH_VALUE} swallow exactly one;
 * - {@link FLAGS_WITH_OPTIONAL_VALUE} (`--worktree`, `--debug`,
 *   `--prompt-suggestions`) swallow one only when it is not itself a flag.
 *
 * Only a fallback: prefer {@link ExecuteOptions.prompt}, which carries the
 * prompt verbatim instead of reconstructing it from flags. A variadic flag
 * placed *before* the prompt would swallow it — `buildArgs` never emits that
 * order, but nothing here can recover from it either.
 */
function extractPrompt(args: readonly string[]): string {
  let index = 0;

  while (index < args.length) {
    const arg = args[index]!;

    if (arg.startsWith('--')) {
      if ((FLAGS_VARIADIC as readonly string[]).includes(arg)) {
        index++;
        while (index < args.length && !args[index]!.startsWith('-')) index++;
        continue;
      }
      if ((FLAGS_WITH_VALUE as readonly string[]).includes(arg)) {
        index += 2;
        continue;
      }
      if ((FLAGS_WITH_OPTIONAL_VALUE as readonly string[]).includes(arg)) {
        const next = args[index + 1];
        index += next !== undefined && !next.startsWith('-') ? 2 : 1;
        continue;
      }
      index++;
      continue;
    }

    // Format values sit next to their flag and are never the prompt.
    if (arg === FORMAT_JSON || arg === FORMAT_STREAM_JSON || arg === FORMAT_TEXT) {
      index++;
      continue;
    }

    return arg;
  }

  return '';
}

/**
 * Controllable async iterable for sending user messages to the V1 query API.
 *
 * Handed to `query()` as its `prompt`, so pushing a message here starts the
 * next turn. This is the session's normal input path — `Query.streamInput()` is
 * a separate, optional channel.
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
