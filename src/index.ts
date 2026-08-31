/**
 * # kraube-konnektor
 *
 * Programmatic Node.js interface for Claude Code CLI.
 *
 * ## Quick start
 *
 * ```ts
 * import { Claude } from '@scottwalker/kraube-konnektor'
 *
 * const claude = new Claude({ model: 'sonnet' })
 * const result = await claude.query('Find bugs in auth.ts')
 * console.log(result.text)
 * ```
 *
 * ## Architecture
 *
 * ```
 * ┌─────────┐     ┌─────────────┐     ┌────────────┐     ┌─────────────┐
 * │  Claude  │────>│ ArgsBuilder │────>│  IExecutor  │────>│  CLI Process │
 * │ (facade) │     │ (options→   │     │ (abstract)  │     │  (claude -p) │
 * │          │     │  CLI args)  │     │             │     │              │
 * └─────────┘     └─────────────┘     └────────────┘     └─────────────┘
 *      │                                    ▲
 *      │                                    │
 *      ▼                              ┌─────┴──────┐
 * ┌─────────┐                         │CliExecutor  │
 * │ Session │                         │ SdkExecutor │
 * │ Scheduler│                        └────────────┘
 * └─────────┘
 * ```
 *
 * @module
 */

import type {
  ForkSessionOptions,
  ForkSessionResult,
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  GetSubagentMessagesOptions,
  ImportSessionToStoreOptions,
  InMemorySessionStoreHandle,
  ListSessionsOptions,
  ListSubagentsOptions,
  McpSdkServerConfig,
  McpSdkServerConfigWithInstance,
  McpSdkServerStatusConfig,
  ResolvedSettings,
  ResolveSettingsOptions,
  SessionInfo,
  SessionKey,
  SessionMessage,
  SessionMutationOptions,
  SessionStore,
  SessionStoreEntry,
  SessionSummaryEntry,
  Settings,
  WarmQuery,
} from './types/index.js';

// ── Main client ───────────────────────────────────────────────────
export { Claude } from './client/claude.js';
export { Session } from './client/session.js';
export { StreamHandle } from './client/stream-handle.js';
export { ChatHandle } from './client/chat-handle.js';

// ── Executor abstraction ──────────────────────────────────────────
export type { IExecutor, ExecuteOptions } from './executor/interface.js';
export { CliExecutor } from './executor/cli-executor.js';
export { SdkExecutor } from './executor/sdk-executor.js';
export type { SdkExecutorOptions, SdkExecutorEvents, InitStage } from './executor/sdk-executor.js';

// ── Scheduler ─────────────────────────────────────────────────────
export { Scheduler, ScheduledJob } from './scheduler/scheduler.js';
export type { ScheduledJobEvents } from './scheduler/scheduler.js';

// ── Builder ───────────────────────────────────────────────────────
export { buildArgs, mergeOptions, resolveEnv } from './builder/args-builder.js';
export type { ResolvedOptions } from './builder/args-builder.js';

// ── Parsers ───────────────────────────────────────────────────────
export { parseJsonResult } from './parser/json-parser.js';
export { parseStreamLine, parseStreamEvents } from './parser/stream-parser.js';

// ── SDK usage-limit message prefixes (lazy: pulls the SDK module) ──
export { getUsageLimitPrefixes } from './constants.js';
export type { UsageLimitPrefixes } from './constants.js';

// ── Errors ────────────────────────────────────────────────────────
export {
  KraubeKonnektorError,
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  ParseError,
  ValidationError,
} from './errors/errors.js';

// ── Constants ─────────────────────────────────────────────────────
export {
  // Stream event types
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
  EVENT_ERROR,
  EVENT_SYSTEM,

  // Output / input formats
  FORMAT_TEXT,
  FORMAT_JSON,
  FORMAT_STREAM_JSON,

  // Task event types
  EVENT_TASK_STARTED,
  EVENT_TASK_PROGRESS,
  EVENT_TASK_NOTIFICATION,
  EVENT_TASK_UPDATED,
  EVENT_BACKGROUND_TASKS_CHANGED,

  // Rate limit
  EVENT_RATE_LIMIT,

  // Tool progress, results & summary
  EVENT_TOOL_PROGRESS,
  EVENT_TOOL_RESULT,
  EVENT_TOOL_USE_SUMMARY,

  // Auth status
  EVENT_AUTH_STATUS,

  // Hook lifecycle
  EVENT_HOOK_STARTED,
  EVENT_HOOK_PROGRESS,
  EVENT_HOOK_RESPONSE,

  // File persistence
  EVENT_FILES_PERSISTED,

  // Context compaction & usage
  EVENT_COMPACT_BOUNDARY,
  EVENT_CONTEXT_USAGE,

  // Local command output
  EVENT_LOCAL_COMMAND_OUTPUT,

  // Extended thinking
  EVENT_THINKING,
  EVENT_THINKING_TOKENS,

  // API retries & model refusals
  EVENT_API_RETRY,
  EVENT_MODEL_REFUSAL_FALLBACK,
  EVENT_MODEL_REFUSAL_NO_FALLBACK,

  // Session & worker lifecycle
  EVENT_SESSION_STATE_CHANGED,
  EVENT_STATUS,
  EVENT_WORKER_SHUTTING_DOWN,
  EVENT_CONVERSATION_RESET,
  EVENT_MIRROR_ERROR,
  EVENT_INIT,

  // Permissions & notifications
  EVENT_PERMISSION_DENIED,
  EVENT_NOTIFICATION,
  EVENT_INFORMATIONAL,
  EVENT_PROMPT_SUGGESTION,

  // Partial messages & memory
  EVENT_PARTIAL_MESSAGE,
  EVENT_MEMORY_RECALL,

  // Commands, plugins & elicitation
  EVENT_COMMANDS_CHANGED,
  EVENT_PLUGIN_INSTALL,
  EVENT_ELICITATION_COMPLETE,
  EVENT_CONTROL_REQUEST_PROGRESS,

  // Hook events
  HOOK_PRE_TOOL_USE,
  HOOK_POST_TOOL_USE,
  HOOK_POST_TOOL_USE_FAILURE,
  HOOK_POST_TOOL_BATCH,
  HOOK_NOTIFICATION,
  HOOK_USER_PROMPT_SUBMIT,
  HOOK_USER_PROMPT_EXPANSION,
  HOOK_SESSION_START,
  HOOK_SESSION_END,
  HOOK_STOP,
  HOOK_STOP_FAILURE,
  HOOK_SUBAGENT_START,
  HOOK_SUBAGENT_STOP,
  HOOK_PRE_COMPACT,
  HOOK_POST_COMPACT,
  HOOK_PRE_MODEL_SWITCH,
  HOOK_POST_MODEL_SWITCH,
  HOOK_PERMISSION_REQUEST,
  HOOK_PERMISSION_DENIED,
  HOOK_SETUP,
  HOOK_TEAMMATE_IDLE,
  HOOK_TASK_CREATED,
  HOOK_TASK_COMPLETED,
  HOOK_ELICITATION,
  HOOK_ELICITATION_RESULT,
  HOOK_CONFIG_CHANGE,
  HOOK_WORKTREE_CREATE,
  HOOK_WORKTREE_REMOVE,
  HOOK_INSTRUCTIONS_LOADED,
  HOOK_CWD_CHANGED,
  HOOK_FILE_CHANGED,
  HOOK_DIRECTORY_ADDED,
  HOOK_MESSAGE_DISPLAY,
  VALID_HOOK_EVENTS,

  // Permission modes
  PERMISSION_DEFAULT,
  PERMISSION_ACCEPT_EDITS,
  PERMISSION_PLAN,
  PERMISSION_DONT_ASK,
  PERMISSION_BYPASS,
  PERMISSION_AUTO,
  PERMISSION_MANUAL,
  VALID_PERMISSION_MODES,

  // Effort levels
  EFFORT_LOW,
  EFFORT_MEDIUM,
  EFFORT_HIGH,
  EFFORT_XHIGH,
  EFFORT_MAX,
  VALID_EFFORT_LEVELS,

  // Result subtypes & terminal reasons
  RESULT_SUCCESS,
  RESULT_ERROR_DURING_EXECUTION,
  RESULT_ERROR_MAX_TURNS,
  RESULT_ERROR_MAX_BUDGET_USD,
  RESULT_ERROR_MAX_STRUCTURED_OUTPUT_RETRIES,
  VALID_RESULT_SUBTYPES,
  VALID_TERMINAL_REASONS,
  VALID_RATE_LIMIT_TYPES,

  // MCP transports
  MCP_STDIO,
  MCP_HTTP,
  MCP_SSE,
  MCP_SDK,
  MCP_CLAUDEAI_PROXY,
  VALID_MCP_TRANSPORTS,

  // Scheduler events
  SCHED_RESULT,
  SCHED_ERROR,
  SCHED_TICK,
  SCHED_STOP,

  // Init events
  INIT_EVENT_STAGE,
  INIT_EVENT_READY,
  INIT_EVENT_ERROR,

  // Defaults
  DEFAULT_EXECUTABLE,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_INIT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFER_BYTES,

  // Content block types
  BLOCK_TEXT,
  BLOCK_TOOL_USE,
  BLOCK_TOOL_RESULT,
  BLOCK_THINKING,
  BLOCK_REDACTED_THINKING,

  // SDK-mirrored literals
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  RESUME_REJECTED_PREFIX,
  BETA_CONTEXT_1M,
} from './constants.js';

// ── Types ─────────────────────────────────────────────────────────
export type {
  // Client options & configuration
  ClientOptions,
  QueryOptions,
  // Permissions
  PermissionMode,
  PermissionBehavior,
  PermissionDecisionClassification,
  PermissionResult,
  PermissionRuleValue,
  PermissionUpdateDestination,
  PermissionUpdate,
  CanUseTool,
  // Extended thinking
  ThinkingDisplay,
  ThinkingAdaptive,
  ThinkingEnabled,
  ThinkingDisabled,
  ThinkingConfig,
  // Elicitation & dialogs
  ElicitationRequest,
  ElicitationResult,
  OnElicitation,
  UserDialogRequest,
  UserDialogResult,
  OnUserDialog,
  // Model effort & betas
  EffortLevel,
  SdkBeta,
  // Tool configuration
  ToolsPresetConfig,
  ToolConfig,
  // MCP servers
  McpServerToolPolicy,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  McpServerConfig,
  McpSdkServerConfig,
  McpSdkServerStatusConfig,
  McpSdkServerConfigWithInstance,
  McpClaudeAIProxyServerConfig,
  McpServerStatusConfig,
  McpPermissionModeOverride,
  AgentMcpServerSpec,
  // Agents
  AgentConfig,
  // Settings & plugins
  SettingSource,
  FlagSettings,
  LocalPluginConfig,
  UrlPluginConfig,
  PluginConfig,
  // Sandbox
  SandboxNetworkConfig,
  SandboxFilesystemConfig,
  SandboxCredentialFile,
  SandboxCredentialEnvVar,
  SandboxAwsCredentialPair,
  SandboxSigv4Config,
  SandboxCredentialsConfig,
  SandboxConfig,
  SandboxSettings,
  // Process spawning
  SpawnOptions,
  SpawnedProcess,

  // Hooks
  HookEvent,
  HookPermissionDecision,
  BackgroundTaskSummary,
  SessionCronSummary,
  SDKAssistantMessageError,
  ExitReason,
  PostToolBatchToolCall,
  // Hook inputs
  BaseHookInput,
  UnknownHookInput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
  PostToolBatchHookInput,
  PermissionDeniedHookInput,
  NotificationHookInput,
  UserPromptSubmitHookInput,
  UserPromptExpansionHookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  StopHookInput,
  StopFailureHookInput,
  SubagentStartHookInput,
  SubagentStopHookInput,
  PreCompactHookInput,
  PostCompactHookInput,
  PreModelSwitchHookInput,
  PostModelSwitchHookInput,
  PermissionRequestHookInput,
  SetupHookInput,
  TeammateIdleHookInput,
  TaskCreatedHookInput,
  TaskCompletedHookInput,
  ElicitationHookInput,
  ElicitationResultHookInput,
  ConfigChangeHookInput,
  InstructionsLoadedHookInput,
  WorktreeCreateHookInput,
  WorktreeRemoveHookInput,
  CwdChangedHookInput,
  FileChangedHookInput,
  DirectoryAddedHookInput,
  MessageDisplayHookInput,
  HookInput,
  // Hook outputs
  PreToolUseHookSpecificOutput,
  UserPromptSubmitHookSpecificOutput,
  UserPromptExpansionHookSpecificOutput,
  SessionStartHookSpecificOutput,
  SetupHookSpecificOutput,
  PreModelSwitchHookSpecificOutput,
  PostModelSwitchHookSpecificOutput,
  SubagentStartHookSpecificOutput,
  PostToolUseHookSpecificOutput,
  PostToolUseFailureHookSpecificOutput,
  PostToolBatchHookSpecificOutput,
  StopHookSpecificOutput,
  SubagentStopHookSpecificOutput,
  PermissionDeniedHookSpecificOutput,
  NotificationHookSpecificOutput,
  PermissionRequestHookSpecificOutput,
  ElicitationHookSpecificOutput,
  ElicitationResultHookSpecificOutput,
  CwdChangedHookSpecificOutput,
  FileChangedHookSpecificOutput,
  WorktreeCreateHookSpecificOutput,
  MessageDisplayHookSpecificOutput,
  HookSpecificOutput,
  SyncHookJSONOutput,
  AsyncHookJSONOutput,
  HookJSONOutput,
  // Hook registration
  HookCallback,
  HookCallbackMatcher,
  CommandHookEntry,
  PromptHookEntry,
  AgentHookEntry,
  HttpHookEntry,
  McpToolHookEntry,
  HookEntry,
  HookMatcher,
  HooksConfig,

  // Results & stream events
  QueryResult,
  StreamEvent,
  StreamTextEvent,
  StreamToolUseEvent,
  StreamResultEvent,
  StreamErrorEvent,
  StreamSystemEvent,
  // Result metadata
  ResultSubtype,
  TerminalReason,
  FastModeState,
  PermissionDenial,
  DeferredToolUse,
  MessageOrigin,
  // Rate limits
  RateLimitStatus,
  RateLimitType,
  StreamRateLimitEvent,
  // Task events
  StreamTaskStartedEvent,
  StreamTaskProgressEvent,
  StreamTaskNotificationEvent,
  StreamTaskUpdatedEvent,
  StreamBackgroundTasksChangedEvent,
  // Tool events
  StreamToolProgressEvent,
  StreamToolResultEvent,
  StreamToolUseSummaryEvent,
  // Auth status
  StreamAuthStatusEvent,
  // Hook lifecycle
  StreamHookStartedEvent,
  StreamHookProgressEvent,
  StreamHookResponseEvent,
  // File persistence
  StreamFilesPersistedEvent,
  // Context compaction & usage
  StreamCompactBoundaryEvent,
  StreamContextUsageEvent,
  // Local command output
  StreamLocalCommandOutputEvent,
  // Extended thinking
  StreamThinkingEvent,
  StreamThinkingTokensEvent,
  // API retries & model refusals
  StreamApiRetryEvent,
  StreamModelRefusalFallbackEvent,
  StreamModelRefusalNoFallbackEvent,
  // Session & worker lifecycle
  StreamSessionStateChangedEvent,
  StreamStatusEvent,
  StreamWorkerShuttingDownEvent,
  StreamConversationResetEvent,
  StreamMirrorErrorEvent,
  StreamInitEvent,
  // Permissions & notifications
  StreamPermissionDeniedEvent,
  StreamNotificationEvent,
  StreamInformationalEvent,
  StreamPromptSuggestionEvent,
  // Partial messages & memory
  StreamPartialMessageEvent,
  StreamMemoryRecallEvent,
  // Commands, plugins & elicitation
  StreamCommandsChangedEvent,
  StreamPluginInstallEvent,
  StreamElicitationCompleteEvent,
  StreamControlRequestProgressEvent,
  // Info types
  AccountInfo,
  ModelInfo,
  SlashCommand,
  AgentInfo,
  McpServerStatus,
  McpSetServersResult,
  RewindFilesResult,
  InterruptResult,
  InitializationResult,
  ReadFileResult,
  ReloadPluginsResult,
  ReloadSkillsResult,
  McpPermissionModeOverrideResult,
  // Context usage
  ContextUsageCategory,
  ContextUsage,
  // Usage reporting
  UsageReport,
  RateLimitWindow,
  RateLimitWindows,
  UsageBehaviors,
  UsageAttributionEntry,
  UsageBehaviorWindow,
  TokenUsage,
  ModelUsageEntry,
  ModelUsage,
  // Messages & content blocks
  Message,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  RedactedThinkingBlock,

  // Sessions
  SessionOptions,
  SessionInfo,
  SessionMessage,
  // Session mutation
  SessionMutationOptions,
  ForkSessionOptions,
  ForkSessionResult,
  // Session reads
  GetSessionInfoOptions,
  ListSessionsOptions,
  GetSessionMessagesOptions,
  ListSubagentsOptions,
  GetSubagentMessagesOptions,
  // Session stores
  SessionKey,
  SessionStoreEntry,
  SessionSummaryEntry,
  SessionStoreFlush,
  SessionStore,
  InMemorySessionStoreHandle,
  ImportSessionToStoreOptions,
  // Pre-warmed queries
  WarmQuery,

  // Settings
  Settings,
  ResolvedSettingSource,
  PolicySettingsOrigin,
  ProvenanceEntry,
  ResolvedSettingsLayer,
  ResolvedSettings,
  ResolveSettingsOptions,
} from './types/index.js';

// ── SDK Re-exports ────────────────────────────────────────────────
// Thin wrappers over the top-level helpers of @anthropic-ai/claude-agent-sdk.
//
// The SDK is a hard dependency, but it is reached through a dynamic `import()`
// so CLI-mode consumers never pay its load cost: the module is resolved on the
// first wrapper call, not when this package is imported. A broken or missing
// install therefore surfaces at call time, never at import time.

/** Shape of the lazily-loaded SDK module. */
type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk');

/** Memoized module promise — the SDK is resolved at most once per process. */
let sdkModulePromise: Promise<SdkModule> | null = null;

/** Resolve the SDK module, reusing the in-flight or completed import. */
function loadSdk(): Promise<SdkModule> {
  sdkModulePromise ??= import('@anthropic-ai/claude-agent-sdk').catch((error: unknown) => {
    // Never memoize a failure — the next call retries, as it did before the
    // module promise was cached.
    sdkModulePromise = null;
    throw error;
  });
  return sdkModulePromise;
}

/**
 * Create an in-process MCP server for custom tools (SDK mode only).
 *
 * @example
 * ```ts
 * import { createSdkMcpServer, sdkTool } from '@scottwalker/kraube-konnektor'
 * import { z } from 'zod/v4'
 *
 * const server = await createSdkMcpServer({
 *   name: 'my-tools',
 *   tools: [
 *     await sdkTool('getPrice', 'Get stock price', { ticker: z.string() },
 *       async (args) => {
 *         const { ticker } = args as { ticker: string }
 *         return { content: [{ type: 'text', text: `142.50 (${ticker})` }] }
 *       }
 *     ),
 *   ],
 * })
 *
 * const claude = new Claude({ mcpServers: { prices: server } })
 * ```
 */
export async function createSdkMcpServer(options: {
  name: string;
  version?: string;
  tools?: Array<unknown>;
}): Promise<McpSdkServerConfig> {
  const sdk = await loadSdk();
  return sdk.createSdkMcpServer(options as Parameters<typeof sdk.createSdkMcpServer>[0]) as unknown as McpSdkServerConfig;
}

/**
 * Define a custom MCP tool for use with `createSdkMcpServer()`.
 *
 * @example
 * ```ts
 * import { sdkTool } from '@scottwalker/kraube-konnektor'
 * import { z } from 'zod/v4'
 *
 * const myTool = await sdkTool('greet', 'Say hello', { name: z.string() },
 *   async (args) => {
 *     const { name } = args as { name: string }
 *     return { content: [{ type: 'text', text: `Hello ${name}!` }] }
 *   }
 * )
 * ```
 */
export async function sdkTool(
  name: string,
  description: string,
  inputSchema: unknown,
  handler: (args: unknown, extra: unknown) => Promise<unknown>,
  extras?: { annotations?: Record<string, boolean> },
): Promise<unknown> {
  const sdk = await loadSdk();
  return sdk.tool(name, description, inputSchema as Parameters<typeof sdk.tool>[2], handler as Parameters<typeof sdk.tool>[3], extras as Parameters<typeof sdk.tool>[4]);
}

/**
 * Pre-warm a CLI subprocess so the first prompt hits a ready process.
 *
 * The producer of {@link WarmQuery}, and the escape hatch for driving a raw SDK
 * `Query` outside the {@link Claude} facade. Most consumers want
 * `claude.init()` / `claude.ready` instead, which warm the same subprocess
 * through this library's own lifecycle events and keep the facade's result
 * shape.
 *
 * The handle is single-use: `query()` may be called once, and a handle you
 * decide not to use must be released with `close()` or the subprocess outlives
 * the caller.
 *
 * @param params - `options` is the SDK's own `Options` object, not
 *   {@link ClientOptions} — nothing about the returned handle goes through this
 *   library's option mapping. `initializeTimeoutMs` caps the handshake.
 *
 * @example
 * ```ts
 * const warm = await startup({ options: { model: 'sonnet' } })
 * // ... later, with no startup latency:
 * for await (const message of warm.query('Find bugs in auth.ts')) {
 *   if (message.type === 'result') console.log(message.result)
 * }
 * ```
 */
export async function startup(params?: {
  readonly options?: import('@anthropic-ai/claude-agent-sdk').Options;
  readonly initializeTimeoutMs?: number;
}): Promise<WarmQuery> {
  const sdk = await loadSdk();
  return sdk.startup(params);
}

// ── Session management ────────────────────────────────────────────

/**
 * List stored sessions, newest first.
 *
 * Omitting `dir` scans every project directory; passing it restricts the scan
 * to one project (and, by default, its git worktrees). Headless runs made by
 * this library are included unless `includeProgrammatic: false` is passed.
 *
 * @example
 * ```ts
 * const recent = await listSessions({ dir: process.cwd(), limit: 10 })
 * for (const s of recent) console.log(s.sessionId, s.summary)
 * ```
 */
export async function listSessions(options?: ListSessionsOptions): Promise<SessionInfo[]> {
  const sdk = await loadSdk();
  return sdk.listSessions(options);
}

/**
 * Read one session's metadata without scanning the whole project.
 *
 * Resolves to `undefined` — never throws — for a session that does not exist,
 * is a sidechain (subagent) transcript, or has no extractable summary.
 *
 * @example
 * ```ts
 * const info = await getSessionInfo(sessionId, { dir: process.cwd() })
 * if (info) console.log(info.customTitle ?? info.summary, info.gitBranch)
 * ```
 */
export async function getSessionInfo(
  sessionId: string,
  options?: GetSessionInfoOptions,
): Promise<SessionInfo | undefined> {
  const sdk = await loadSdk();
  return sdk.getSessionInfo(sessionId, options);
}

/**
 * Read a session's transcript.
 *
 * System messages (compact boundaries, informational notices) are excluded
 * unless `includeSystemMessages: true` is passed. Use `parent_agent_id` on the
 * returned messages to rebuild the subagent tree from the flat list.
 *
 * @example
 * ```ts
 * const messages = await getSessionMessages(sessionId, { limit: 50 })
 * ```
 */
export async function getSessionMessages(
  sessionId: string,
  options?: GetSessionMessagesOptions,
): Promise<SessionMessage[]> {
  const sdk = await loadSdk();
  return sdk.getSessionMessages(sessionId, options);
}

/**
 * List the `agentId`s of every subagent spawned inside a session.
 *
 * The ids feed straight into {@link getSubagentMessages}. They identify
 * *spawned* subagent transcripts — unrelated to `AgentInfo`, which describes
 * *configured* agent definitions.
 *
 * @example
 * ```ts
 * for (const agentId of await listSubagents(sessionId)) {
 *   const transcript = await getSubagentMessages(sessionId, agentId)
 * }
 * ```
 */
export async function listSubagents(
  sessionId: string,
  options?: ListSubagentsOptions,
): Promise<string[]> {
  const sdk = await loadSdk();
  return sdk.listSubagents(sessionId, options);
}

/**
 * Read one subagent's transcript.
 *
 * Closes the loop with the live `task_started` / `task_progress` stream events:
 * those report subagent activity as it happens, this reads it back afterwards.
 */
export async function getSubagentMessages(
  sessionId: string,
  agentId: string,
  options?: GetSubagentMessagesOptions,
): Promise<SessionMessage[]> {
  const sdk = await loadSdk();
  return sdk.getSubagentMessages(sessionId, agentId, options);
}

/**
 * Copy a session's transcript into a brand-new session, remapping every message
 * UUID and preserving the parent chain.
 *
 * **Not** the same as `SessionOptions.fork` / the `--fork-session` flag, which
 * branches on the *next* turn. This copies an existing transcript without
 * running a turn, so the fork is usable immediately. Forked sessions start
 * without undo history — file-history snapshots are not copied.
 *
 * @example
 * ```ts
 * const { sessionId } = await forkSession(original, { title: 'What-if branch' })
 * const branch = claude.session({ resume: sessionId })
 * ```
 */
export async function forkSession(
  sessionId: string,
  options?: ForkSessionOptions,
): Promise<ForkSessionResult> {
  const sdk = await loadSdk();
  return sdk.forkSession(sessionId, options);
}

/**
 * Set a session's custom title.
 *
 * The title is appended to the transcript, so it surfaces afterwards as
 * `SessionInfo.customTitle` (and as `summary` when nothing better exists).
 *
 * @example
 * ```ts
 * await renameSession(sessionId, 'Auth refactor', { dir: process.cwd() })
 * ```
 */
export async function renameSession(
  sessionId: string,
  title: string,
  options?: SessionMutationOptions,
): Promise<void> {
  const sdk = await loadSdk();
  await sdk.renameSession(sessionId, title, options);
}

/**
 * Set or clear a session's tag, surfaced afterwards as `SessionInfo.tag`.
 *
 * Pass `null` to clear it — that is the explicit clear command, not "leave
 * unchanged", which is why the parameter is `string | null` and not optional.
 *
 * @example
 * ```ts
 * await tagSession(sessionId, 'release-audit')
 * await tagSession(sessionId, null) // clear
 * ```
 */
export async function tagSession(
  sessionId: string,
  tag: string | null,
  options?: SessionMutationOptions,
): Promise<void> {
  const sdk = await loadSdk();
  await sdk.tagSession(sessionId, tag, options);
}

/**
 * Delete a session.
 *
 * Without `sessionStore`: removes `{sessionId}.jsonl` and the `{sessionId}/`
 * subagent-transcript directory from the local projects dir, and **throws** if
 * the session is not found.
 *
 * With `sessionStore`: calls `store.delete()` when the adapter implements it,
 * and is a silent no-op otherwise — the right behaviour for WORM/append-only
 * backends.
 */
export async function deleteSession(
  sessionId: string,
  options?: SessionMutationOptions,
): Promise<void> {
  const sdk = await loadSdk();
  await sdk.deleteSession(sessionId, options);
}

/**
 * Copy a local JSONL session (and, by default, its subagent transcripts) into a
 * {@link SessionStore}.
 *
 * `store.append()` is called repeatedly — once per batch of `batchSize` (500)
 * entries — so adapters must treat `SessionStoreEntry.uuid` as an idempotency
 * key or a replay duplicates rows.
 *
 * @alpha
 *
 * @example
 * ```ts
 * const store = await createInMemorySessionStore()
 * await importSessionToStore(sessionId, store, { dir: process.cwd() })
 * ```
 */
export async function importSessionToStore(
  sessionId: string,
  store: SessionStore,
  options?: ImportSessionToStoreOptions,
): Promise<void> {
  const sdk = await loadSdk();
  await sdk.importSessionToStore(sessionId, store, options);
}

/**
 * Create the SDK's in-memory {@link SessionStore}.
 *
 * A factory rather than a re-exported class, so the SDK stays behind the same
 * lazy `import()` as every other wrapper here.
 *
 * Test/development only — all data dies with the process.
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
export async function createInMemorySessionStore(): Promise<InMemorySessionStoreHandle> {
  const sdk = await loadSdk();
  return new sdk.InMemorySessionStore();
}

/**
 * Synchronous helpers for {@link SessionStore} implementations.
 *
 * @alpha
 */
export interface SessionStoreHelpers {
  /**
   * Fold a batch of appended entries into the running summary for `key`.
   *
   * Call it from inside `append()` to keep a {@link SessionSummaryEntry}
   * sidecar current without re-reading the transcript. `prev` is the previous
   * summary for the same key, or `undefined` on the first append; the returned
   * `data` blob is opaque — persist it verbatim.
   *
   * `mtime` is not derived from entry timestamps: stamp it at persist time from
   * the same clock that feeds `SessionStore.listSessions().mtime`. When omitted,
   * the previous summary's `mtime` is preserved.
   *
   * The fold itself is pure; serializing the read-fold-write is the store's job.
   */
  readonly foldSessionSummary: (
    prev: SessionSummaryEntry | undefined,
    key: SessionKey,
    entries: SessionStoreEntry[],
    options?: { mtime?: number },
  ) => SessionSummaryEntry;
}

/**
 * Load the synchronous {@link SessionStore} helpers.
 *
 * `foldSessionSummary` is deliberately **not** wrapped as an async function:
 * stores call it from inside the read-fold-write critical section of
 * `append()`, and making it a promise would break that contract. Awaiting this
 * accessor once resolves the SDK module and hands back the plain sync function.
 *
 * @alpha
 *
 * @example
 * ```ts
 * const { foldSessionSummary } = await loadSessionStoreHelpers()
 *
 * const store: SessionStore = {
 *   async append(key, entries) {
 *     const prev = await db.readSummary(key)
 *     const next = foldSessionSummary(prev, key, entries, { mtime: Date.now() })
 *     await db.write(key, entries, next)
 *   },
 *   async load(key) { return (await db.read(key)) ?? null },
 * }
 * ```
 */
export async function loadSessionStoreHelpers(): Promise<SessionStoreHelpers> {
  const sdk = await loadSdk();
  return { foldSessionSummary: sdk.foldSessionSummary };
}

// ── Settings resolution ───────────────────────────────────────────

/**
 * Resolve the effective settings a query would see, without spawning the CLI.
 *
 * @remarks
 * The result is the **raw settings cascade**, not a security decision:
 *
 * - The policy tier matches CLI startup (`managed-settings.json`, remote-cached
 *   managed settings, MDM via macOS plist or Windows HKLM/HKCU, and
 *   `managedSettings`) **except** that the admin-configured `policyHelper`
 *   subprocess is not executed.
 * - `permissions.defaultMode` is reported unfiltered across all tiers,
 *   including repo-committed `project` settings. Pass the result through
 *   {@link SettingsHelpers.filterEscalatingDefaultMode} before acting on it.
 *
 * @alpha
 *
 * @example
 * ```ts
 * const resolved = await resolveSettings({ cwd: process.cwd() })
 * console.log(resolved.provenance.model?.source) // 'project' | 'managed' | ...
 * ```
 */
export async function resolveSettings(options?: ResolveSettingsOptions): Promise<ResolvedSettings> {
  const sdk = await loadSdk();
  if (!options) return sdk.resolveSettings();

  // `settingSources` is readonly here (house convention) but mutable in the SDK.
  const { settingSources, ...rest } = options;
  return sdk.resolveSettings(
    settingSources ? { ...rest, settingSources: [...settingSources] } : rest,
  );
}

/**
 * Synchronous helpers for interpreting {@link ResolvedSettings}.
 *
 * @alpha
 */
export interface SettingsHelpers {
  /**
   * Apply the trust-tier filter the CLI applies before honoring escalating
   * permission modes from settings: when `permissions.defaultMode` is
   * escalating (`bypassPermissions`, `auto`, `acceptEdits`) **and** came from a
   * repo-committed tier (`project`), it is dropped from the returned settings.
   *
   * Not optional garnish — `resolveSettings()` reports modes the CLI would
   * refuse to honor, so acting on `defaultMode` without this filter trusts an
   * untrusted value.
   */
  readonly filterEscalatingDefaultMode: (resolved: ResolvedSettings) => Settings;
}

/**
 * Load the synchronous settings helpers.
 *
 * Like {@link loadSessionStoreHelpers}, this is an accessor rather than an
 * async wrapper: `filterEscalatingDefaultMode` is a pure synchronous function
 * and stays one.
 *
 * @alpha
 *
 * @example
 * ```ts
 * const resolved = await resolveSettings({ cwd: process.cwd() })
 * const { filterEscalatingDefaultMode } = await loadSettingsHelpers()
 * const trusted = filterEscalatingDefaultMode(resolved)
 * console.log(trusted.permissions?.defaultMode)
 * ```
 */
export async function loadSettingsHelpers(): Promise<SettingsHelpers> {
  const sdk = await loadSdk();
  return {
    // `sources` is readonly here (house convention) but mutable in the SDK, so
    // the array is copied rather than cast away.
    filterEscalatingDefaultMode: (resolved) =>
      sdk.filterEscalatingDefaultMode({ ...resolved, sources: [...resolved.sources] }),
  };
}
