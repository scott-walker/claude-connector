/**
 * Type barrel — every public type of the library, re-exported from its module.
 *
 * Hand-maintained and kept in lock-step with the value/type list in
 * `src/index.ts`: a type missing here is unreachable for consumers.
 *
 * @module
 */

// ── Client options & configuration ────────────────────────────────
export type {
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
  McpSdkServerConfigWithInstance,
  McpSdkServerStatusConfig,
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
} from './client.js';

// ── Hooks ─────────────────────────────────────────────────────────
export type {
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
} from './hooks.js';

// ── Results & stream events ───────────────────────────────────────
export type {
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
} from './result.js';

// ── Sessions ──────────────────────────────────────────────────────
export type {
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
} from './session.js';

// ── Settings ──────────────────────────────────────────────────────
export type {
  Settings,
  ResolvedSettingSource,
  PolicySettingsOrigin,
  ProvenanceEntry,
  ResolvedSettingsLayer,
  ResolvedSettings,
  ResolveSettingsOptions,
} from './settings.js';
