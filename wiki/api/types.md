# Types

All TypeScript interfaces and type aliases exported by the package.

```typescript
import type {
  // Core
  ClientOptions,
  QueryOptions,
  QueryResult,
  StreamEvent,
  TokenUsage,
  Message,
  ContentBlock,
  // Enumerations
  PermissionMode,
  EffortLevel,
  ResultSubtype,
  TerminalReason,
  SettingSource,
  // Permission types
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
  PermissionBehavior,
  PermissionRuleValue,
  PermissionUpdateDestination,
  PermissionDenial,
  // Thinking types
  ThinkingConfig,
  ThinkingAdaptive,
  ThinkingEnabled,
  ThinkingDisabled,
  ThinkingDisplay,
  // Tools, skills and sandboxing
  ToolsPresetConfig,
  ToolConfig,
  SandboxConfig,
  SandboxNetworkConfig,
  SandboxFilesystemConfig,
  // Hook types — see the Hooks page
  HookEvent,
  HookInput,
  HookJSONOutput,
  HookCallback,
  HookCallbackMatcher,
  HookEntry,
  HookMatcher,
  HooksConfig,
  // MCP types
  McpServerConfig,
  McpSdkServerConfig,
  McpServerStatus,
  McpSetServersResult,
  McpPermissionModeOverride,
  // Config types
  Settings,
  FlagSettings,
  PluginConfig,
  SpawnOptions,
  SpawnedProcess,
  OnElicitation,
  OnUserDialog,
  ElicitationRequest,
  // Info / result types
  AccountInfo,
  ModelInfo,
  SlashCommand,
  AgentInfo,
  RewindFilesResult,
  ReadFileResult,
  InitializationResult,
  InterruptResult,
  ContextUsage,
  UsageReport,
  ModelUsageEntry,
  // Sessions — see the Session Management page
  SessionInfo,
  SessionMessage,
  SessionStore,
} from '@scottwalker/kraube-konnektor'
```

## ClientOptions

Configuration for the Claude client instance. Options set here act as defaults for all queries, and are frozen after construction.

82 fields, grouped below by what they control. Every field is `readonly` and optional.

::: warning Mode matters
Some options only exist in one execution mode. In SDK mode the session is built once, so options are read at construction; in CLI mode they become flags on every spawn. The "Mode" note on each row is authoritative — an option marked *SDK* is ignored when `useSdk: false`, and vice versa.
:::

### Process and mode

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `useSdk` | `boolean` | `true` | Use the Agent SDK (persistent session) instead of CLI mode |
| `executable` | `string` | `'claude'` | Path to the CLI binary |
| `runtime` | `'bun' \| 'deno' \| 'node'` | -- | JS runtime that hosts the SDK subprocess. *SDK* |
| `runtimeArgs` | `string[]` | -- | Extra argv for the runtime itself, not for Claude Code. *SDK* |
| `spawnClaudeCodeProcess` | `(options: SpawnOptions) => SpawnedProcess` | -- | Custom spawner for VMs/containers. *SDK* |
| `cwd` | `string` | `process.cwd()` | Working directory |
| `env` | `Record<string, string>` | -- | Extra environment variables |
| `additionalDirs` | `string[]` | -- | Extra directories Claude may read and write |
| `initTimeoutMs` | `number` | `120000` | Warm-up timeout. *SDK* |
| `postResultDrainMs` | `number` | `0` | How long to keep reading after a turn's `result`, in ms. `result` is not the last frame — `prompt_suggestion`, a trailing `task_notification` and `session_state_changed` follow it. `session_state_changed: 'idle'` closes the window early. *SDK* |
| `stderr` | `(data: string) => void` | -- | Callback for subprocess stderr. *SDK* |
| `extraArgs` | `Record<string, string \| null>` | -- | Raw flags for options this wrapper does not model (`null` = valueless flag). Honoured in **both** modes, so it also reaches a CLI-only flag from SDK mode |

### Model and reasoning

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `string` | `'sonnet'` | `'opus'`, `'sonnet'`, `'haiku'`, or a full model ID |
| `fallbackModel` | `string \| string[]` | -- | Fallback chain when the primary model is unavailable. An array is joined into one comma-separated `--fallback-model` in both modes |
| `effortLevel` | [`EffortLevel`](#effortlevel) | -- | Reasoning depth |
| `thinking` | [`ThinkingConfig`](#thinkingconfig) | -- | Extended-thinking behavior |
| `maxThinkingTokens` | `number` | -- | Thinking token budget. Superseded by `thinking` when both are set |

### Prompt composition

| Field | Type | Description |
|-------|------|-------------|
| `systemPrompt` | `string \| string[]` | Replace the preset system prompt. The array form splits on `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`: everything before it is a cacheable prefix. *SDK only for the array form* |
| `appendSystemPrompt` | `string` | Append to the preset system prompt. Ignored when `systemPrompt` is set |
| `systemPromptFile` | `string` | Read the replacement system prompt from a file. *CLI* |
| `appendSystemPromptFile` | `string` | Read the appended system prompt from a file. *CLI* |
| `appendSubagentSystemPrompt` | `string` | Append to every subagent's system prompt. *CLI* |
| `excludeDynamicSystemPromptSections` | `boolean` | Drop the environment/git/directory sections from the preset prompt |
| `planModeInstructions` | `string` | Replace the body of the built-in plan-mode workflow, while `permissionMode` is `'plan'` (`--plan-mode-instructions`) |

### Tools, skills and permissions

| Field | Type | Description |
|-------|------|-------------|
| `tools` | `string[] \| ToolsPresetConfig` | Which tools **exist**. `[]` disables all; `{ type: 'preset', preset: 'claude_code' }` (or the legacy `['default']`) restores the full set |
| `allowedTools` | `string[]` | Which existing tools are **auto-approved** (supports rule syntax such as `Bash(npm run *)`) |
| `disallowedTools` | `string[]` | Always-denied tools |
| `toolAliases` | `Record<string, string>` | Redirect a built-in tool to an MCP tool, e.g. `{ Bash: 'mcp__workspace__bash' }`. Single-hop. *SDK* |
| `toolConfig` | [`ToolConfig`](#toolconfig) | Per-tool settings for built-in tools. *SDK* |
| `skills` | `string[] \| 'all'` | Skills to load. The only supported way to enable skills. *SDK* |
| `disableSlashCommands` | `boolean` | Disable every slash command, and therefore every skill. *CLI* |
| `permissionMode` | [`PermissionMode`](#permissionmode) | Tool approval behavior |
| `canUseTool` | [`CanUseTool`](#canusetool) | Programmatic permission handler. *SDK* |
| `permissionPromptToolName` | `string` | MCP tool that answers permission prompts. Works in both modes, and is the only way to answer an `ask` decision in CLI mode |
| `allowDangerouslySkipPermissions` | `boolean` | Required alongside `permissionMode: 'bypassPermissions'` — a guard against bypassing them by accident |
| `dangerouslySkipPermissions` | `boolean` | Skip every permission check for the whole run — the always-on form of `bypassPermissions`. *CLI*, dangerous |
| `safeMode` | `boolean` | Disable CLAUDE.md, skills, plugins, hooks, MCP servers, custom commands/agents and output styles, and set `CLAUDE_CODE_SAFE_MODE=1`. *CLI* — in effect mutually exclusive with `hooks`, `agents` and `mcpServers` |
| `sandbox` | [`SandboxConfig`](#sandboxconfig) | Run tool calls inside the OS sandbox with an egress allowlist and credential masking. *SDK* |

### Budgets and limits

| Field | Type | Description |
|-------|------|-------------|
| `maxTurns` | `number` | Max agentic turns per query |
| `maxBudget` | `number` | Max spend in USD per query |
| `taskBudgetTokens` | `number` | Token budget shared across subagent tasks |
| `autocompact` | `'auto' \| number \| string` | Auto-compaction threshold. *CLI* |

### Sessions

| Field | Type | Description |
|-------|------|-------------|
| `resume` | `string` | Resume an existing session by ID |
| `sessionId` | `string` | Pin a **new** session to a caller-supplied UUID. Rejected together with `resume`/`continueSession` unless `forkSession` is set |
| `continueSession` | `boolean` | Continue the most recent session in `cwd`. Mutually exclusive with `resume` |
| `forkSession` | `boolean` | Branch on the next turn instead of continuing in place. Use with `resume` |
| `resumeSessionAt` | `string` | Resume at a specific message UUID rather than the tail |
| `resumeDropsTurn` | `string` | Guard: the turn the resume is expected to discard. A mismatch is refused with a message starting `RESUME_REJECTED_PREFIX` |
| `noSessionPersistence` | `boolean` | Do not write the session to disk |
| `sessionStore` | [`SessionStore`](./session-management#sessionstore) | Mirror transcripts into a custom backend. *SDK*, mutually exclusive with `noSessionPersistence` |
| `sessionStoreFlush` | `'batched' \| 'eager'` | When the mirror writes. *SDK* |
| `sessionStoreLoadTimeoutMs` | `number` | Timeout for `store.load()`. Default `60000`. *SDK* |
| `name` | `string` | Display name for the session |
| `abortController` | `AbortController` | Session-wide abort. *SDK* — for a single query use [`QueryOptions.signal`](#queryoptions) |

### Hooks, agents and MCP

| Field | Type | Description |
|-------|------|-------------|
| `hooks` | [`HooksConfig`](./hooks#hooksconfig) | Configured hooks — commands, prompts, agents, HTTP endpoints, MCP tools. Honoured in **both** modes: hooks live in the CLI settings schema, so they are folded into `--settings` (CLI) or the SDK's `settings` option (SDK). Exception: a `settings` **path** cannot share the flag, so put the hooks in that file |
| `hookCallbacks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | In-process JS hook callbacks. *SDK* |
| `includeHookEvents` | `boolean` | Emit `hook_started` / `hook_progress` / `hook_response` stream events. In CLI mode requires stream-json output |
| `agents` | `Record<string, AgentConfig>` | Custom subagent definitions |
| `agent` | `string` | Select a preconfigured agent |
| `agentProgressSummaries` | `boolean` | Periodic AI-generated progress summaries for subagents. *SDK* |
| `mcpConfig` | `string \| string[]` | Path(s) to MCP config JSON. *CLI* — throws in SDK mode |
| `mcpServers` | `Record<string, McpServerConfig \| McpSdkServerConfig>` | Inline MCP server definitions |
| `strictMcpConfig` | `boolean` | Ignore MCP servers not listed in `mcpConfig` |
| `onElicitation` | [`OnElicitation`](#onelicitation) | Handler for MCP elicitation requests. *SDK* |
| `onUserDialog` | `OnUserDialog` | Handler for host-side dialogs. *SDK* |
| `supportedDialogKinds` | `string[]` | Dialog kinds the host can render. Requires `onUserDialog`, and therefore *SDK* — declaring kinds without a handler is rejected at construction |
| `plugins` | [`PluginConfig[]`](#pluginconfig) | Plugins to load. `{ type: 'url' }` is *CLI* and is rejected at construction in SDK mode; `skipMcpDiscovery` on a local plugin emits `--plugin-dir-no-mcp` |

### Stream shaping

| Field | Type | Description |
|-------|------|-------------|
| `includePartialMessages` | `boolean` | Emit `partial_message` token-level deltas. In CLI mode requires stream-json output |
| `forwardSubagentText` | `boolean` | Forward subagent text into the main stream |
| `replayUserMessages` | `boolean` | Echo user messages back. *CLI*, stream-json input **and** output |
| `promptSuggestions` | `boolean` | Emit `prompt_suggestion` events after each turn |
| `perTaskStopAffordance` | `boolean` | Declare that the host renders a per-task stop control wired to `stopTask()`. Without it a stop request interrupts the whole turn instead of one background task. *SDK* |
| `brief` | `boolean` | Terser assistant output. *CLI* |

### Settings, files and diagnostics

| Field | Type | Description |
|-------|------|-------------|
| `settingSources` | [`SettingSource[]`](#settingsource) | Which filesystem settings tiers to load (`--setting-sources`). Omitting it in SDK mode means full isolation — no settings files, and **CLAUDE.md is not read**; CLI mode keeps its own default of all three tiers until this names them. An empty array requests full isolation in both modes |
| `settings` | `string \| Settings \| Record<string, unknown>` | Settings applied to the flag layer, as a path or an object |
| `managedSettings` | `Settings \| Record<string, unknown>` | Policy-tier settings that can only tighten, never loosen. *SDK* |
| `bare` | `boolean` | Embedded mode: skip hooks, LSP, plugin sync, attribution, auto-memory, keychain reads and CLAUDE.md auto-discovery, and set `CLAUDE_CODE_SIMPLE=1`. Auth is restricted to `ANTHROPIC_API_KEY` / `apiKeyHelper`. *CLI* |
| `enableFileCheckpointing` | `boolean` | Track file changes so `rewindFiles()` works. *SDK* |
| `schema` | `Record<string, unknown>` | JSON Schema for structured output. Set once at init in SDK mode, sent as `--json-schema` per query in CLI mode |
| `betas` | `SdkBeta[]` | Beta headers, e.g. `BETA_CONTEXT_1M` |
| `debug` | `boolean \| string` | Debug logging; a string is treated as a category filter |
| `debugFile` | `string` | Write debug logs to a file; implies `debug` |

::: tip tools vs allowedTools
`tools` limits which tools **exist**. `allowedTools` controls which existing tools are **auto-approved** without prompting.
:::

::: tip settingSources
When omitted in SDK mode, no settings files are loaded and **CLAUDE.md files are not read**. Include `'project'` to load project instructions.
:::

## QueryOptions

Per-query overrides, passed to `query()`, `stream()`, `chat()` and `loop()`.

```typescript
interface QueryOptions {
  cwd?: string
  model?: string
  fallbackModel?: string | readonly string[]
  effortLevel?: EffortLevel
  permissionMode?: PermissionMode
  planModeInstructions?: string
  allowedTools?: readonly string[]
  disallowedTools?: readonly string[]
  systemPrompt?: string
  appendSystemPrompt?: string
  systemPromptFile?: string
  appendSystemPromptFile?: string
  maxTurns?: number
  maxBudget?: number
  taskBudgetTokens?: number
  input?: string
  schema?: Record<string, unknown>
  worktree?: boolean | string
  additionalDirs?: readonly string[]
  env?: Readonly<Record<string, string>>
  agent?: string
  tools?: readonly string[] | ToolsPresetConfig
  skills?: readonly string[] | 'all'
  files?: readonly string[]
  background?: boolean
  signal?: AbortSignal
  thinking?: ThinkingConfig
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cwd` | `string` | Override working directory |
| `model` | `string` | Override model |
| `fallbackModel` | `string \| string[]` | Override the fallback chain |
| `effortLevel` | [`EffortLevel`](#effortlevel) | Override reasoning depth |
| `permissionMode` | [`PermissionMode`](#permissionmode) | Override permission mode |
| `planModeInstructions` | `string` | Override plan-mode instructions |
| `allowedTools` | `string[]` | Override auto-approved tools |
| `disallowedTools` | `string[]` | Override denied tools |
| `systemPrompt` | `string` | Override the system prompt |
| `appendSystemPrompt` | `string` | Override the appended system prompt |
| `systemPromptFile` | `string` | Read the system prompt from a file |
| `appendSystemPromptFile` | `string` | Read the appended system prompt from a file |
| `maxTurns` | `number` | Override max turns |
| `maxBudget` | `number` | Override the USD budget |
| `taskBudgetTokens` | `number` | Override the subagent token budget |
| `input` | `string` | Piped stdin data (like `echo data \| claude`) |
| `schema` | `object` | JSON Schema for structured output |
| `worktree` | `boolean \| string` | Run in an isolated git worktree (`true` auto-names it) |
| `additionalDirs` | `string[]` | Override additional directories |
| `env` | `Record<string, string>` | Override environment variables |
| `agent` | `string` | Override the agent for this query |
| `tools` | `string[] \| ToolsPresetConfig` | Override which tools exist |
| `skills` | `string[] \| 'all'` | **Inert in both modes** (`@deprecated`) — set `ClientOptions.skills` |
| `files` | `string[]` | Attach files to the prompt |
| `background` | `boolean` | **Inert in both modes** (`@deprecated`) — `--bg` conflicts with `--print`; use [`AgentConfig.background`](#agentconfig) |
| `signal` | `AbortSignal` | Cancel this query |
| `thinking` | [`ThinkingConfig`](#thinkingconfig) | Override thinking config |

::: warning Per-query overrides in SDK mode
An SDK session is constructed once, so most of these cannot be changed per query.

**Bridged through the control protocol and restored afterwards:** eight of them — `model`, `permissionMode` and `thinking` as their own control requests (the `'adaptive'` form has no token-budget spelling and is skipped), and `effortLevel`, `fallbackModel`, `allowedTools`, `disallowedTools`, `additionalDirs` through `applyFlagSettings()`.

**Applied to the prompt text:** `systemPrompt` is prepended as a system instruction.

**Honoured:** `signal` — the read loop races the signal, interrupts the running turn and rejects.

**Ignored in SDK mode** — `cwd`, `env`, `input`, `planModeInstructions`, `appendSystemPrompt`, `systemPromptFile`, `appendSystemPromptFile`, `tools`, `agent`, `maxTurns`, `maxBudget`, `taskBudgetTokens`, `schema`, `worktree` and `files` are fixed when the session is constructed. Set them on `ClientOptions`, or run the query with `useSdk: false`, where every one becomes a flag.

**Inert in both modes** — `skills` (the binary has no `--skills` flag) and `background` (`--bg` conflicts with `--print`). Both are `@deprecated`.
:::

## QueryResult

Returned from [`claude.query()`](./#query) and [`session.query()`](./session#query).

```typescript
interface QueryResult {
  readonly text: string
  readonly sessionId: string
  readonly usage: TokenUsage
  readonly cost: number | null
  readonly durationMs: number
  readonly messages: readonly Message[]
  readonly structured: unknown | null
  readonly raw: Record<string, unknown>
  readonly subtype?: ResultSubtype
  readonly isError?: boolean
  readonly errors?: readonly string[]
  readonly terminalReason?: TerminalReason
  readonly modelUsage?: Readonly<Record<string, ModelUsageEntry>>
  readonly permissionDenials?: readonly PermissionDenial[]
  readonly deferredToolUse?: DeferredToolUse | null
  readonly durationApiMs?: number
  readonly queuedTurnCount?: number
  readonly ttftMs?: number
  readonly apiErrorStatus?: number | null
  readonly fastModeState?: FastModeState
  readonly origin?: MessageOrigin
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Text response from Claude |
| `sessionId` | `string` | Session ID for resuming |
| `usage` | [`TokenUsage`](#tokenusage) | Token usage for the main loop |
| `cost` | `number \| null` | Cost in USD |
| `durationMs` | `number` | Wall-clock duration in milliseconds |
| `messages` | [`Message[]`](#message) | Full conversation history |
| `structured` | `unknown \| null` | Structured output (when `schema` is used) |
| `raw` | `object` | Raw CLI JSON response |
| `subtype` | [`ResultSubtype`](#resultsubtype) | `'success'` or the exact `error_*` variant |
| `isError` | `boolean` | Whether the turn ended in an error |
| `errors` | `string[]` | Error strings collected on an `error_*` result |
| `terminalReason` | [`TerminalReason`](#terminalreason) | Why the agent loop stopped |
| `modelUsage` | `Record<string, ModelUsageEntry>` | Per-model totals across main loop, subagents, sidechains and compaction. The right field for accounting — `usage` covers the main loop only |
| `permissionDenials` | `PermissionDenial[]` | Tool calls denied during the turn |
| `deferredToolUse` | `DeferredToolUse \| null` | Tool call handed back to the caller instead of being run |
| `durationApiMs` | `number` | Time spent waiting on the API |
| `queuedTurnCount` | `number` | User sends still queued; `> 0` means another turn follows |
| `ttftMs` | `number` | Time to first token |
| `apiErrorStatus` | `number \| null` | HTTP status of the API error that ended the turn |
| `fastModeState` | `'off' \| 'cooldown' \| 'on'` | Fast-mode state at the end of the turn |
| `origin` | `MessageOrigin` | Provenance of the turn — who or what sent the prompt |

## ResultSubtype

Which result variant a turn produced. Raw values are passed through, so the union stays open to subtypes newer than this library.

```typescript
type ResultSubtype = (typeof VALID_RESULT_SUBTYPES)[number] | (string & {})
```

| Value | Constant |
|-------|----------|
| `'success'` | `RESULT_SUCCESS` |
| `'error_during_execution'` | `RESULT_ERROR_DURING_EXECUTION` |
| `'error_max_turns'` | `RESULT_ERROR_MAX_TURNS` |
| `'error_max_budget_usd'` | `RESULT_ERROR_MAX_BUDGET_USD` |
| `'error_max_structured_output_retries'` | `RESULT_ERROR_MAX_STRUCTURED_OUTPUT_RETRIES` |

::: warning Changed in 0.7.0
Before 0.7.0 every `error_*` subtype was collapsed to the single string `'error'`. Check `isError`, or compare against the constants above.
:::

## TerminalReason

Why the agent loop stopped, as decided by the CLI. Distinct from the model's `stopReason`: this says whether a budget ran out, a hook intervened, a tool was deferred, or the turn simply completed.

```typescript
type TerminalReason = (typeof VALID_TERMINAL_REASONS)[number] | (string & {})
```

`VALID_TERMINAL_REASONS` lists all 19 known values, among them `completed`, `max_turns`, `budget_exhausted`, `prompt_too_long`, `api_error`, `hook_stopped`, `stop_hook_prevented`, `tool_deferred`, `aborted_streaming`, `aborted_tools`, `blocking_limit` and `structured_output_retry_exhausted`.

## StreamEvent

Discriminated union of every streaming event. Check `event.type` to narrow; every member's `type` is an exported `EVENT_*` constant.

```typescript
type StreamEvent =
  | StreamTextEvent
  | StreamToolUseEvent
  | StreamToolResultEvent
  | StreamResultEvent
  | StreamErrorEvent
  | StreamSystemEvent
  | StreamRateLimitEvent
  | StreamTaskStartedEvent
  | StreamTaskProgressEvent
  | StreamTaskNotificationEvent
  | StreamTaskUpdatedEvent
  | StreamBackgroundTasksChangedEvent
  | StreamToolProgressEvent
  | StreamToolUseSummaryEvent
  | StreamAuthStatusEvent
  | StreamHookStartedEvent
  | StreamHookProgressEvent
  | StreamHookResponseEvent
  | StreamFilesPersistedEvent
  | StreamCompactBoundaryEvent
  | StreamLocalCommandOutputEvent
  | StreamThinkingEvent
  | StreamThinkingTokensEvent
  | StreamApiRetryEvent
  | StreamModelRefusalFallbackEvent
  | StreamModelRefusalNoFallbackEvent
  | StreamSessionStateChangedEvent
  | StreamStatusEvent
  | StreamWorkerShuttingDownEvent
  | StreamConversationResetEvent
  | StreamMirrorErrorEvent
  | StreamInitEvent
  | StreamPermissionDeniedEvent
  | StreamNotificationEvent
  | StreamInformationalEvent
  | StreamPromptSuggestionEvent
  | StreamPartialMessageEvent
  | StreamMemoryRecallEvent
  | StreamCommandsChangedEvent
  | StreamPluginInstallEvent
  | StreamElicitationCompleteEvent
  | StreamControlRequestProgressEvent
  | StreamContextUsageEvent
```

### Content and results

| Type | Constant | Key fields |
|------|----------|------------|
| `StreamTextEvent` | `EVENT_TEXT` | `text` |
| `StreamThinkingEvent` | `EVENT_THINKING` | `thinking`, `signature?`, `redacted` |
| `StreamThinkingTokensEvent` | `EVENT_THINKING_TOKENS` | `estimatedTokens`, `estimatedTokensDelta?` |
| `StreamToolUseEvent` | `EVENT_TOOL_USE` | `toolName`, `toolInput` |
| `StreamToolResultEvent` | `EVENT_TOOL_RESULT` | `toolUseId`, `content`, `isError?`, `toolUseResult?`, `isReplay?`, `isSynthetic?` |
| `StreamToolProgressEvent` | `EVENT_TOOL_PROGRESS` | `toolUseId`, `toolName`, `elapsedTimeSeconds`, `heartbeat?` |
| `StreamToolUseSummaryEvent` | `EVENT_TOOL_USE_SUMMARY` | `summary`, `precedingToolUseIds` |
| `StreamResultEvent` | `EVENT_RESULT` | `subtype`, `text`, `sessionId`, `usage`, `cost`, `durationMs`, `isError?`, `errors?`, `terminalReason?`, `modelUsage?`, `permissionDenials?`, `deferredToolUse?`, `durationApiMs?`, `queuedTurnCount?`, `ttftMs?`, `apiErrorStatus?`, `fastModeState?`, `origin?` |
| `StreamErrorEvent` | `EVENT_ERROR` | `message`, `code?`, `aborted?`, `requestId?` |
| `StreamPartialMessageEvent` | `EVENT_PARTIAL_MESSAGE` | `event`, `parentToolUseId?`, `ttftMs?`, `userMessageUuid?` |
| `StreamLocalCommandOutputEvent` | `EVENT_LOCAL_COMMAND_OUTPUT` | `content` |

### Tasks and subagents

| Type | Constant | Key fields |
|------|----------|------------|
| `StreamTaskStartedEvent` | `EVENT_TASK_STARTED` | `taskId`, `description`, `taskType?`, `prompt?`, `subagentType?`, `isBackgrounded?`, `spawnDepth?` |
| `StreamTaskProgressEvent` | `EVENT_TASK_PROGRESS` | `taskId`, `description`, `usage`, `lastToolName?`, `summary?` |
| `StreamTaskNotificationEvent` | `EVENT_TASK_NOTIFICATION` | `taskId`, `status`, `outputFile?`, `summary?`, `usage?` |
| `StreamTaskUpdatedEvent` | `EVENT_TASK_UPDATED` | `taskId`, `patch` |
| `StreamBackgroundTasksChangedEvent` | `EVENT_BACKGROUND_TASKS_CHANGED` | `tasks` |

### Session and runtime

| Type | Constant | Key fields |
|------|----------|------------|
| `StreamInitEvent` | `EVENT_INIT` | `model`, `cwd`, `tools`, `skills?`, `slashCommands?`, `mcpServers?`, `plugins?`, `agents?`, `permissionMode?`, `apiKeySource?`, `claudeCodeVersion?`, `betas?`, `effort?`, `capabilities?` |
| `StreamSystemEvent` | `EVENT_SYSTEM` | `subtype`, `data` — the catch-all for anything newer than this library |
| `StreamSessionStateChangedEvent` | `EVENT_SESSION_STATE_CHANGED` | `state` |
| `StreamStatusEvent` | `EVENT_STATUS` | `status`, `permissionMode?`, `compactResult?`, `compactError?` |
| `StreamWorkerShuttingDownEvent` | `EVENT_WORKER_SHUTTING_DOWN` | `reason` |
| `StreamConversationResetEvent` | `EVENT_CONVERSATION_RESET` | `newConversationId` |
| `StreamMirrorErrorEvent` | `EVENT_MIRROR_ERROR` | `error`, `key` — a `sessionStore` mirror write failed |
| `StreamCompactBoundaryEvent` | `EVENT_COMPACT_BOUNDARY` | `trigger`, `preTokens`, `postTokens?`, `durationMs?`, `preservedMessages?` |
| `StreamContextUsageEvent` | `EVENT_CONTEXT_USAGE` | `contextUsage` — see [`ContextUsage`](#contextusage) |
| `StreamFilesPersistedEvent` | `EVENT_FILES_PERSISTED` | `files`, `failed`, `processedAt` |

### Resilience and quotas

| Type | Constant | Key fields |
|------|----------|------------|
| `StreamRateLimitEvent` | `EVENT_RATE_LIMIT` | `status`, `rateLimitType?`, `utilization?`, `resetsAt?`, `overageStatus?`, `isUsingOverage?` |
| `StreamApiRetryEvent` | `EVENT_API_RETRY` | `attempt`, `maxRetries?`, `retryDelayMs?`, `errorStatus?`, `error?` |
| `StreamModelRefusalFallbackEvent` | `EVENT_MODEL_REFUSAL_FALLBACK` | `direction`, `scope?`, `originalModel`, `fallbackModel`, `refusalCategory?`, `retractedMessageUuids?` |
| `StreamModelRefusalNoFallbackEvent` | `EVENT_MODEL_REFUSAL_NO_FALLBACK` | `originalModel`, `refusalCategory?`, `refusalExplanation?` |
| `StreamControlRequestProgressEvent` | `EVENT_CONTROL_REQUEST_PROGRESS` | `requestId`, `status`, `attempt?`, `maxRetries?` |

### Permissions, hooks and notices

| Type | Constant | Key fields |
|------|----------|------------|
| `StreamPermissionDeniedEvent` | `EVENT_PERMISSION_DENIED` | `toolName`, `toolUseId?`, `decisionReasonType?`, `decisionReason?`, `message?` |
| `StreamHookStartedEvent` | `EVENT_HOOK_STARTED` | `hookId`, `hookName`, `hookEvent` |
| `StreamHookProgressEvent` | `EVENT_HOOK_PROGRESS` | `hookId`, `hookName`, `stdout?`, `stderr?`, `output?` |
| `StreamHookResponseEvent` | `EVENT_HOOK_RESPONSE` | `hookId`, `hookName`, `outcome`, `exitCode?`, `stdout?`, `stderr?` |
| `StreamNotificationEvent` | `EVENT_NOTIFICATION` | `key?`, `text`, `priority?`, `color?`, `timeoutMs?` |
| `StreamInformationalEvent` | `EVENT_INFORMATIONAL` | `content`, `level?`, `toolUseId?`, `preventContinuation?` |
| `StreamPromptSuggestionEvent` | `EVENT_PROMPT_SUGGESTION` | `suggestion` |
| `StreamAuthStatusEvent` | `EVENT_AUTH_STATUS` | `isAuthenticating`, `output?`, `error?` |

### Environment changes

| Type | Constant | Key fields |
|------|----------|------------|
| `StreamMemoryRecallEvent` | `EVENT_MEMORY_RECALL` | `mode`, `memories` |
| `StreamCommandsChangedEvent` | `EVENT_COMMANDS_CHANGED` | `commands` |
| `StreamPluginInstallEvent` | `EVENT_PLUGIN_INSTALL` | `status`, `name?`, `error?` |
| `StreamElicitationCompleteEvent` | `EVENT_ELICITATION_COMPLETE` | `mcpServerName`, `elicitationId` |

::: tip Opt-in events
`hook_started` / `hook_progress` / `hook_response` require `includeHookEvents: true`; `partial_message` requires `includePartialMessages: true`; `prompt_suggestion` requires `promptSuggestions: true` and, in SDK mode, a `postResultDrainMs` window wide enough to catch it — it arrives after the turn's `result`. Anything the parser does not recognize is forwarded as `EVENT_SYSTEM` rather than dropped.
:::

### StreamTextEvent

```typescript
interface StreamTextEvent {
  readonly type: 'text'
  readonly text: string // incremental text chunk
}
```

### StreamToolUseEvent

```typescript
interface StreamToolUseEvent {
  readonly type: 'tool_use'
  readonly toolName: string // e.g. 'Read', 'Bash'
  readonly toolInput: Record<string, unknown>
}
```

### StreamResultEvent

Carries the same payload as [`QueryResult`](#queryresult), plus the model's own `stopReason` and `numTurns`.

```typescript
interface StreamResultEvent {
  readonly type: 'result'
  readonly subtype?: ResultSubtype
  readonly text: string
  readonly sessionId: string
  readonly usage: TokenUsage
  readonly cost: number | null
  readonly durationMs: number
  readonly isError?: boolean
  readonly stopReason?: string | null
  readonly numTurns?: number
  readonly structured?: unknown | null
  readonly errors?: readonly string[]
  readonly terminalReason?: TerminalReason
  readonly modelUsage?: Readonly<Record<string, ModelUsageEntry>>
  readonly permissionDenials?: readonly PermissionDenial[]
  readonly deferredToolUse?: DeferredToolUse | null
  readonly durationApiMs?: number
  readonly queuedTurnCount?: number
  readonly ttftMs?: number
  readonly apiErrorStatus?: number | null
  readonly fastModeState?: FastModeState
  readonly origin?: MessageOrigin
}
```

### StreamErrorEvent

```typescript
interface StreamErrorEvent {
  readonly type: 'error'
  readonly message: string
  readonly code?: string
  readonly aborted?: boolean   // the turn was cancelled rather than failing
  readonly requestId?: string  // API request id, for support tickets
}
```

### StreamThinkingEvent

Extended-thinking block lifted out of the assistant message. `redacted` blocks carry encrypted `thinking` text that cannot be displayed.

```typescript
interface StreamThinkingEvent {
  readonly type: 'thinking'
  readonly thinking: string
  readonly signature?: string
  readonly redacted: boolean
}
```

### StreamToolResultEvent

Emitted for each `tool_result` block on a user message — the other half of `tool_use`.

```typescript
interface StreamToolResultEvent {
  readonly type: 'tool_result'
  readonly toolUseId: string
  readonly content: unknown
  readonly isError?: boolean
  readonly toolUseResult?: unknown
  readonly parentToolUseId?: string | null
  readonly isReplay?: boolean
  readonly isSynthetic?: boolean
}
```

### StreamSystemEvent

```typescript
interface StreamSystemEvent {
  readonly type: 'system'
  readonly subtype: string
  readonly data: Record<string, unknown>
}
```

### StreamTaskStartedEvent

```typescript
interface StreamTaskStartedEvent {
  readonly type: 'task_started'
  readonly taskId: string
  readonly toolUseId?: string
  readonly description: string
  readonly taskType?: string
  readonly prompt?: string
}
```

### StreamTaskProgressEvent

```typescript
interface StreamTaskProgressEvent {
  readonly type: 'task_progress'
  readonly taskId: string
  readonly toolUseId?: string
  readonly description: string
  readonly usage: {
    totalTokens: number
    toolUses: number
    durationMs: number
  }
  readonly lastToolName?: string
  readonly summary?: string
}
```

### StreamTaskNotificationEvent

```typescript
interface StreamTaskNotificationEvent {
  readonly type: 'task_notification'
  readonly taskId: string
  readonly toolUseId?: string
  readonly status: 'completed' | 'failed' | 'stopped'
  readonly outputFile: string
  readonly summary: string
  readonly usage?: {
    totalTokens: number
    toolUses: number
    durationMs: number
  }
}
```

## TokenUsage

```typescript
interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}
```

## Message

A single message in the conversation history.

```typescript
interface Message {
  readonly role: 'user' | 'assistant'
  readonly content: string | readonly ContentBlock[]
}
```

## ContentBlock

Discriminated union of content block types within a message.

```typescript
type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock
```

### TextBlock

```typescript
interface TextBlock {
  readonly type: 'text'
  readonly text: string
}
```

### ToolUseBlock

```typescript
interface ToolUseBlock {
  readonly type: 'tool_use'
  readonly id: string
  readonly name: string
  readonly input: Record<string, unknown>
}
```

### ToolResultBlock

```typescript
interface ToolResultBlock {
  readonly type: 'tool_result'
  readonly tool_use_id: string
  readonly content: string
}
```

## PermissionMode

```typescript
type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'dontAsk'
  | 'bypassPermissions'
  | 'auto'
  | 'manual'
```

| Value | Constant | Description |
|-------|----------|-------------|
| `'default'` | `PERMISSION_DEFAULT` | Prompt on first use |
| `'acceptEdits'` | `PERMISSION_ACCEPT_EDITS` | Auto-accept file edits |
| `'plan'` | `PERMISSION_PLAN` | Read-only, no modifications |
| `'dontAsk'` | `PERMISSION_DONT_ASK` | Skip permission prompts |
| `'bypassPermissions'` | `PERMISSION_BYPASS` | Skip all checks (dangerous) |
| `'auto'` | `PERMISSION_AUTO` | Automatically approve tools |
| `'manual'` | `PERMISSION_MANUAL` | The `claude` binary's own spelling of `'default'`. Accepted in both modes and normalized to `'default'` before reaching the SDK, which knows only that name |

## CanUseTool

Custom permission handler for controlling tool usage. Called before each tool execution in SDK mode.

```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal
    suggestions?: PermissionUpdate[]
    blockedPath?: string
    decisionReason?: string
    toolUseID: string
    agentID?: string
  },
) => Promise<PermissionResult>
```

```typescript
const claude = new Claude({
  canUseTool: async (toolName, input, { signal }) => {
    if (toolName === 'Bash' && String(input.command).includes('rm -rf'))
      return { behavior: 'deny', message: 'Dangerous command blocked' }
    return { behavior: 'allow' }
  },
})
```

## PermissionResult

Result returned from a [`CanUseTool`](#canusetool) handler.

```typescript
type PermissionResult =
  | {
      behavior: 'allow'
      updatedInput?: Record<string, unknown>
      updatedPermissions?: PermissionUpdate[]
      toolUseID?: string
    }
  | {
      behavior: 'deny'
      message: string
      interrupt?: boolean
      toolUseID?: string
    }
```

## PermissionBehavior

```typescript
type PermissionBehavior = 'allow' | 'deny' | 'ask'
```

## PermissionUpdate

Permission rule update, used to modify permissions at runtime.

```typescript
type PermissionUpdate =
  | { type: 'addRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior; destination: PermissionUpdateDestination }
  | { type: 'replaceRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior; destination: PermissionUpdateDestination }
  | { type: 'removeRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior; destination: PermissionUpdateDestination }
  | { type: 'setMode'; mode: PermissionMode; destination: PermissionUpdateDestination }
  | { type: 'addDirectories'; directories: string[]; destination: PermissionUpdateDestination }
  | { type: 'removeDirectories'; directories: string[]; destination: PermissionUpdateDestination }
```

## PermissionRuleValue

```typescript
type PermissionRuleValue = {
  toolName: string
  ruleContent?: string
}
```

## PermissionUpdateDestination

```typescript
type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg'
```

## ThinkingConfig

Controls Claude's thinking/reasoning behavior. SDK mode only.

```typescript
type ThinkingConfig = ThinkingAdaptive | ThinkingEnabled | ThinkingDisabled
```

### ThinkingAdaptive

```typescript
type ThinkingAdaptive = { type: 'adaptive' }
```

Claude decides when and how much to think.

### ThinkingEnabled

```typescript
type ThinkingEnabled = { type: 'enabled'; budgetTokens: number }
```

Fixed token budget for extended thinking.

### ThinkingDisabled

```typescript
type ThinkingDisabled = { type: 'disabled' }
```

No extended thinking.

## EffortLevel

```typescript
type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
```

| Value | Constant | Description |
|-------|----------|-------------|
| `'low'` | `EFFORT_LOW` | Quick, minimal reasoning |
| `'medium'` | `EFFORT_MEDIUM` | Balanced |
| `'high'` | `EFFORT_HIGH` | Deep analysis |
| `'xhigh'` | `EFFORT_XHIGH` | Above `high`; added in 0.7.0, where it was previously rejected by validation |
| `'max'` | `EFFORT_MAX` | Maximum depth |

## ToolsPresetConfig

The preset form of [`ClientOptions.tools`](#clientoptions) — "every tool Claude Code ships with".

```typescript
interface ToolsPresetConfig {
  readonly type: 'preset'
  readonly preset: 'claude_code'
}
```

```typescript
// All built-in tools
new Claude({ tools: { type: 'preset', preset: 'claude_code' } })

// The legacy CLI spelling still works and is translated to the object above
new Claude({ tools: ['default'] })

// No built-in tools at all
new Claude({ tools: [] })
```

::: warning Fixed in 0.7.0
In SDK mode `tools: ['default']` used to be forwarded as a literal tool named `default`, which left Claude with no tools at all. It is now translated to the preset object.
:::

## ToolConfig

Per-tool settings for built-in tools, for behavior the CLI otherwise hardcodes. SDK mode only.

```typescript
interface ToolConfig {
  readonly askUserQuestion?: {
    readonly previewFormat?: 'markdown' | 'html'
  }
}
```

| Field | Description |
|-------|-------------|
| `askUserQuestion.previewFormat` | `'markdown'` (default) renders option previews in a monospace box; `'html'` emits self-contained HTML fragments for web hosts |

## SandboxConfig

Run tool calls inside the OS sandbox, with an egress allowlist and credential masking.

```typescript
interface SandboxConfig {
  readonly enabled?: boolean
  readonly failIfUnavailable?: boolean
  readonly autoAllowBashIfSandboxed?: boolean
  readonly allowUnsandboxedCommands?: boolean
  readonly network?: SandboxNetworkConfig
  readonly filesystem?: SandboxFilesystemConfig
  readonly credentials?: SandboxCredentialsConfig
  readonly ignoreViolations?: boolean
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Turn the sandbox on |
| `failIfUnavailable` | `boolean` | Fail instead of silently running unsandboxed where the OS has no sandbox |
| `autoAllowBashIfSandboxed` | `boolean` | Auto-approve `Bash` once the sandbox is active |
| `allowUnsandboxedCommands` | `boolean` | Permit explicit escapes from the sandbox |
| `network` | `SandboxNetworkConfig` | `allowedDomains`, `deniedDomains`, `strictAllowlist`, `allowUnixSockets`, `allowLocalBinding`, `httpProxyPort`, `socksProxyPort`, `tlsTerminate`, … |
| `filesystem` | `SandboxFilesystemConfig` | `allowRead`, `denyRead`, `allowWrite`, `denyWrite`, `allowManagedReadPathsOnly`, `disabled` |
| `credentials` | `SandboxCredentialsConfig` | Deny or mask credential files, environment variables and AWS SigV4 pairs before they reach a tool |
| `ignoreViolations` | `boolean` | Log sandbox violations instead of failing the call |

```typescript
const claude = new Claude({
  sandbox: {
    enabled: true,
    failIfUnavailable: true,
    network: { allowedDomains: ['registry.npmjs.org', 'github.com'], strictAllowlist: true },
    filesystem: { allowWrite: ['/srv/workspace'], denyRead: ['/etc/shadow'] },
  },
})
```

## McpServerConfig

Inline MCP server definition — a discriminated union over the transport.

```typescript
type McpServerConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig
```

Shared by every variant: `timeout` (connection timeout in ms) and `alwaysLoad` (keep the server's tool schemas in context instead of deferring them).

### McpStdioServerConfig

```typescript
interface McpStdioServerConfig {
  readonly type?: 'stdio'   // MCP_STDIO — the default when omitted
  readonly command: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly timeout?: number
  readonly alwaysLoad?: boolean
}
```

### McpSSEServerConfig / McpHttpServerConfig

```typescript
interface McpHttpServerConfig {
  readonly type: 'http'     // MCP_HTTP — or 'sse' (MCP_SSE) for McpSSEServerConfig
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly tools?: readonly McpServerToolPolicy[]
  readonly timeout?: number
  readonly alwaysLoad?: boolean
}
```

`tools` carries a per-tool policy for the server, so individual remote tools can be allowed or denied without touching `allowedTools`.

```typescript
import { Claude, MCP_STDIO, MCP_SSE } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  mcpServers: {
    filesystem: {
      type: MCP_STDIO,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    },
    remote: {
      type: MCP_SSE,
      url: 'https://mcp.example.com/sse',
      headers: { Authorization: 'Bearer token' },
      alwaysLoad: true,
    },
  },
})
```

::: tip Two more transports
`MCP_SDK` (`'sdk'`) is the in-process server below. `MCP_CLAUDEAI_PROXY` (`'claudeai-proxy'`) is a connector proxied through claude.ai — it is reported by [`mcpServerStatus()`](./#mcpserverstatus) but never configured directly.
:::

## McpSdkServerConfig

In-process MCP server config for SDK mode. Created via `createSdkMcpServer()`.

```typescript
interface McpSdkServerConfig {
  readonly type: 'sdk'
  readonly name: string
  readonly instance: unknown // McpServer instance
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'sdk'` | Always `'sdk'` for in-process servers |
| `name` | `string` | Server name |
| `instance` | `unknown` | McpServer instance (opaque to avoid hard dependency) |

## AgentConfig

Configuration for a custom subagent.

```typescript
interface AgentConfig {
  readonly description: string
  readonly prompt?: string
  readonly model?: string
  readonly tools?: readonly string[]
  readonly disallowedTools?: readonly string[]
  readonly mcpServers?: readonly AgentMcpServerSpec[]
  readonly skills?: readonly string[]
  readonly initialPrompt?: string
  readonly permissionMode?: PermissionMode
  readonly maxTurns?: number
  readonly memory?: 'user' | 'project' | 'local'
  readonly effort?: EffortLevel | number
  readonly observer?: string
  readonly observerMessage?: string
  readonly isolation?: 'worktree'
  readonly background?: boolean
}
```

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | When to delegate to this agent |
| `prompt` | `string` | System prompt / instructions |
| `model` | `string` | `'opus'`, `'sonnet'`, `'haiku'`, `'inherit'` |
| `tools` | `string[]` | Tools available to this agent |
| `disallowedTools` | `string[]` | Tools denied to this agent |
| `mcpServers` | `AgentMcpServerSpec[]` | MCP servers this agent may reach |
| `skills` | `string[]` | Skills loaded for this agent |
| `initialPrompt` | `string` | First user message seeded into the agent |
| `permissionMode` | [`PermissionMode`](#permissionmode) | Permission mode for this agent |
| `maxTurns` | `number` | Max agentic turns |
| `memory` | `'user' \| 'project' \| 'local'` | Which memory tier the agent reads |
| `effort` | [`EffortLevel`](#effortlevel) `\| number` | Reasoning depth for this agent |
| `observer` | `string` | Another agent that watches this one |
| `observerMessage` | `string` | Message handed to the observer |
| `isolation` | `'worktree'` | Run in an isolated git worktree |
| `background` | `boolean` | Always run as a background task |

```typescript
import { Claude, PERMISSION_PLAN, EFFORT_HIGH } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  agents: {
    reviewer: {
      description: 'Code review specialist',
      prompt: 'You are a senior code reviewer. Focus on security and performance.',
      model: 'opus',
      effort: EFFORT_HIGH,
      permissionMode: PERMISSION_PLAN,
    },
    fixer: {
      description: 'Bug fixer that works in isolation',
      model: 'sonnet',
      isolation: 'worktree',
      maxTurns: 10,
    },
  },
})
```

## Hook types

The hook surface has its own page — see [**Hooks**](./hooks) for all 33 events, their per-event inputs and outputs, and the five kinds of configured hook. The type names live in the same import path as everything else:

| Type | What it is |
|------|------------|
| [`HookEvent`](./hooks#hookevent) | Union of the 33 lifecycle event names |
| [`HookInput`](./hooks#hookinput) | Discriminated union of 33 per-event input interfaces, narrowed by `hook_event_name` |
| [`HookJSONOutput`](./hooks#hookjsonoutput) | What a hook returns — `SyncHookJSONOutput` or `AsyncHookJSONOutput` |
| [`HookSpecificOutput`](./hooks#hookspecificoutput) | Union of 22 per-event output interfaces, narrowed by `hookEventName` |
| [`HookCallback`](./hooks#hookcallback) | In-process JS callback (SDK mode) |
| [`HookCallbackMatcher`](./hooks#hookcallbackmatcher) | A group of callbacks plus the matcher that gates them |
| [`HookEntry`](./hooks#hookentry) | A configured hook: command, prompt, agent, HTTP or MCP tool (CLI mode) |
| [`HookMatcher`](./hooks#hookmatcher) | A group of entries plus the matcher that gates them |
| [`HooksConfig`](./hooks#hooksconfig) | Configured hooks keyed by event name |

## OnElicitation

Callback for handling MCP elicitation requests. SDK mode only.

```typescript
type OnElicitation = (
  request: ElicitationRequest,
  options: { signal: AbortSignal },
) => Promise<{
  action: 'accept' | 'decline' | 'cancel'
  content?: Record<string, unknown>
}>
```

## ElicitationRequest

MCP elicitation request payload.

```typescript
interface ElicitationRequest {
  serverName: string
  message: string
  mode?: 'form' | 'url'
  url?: string
  elicitationId?: string
  requestedSchema?: Record<string, unknown>
}
```

| Field | Type | Description |
|-------|------|-------------|
| `serverName` | `string` | Name of the MCP server requesting input |
| `message` | `string` | Message to display to the user |
| `mode` | `'form' \| 'url'` | Elicitation mode |
| `url` | `string` | URL for URL-mode elicitation |
| `elicitationId` | `string` | Unique elicitation identifier |
| `requestedSchema` | `Record<string, unknown>` | JSON Schema for expected input |

## SettingSource

Controls which filesystem settings are loaded. SDK mode only.

```typescript
type SettingSource = 'user' | 'project' | 'local'
```

| Value | Description |
|-------|-------------|
| `'user'` | Global settings (`~/.claude/settings.json`) |
| `'project'` | Project settings (`.claude/settings.json`) |
| `'local'` | Local settings (`.claude/settings.local.json`) |

```typescript
// Load project settings + CLAUDE.md
new Claude({ settingSources: ['user', 'project'] })

// Full isolation (default SDK behavior)
new Claude({ settingSources: [] })
```

## PluginConfig

Plugins provide custom commands, agents, skills and hooks.

```typescript
type PluginConfig = LocalPluginConfig | UrlPluginConfig

interface LocalPluginConfig {
  readonly type: 'local'
  readonly path: string
  readonly skipMcpDiscovery?: boolean
}

interface UrlPluginConfig {
  readonly type: 'url'
  readonly url: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'local' \| 'url'` | Where the plugin comes from |
| `path` | `string` | Plugin directory, absolute or relative (`'local'`) |
| `skipMcpDiscovery` | `boolean` | Do not auto-register MCP servers the plugin declares (`'local'`) |
| `url` | `string` | Plugin URL (`'url'`) |

```typescript
new Claude({
  plugins: [
    { type: 'local', path: './my-plugin' },
    { type: 'url', url: 'https://plugins.example.com/reviewer' },
  ],
})
```

Reload plugins mid-session with [`reloadPlugins()`](./#reloadplugins).

## SpawnOptions

Options passed to a custom `spawnClaudeCodeProcess` function.

```typescript
interface SpawnOptions {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Record<string, string | undefined>
  readonly signal?: AbortSignal
}
```

| Field | Type | Description |
|-------|------|-------------|
| `command` | `string` | Command to execute |
| `args` | `string[]` | Arguments for the command |
| `cwd` | `string` | Working directory |
| `env` | `Record<string, string \| undefined>` | Environment variables |
| `signal` | `AbortSignal` | Abort signal |

## SpawnedProcess

Interface that a custom-spawned process must satisfy.

```typescript
interface SpawnedProcess {
  readonly stdout: NodeJS.ReadableStream
  readonly stderr: NodeJS.ReadableStream
  readonly stdin: NodeJS.WritableStream
  readonly exitCode: Promise<number | null>
  kill(signal?: string): void
}
```

| Field | Type | Description |
|-------|------|-------------|
| `stdout` | `ReadableStream` | Standard output stream |
| `stderr` | `ReadableStream` | Standard error stream |
| `stdin` | `WritableStream` | Standard input stream |
| `exitCode` | `Promise<number \| null>` | Process exit promise |
| `kill()` | `(signal?: string) => void` | Kill the process |

```typescript
new Claude({
  spawnClaudeCodeProcess: (options) => {
    // options: { command, args, cwd, env, signal }
    return myDockerProcess // Must satisfy SpawnedProcess
  },
})
```

## AccountInfo

Information about the logged-in user's account. Returned by `claude.getAccountInfo()`.

```typescript
interface AccountInfo {
  email?: string
  organization?: string
  subscriptionType?: string
  tokenSource?: string
  apiKeySource?: string
}
```

## ModelInfo

Information about an available model. Returned by `claude.listModels()`.

```typescript
interface ModelInfo {
  value: string
  displayName: string
  description: string
  supportsEffort?: boolean
  supportedEffortLevels?: ('low' | 'medium' | 'high' | 'max')[]
  supportsAdaptiveThinking?: boolean
  supportsFastMode?: boolean
  supportsAutoMode?: boolean
}
```

## SlashCommand

Available slash command. Returned by `claude.listSlashCommands()`.

```typescript
interface SlashCommand {
  [key: string]: unknown
}
```

## AgentInfo

Information about an available subagent. Returned by `claude.listAgents()`.

```typescript
interface AgentInfo {
  name: string
  description: string
  model?: string
}
```

## McpServerStatus

Status of an MCP server connection. Returned by `claude.getMcpServers()`.

```typescript
interface McpServerStatus {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'
  serverInfo?: { name: string; version: string }
  error?: string
  config?: Record<string, unknown>
  scope?: string
  tools?: Array<{
    name: string
    description?: string
    annotations?: {
      readOnly?: boolean
      destructive?: boolean
      openWorld?: boolean
    }
  }>
}
```

## McpSetServersResult

Result of a `claude.setMcpServers()` operation.

```typescript
interface McpSetServersResult {
  added: string[]
  removed: string[]
  errors: Record<string, string>
}
```

## RewindFilesResult

Result of a `claude.rewindFiles()` operation.

```typescript
interface RewindFilesResult {
  canRewind: boolean
  error?: string
  filesChanged?: string[]
  insertions?: number
  deletions?: number
}
```

## ReadFileResult

Result of [`claude.readFile()`](./#readfile) — a read that honours the same permission rules as the `Read` tool. `null` is returned (never thrown) on denial, a missing file, or a transport error.

```typescript
interface ReadFileResult {
  readonly contents: string
  readonly absPath: string
  readonly truncated?: boolean
  readonly encoding?: 'base64'
}
```

## InterruptResult

Receipt returned by [`claude.interrupt()`](./#interrupt).

```typescript
interface InterruptResult {
  readonly stillQueued: readonly string[]
  readonly cancelled?: readonly string[]
}
```

| Field | Description |
|-------|-------------|
| `stillQueued` | UUIDs of queued user messages that survived the interrupt and will still run. An empty array does **not** mean nothing will run — messages sent without a UUID are never listed |
| `cancelled` | UUIDs cancelled by this interrupt. Present only when cancellation was requested |

`interrupt()` resolves to `undefined` on a CLI that predates the receipt protocol; the interrupt still happened, it just reported nothing.

## InitializationResult

What the session loaded at startup. Returned by [`initializationResult()`](./#initializationresult) (cached from warm-up) and [`reinitialize()`](./#reinitialize) (re-requested).

```typescript
interface InitializationResult {
  readonly commands: readonly SlashCommand[]
  readonly agents: readonly AgentInfo[]
  // plus output style, models and the signed-in account
}
```

## ContextUsage

Structured `/context` report — what is filling the context window. Produced by [`getContextUsage()`](./#getcontextusage) and by the `context_usage` stream event.

```typescript
interface ContextUsage {
  readonly model: string
  readonly totalTokens: number
  readonly rawMaxTokens: number
  readonly maxTokens?: number
  readonly percentage: number
  readonly overLimit?: {
    readonly tokensOver: number
    readonly kind: 'hard_limit' | 'compaction_window'
  }
  readonly categories: readonly ContextUsageCategory[]
  readonly mcpTools?: ReadonlyArray<{ name: string; serverName: string; tokens: number; isLoaded?: boolean }>
  readonly memoryFiles?: ReadonlyArray<{ path: string; type: string; tokens: number }>
}

interface ContextUsageCategory {
  readonly name: string
  readonly tokens: number
  readonly kind?: 'used' | 'free' | 'buffer' | 'deferred'
  readonly color?: string
  readonly isDeferred?: boolean
}
```

`totalTokens` is unclamped and can exceed `rawMaxTokens`; `overLimit` is present when it does.

```typescript
const usage = await claude.getContextUsage()
console.log(`${usage.percentage}% of ${usage.rawMaxTokens}`)
for (const row of usage.categories) {
  if (row.kind === 'used') console.log(row.name, row.tokens)
}
```

## UsageReport

The structured form of what `/usage` prints. Returned by [`claude.usage()`](./#usage).

```typescript
interface UsageReport {
  readonly session: {
    readonly totalCostUsd: number
    readonly totalApiDurationMs: number
    readonly totalDurationMs: number
    readonly totalLinesAdded: number
    readonly totalLinesRemoved: number
    readonly modelUsage: Readonly<Record<string, ModelUsage>>
  }
  readonly subscriptionType: string | null
  readonly rateLimitsAvailable: boolean
  readonly rateLimits: RateLimitWindows | null
  readonly behaviors: UsageBehaviors | null
}
```

`subscriptionType` is `null` for API-key sessions. `rateLimits` is `null` when `rateLimitsAvailable` is `false`.

## FlagSettings

Settings applied at runtime to the flag layer — the highest-priority tier — by [`applyFlagSettings()`](./#applyflagsettings). Every key also accepts `null`, which clears it from that layer so the next tier down wins again.

```typescript
type FlagSettings = {
  readonly [K in keyof Settings]?: (K extends 'effortLevel' ? EffortLevel : Settings[K]) | null
}
```

```typescript
await claude.applyFlagSettings({ effortLevel: 'high' })
await claude.applyFlagSettings({ effortLevel: null }) // back to what settings say
```

## SessionInfo

Metadata about a stored session, as returned by [`listSessions()`](./session-management#listsessions) and [`getSessionInfo()`](./session-management#getsessioninfo).

```typescript
interface SessionInfo {
  readonly sessionId: string
  readonly summary: string
  readonly lastModified: number
  readonly fileSize?: number
  readonly customTitle?: string
  readonly firstPrompt?: string
  readonly gitBranch?: string
  readonly cwd?: string
  readonly tag?: string
  readonly createdAt?: number
  /** @deprecated use customTitle */
  readonly name?: string
  /** @deprecated use lastModified */
  readonly lastActive?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Unique session identifier (UUID) |
| `summary` | `string` | Custom title, auto-generated summary, or first prompt — whichever exists, in that order |
| `lastModified` | `number` | Last modification time, epoch milliseconds |
| `fileSize` | `number` | File size in bytes. Local JSONL storage only |
| `customTitle` | `string` | Title set via `/rename` or `renameSession()` |
| `firstPrompt` | `string` | First meaningful user prompt |
| `gitBranch` | `string` | Git branch at the end of the session |
| `cwd` | `string` | Working directory the session ran in |
| `tag` | `string` | Tag set via `tagSession()` |
| `createdAt` | `number` | Creation time, epoch milliseconds |
| `name` | `string` | **Deprecated** — use `customTitle` |
| `lastActive` | `string` | **Deprecated** — use `lastModified`. Never populated by the SDK |

## SessionMessage

One entry from a session transcript, as returned by [`getSessionMessages()`](./session-management#getsessionmessages) and [`getSubagentMessages()`](./session-management#getsubagentmessages).

```typescript
interface SessionMessage {
  readonly type: 'user' | 'assistant' | 'system'
  readonly uuid: string
  readonly session_id: string
  readonly message: unknown
  readonly parent_tool_use_id: string | null
  readonly parent_agent_id: string | null
}
```

`message` is the raw on-disk payload and is deliberately not narrowed. `parent_agent_id` is what lets a flat transcript be re-assembled into a subagent tree; it is `null` for depth-1 subagents and for the main session.
