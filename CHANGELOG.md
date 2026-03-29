# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.4] - 2026-03-29

### Fixed

- **Quick Start output** — CLI setup now shows per-instance `env` config inside `new Claude({...})` instead of global `export` variables, enabling multiple isolated instances on one machine
- **Documentation** — added CLI Setup section to README, wiki getting-started guide, and landing page with usage examples and per-instance isolation patterns
- **Release command** — `/release` now includes mandatory documentation update step

## [0.5.3] - 2026-03-29

### Added

- **Proxy support in CLI setup** — interactive prompt or `--proxy` flag to route Claude Code requests through an HTTP proxy (`HTTP_PROXY`/`HTTPS_PROXY`)

## [0.5.2] - 2026-03-29

### Added

- **Quick Start preview** — CLI `setup` now prints syntax-highlighted code examples after successful installation (query, streaming, sessions, parallel)

### Changed

- **Config directory prompt** — always asks for config path on each run instead of caching, enabling multiple Claude Code instances on one machine

## [0.5.1] - 2026-03-29

### Fixed

- **`bin` entry point** — fixed invalid script path format that caused npm to strip the `claude-connector` binary during publish

## [0.5.0] - 2026-03-29

### Added

- **CLI `setup` command** — one-command bootstrap for fresh servers: checks Node.js version, installs Claude Code globally, runs `claude login` for authentication, and verifies the result
- **`bin` entry point** — package now provides `claude-connector` executable via `npx @scottwalker/claude-connector setup`
- **`/release` dev command** — Claude Code slash command that automates the full release process (version bump, changelogs, build, publish, GitHub release)

### Changed

- New runtime dependencies: `commander`, `ora`, `chalk` (for CLI interface)

## [0.4.6] - 2026-03-18

### Fixed

- **README examples** — fixed 7 incorrect code examples (canUseTool, hookCallbacks, createSdkMcpServer, plugins, spawnClaudeCodeProcess, session utilities, mcpConfig)
- **Documentation** — added per-query option mode support column in API.md (CLI only vs Both)
- **Wiki** — fixed `event.agentName` and `event.message` references in task event examples (fields don't exist)
- **Landing page** — updated version, test count, and package size

## [0.4.5] - 2026-03-18

### Added

- **Rate limit events** — new `StreamRateLimitEvent` with status, utilization, and reset time
- **`EVENT_RATE_LIMIT` constant** and `StreamHandle.on('rate_limit', cb)` support
- **Unknown SDK event forwarding** — unknown message types are now forwarded as generic system events instead of being silently dropped

## [0.4.4] - 2026-03-18

### Fixed

- **Structured output** — `result.structured` now correctly populated from SDK `structured_output` field (was always `null`)
- **Error result distinction** — `StreamResultEvent` now includes `subtype`, `isError`, `stopReason`, `numTurns`
- **Init retry** — `initPromise` resets on failure, allowing subsequent `init()` calls to retry
- **Init timeout** — new `initTimeoutMs` option (default 2 minutes) prevents infinite hangs
- **mcpConfig validation** — throws error when used in SDK mode (not supported by SDK)
- **ChatHandle crash handling** — pending `send()` promises now reject when CLI process exits unexpectedly
- **Safe dispatch** — callback errors no longer break the stream for other callbacks
- **Buffer limit** — 100MB stdout limit in CliExecutor to prevent OOM

## [0.4.3] - 2026-03-18

### Fixed

- **`schema` in ClientOptions** — added missing `schema` field to `ClientOptions` for SDK mode structured output

## [0.4.2] - 2026-03-17

### Added

- Open Graph meta tags for link previews in Telegram and messengers

## [0.4.1] - 2026-03-17

### Changed

- Updated npm README

## [0.4.0] - 2026-03-16

### Added

- **SDK near-parity** — 95% coverage of `@anthropic-ai/claude-agent-sdk` Options and Query API
- **SdkExecutor V1 migration** — migrated from unstable V2 `SDKSession` to stable V1 `query()` API with full control methods
- **`canUseTool` callback** — programmatic permission control with access to tool name, input arguments, suggestions, and abort signal
- **In-process MCP tools** — `createSdkMcpServer()` and `sdkTool()` for custom tools without external processes (SDK type MCP servers)
- **JS hook callbacks** — `hookCallbacks` option with all 21 event types (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`, `Setup`, `TeammateIdle`, `TaskCompleted`, `Elicitation`, `ElicitationResult`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `InstructionsLoaded`)
- **Thinking config** — `{ type: 'adaptive' }`, `{ type: 'enabled', budgetTokens }`, `{ type: 'disabled' }` on `ClientOptions` and `QueryOptions`
- **Runtime control methods** (SDK mode):
  - `claude.setModel()` — change model mid-session
  - `claude.setPermissionMode()` — change permission mode mid-session
  - `claude.rewindFiles()` — rollback files to a specific message state (requires `enableFileCheckpointing`)
  - `claude.stopTask()` — stop a running subagent
  - `claude.setMcpServers()` — dynamically replace MCP servers
  - `claude.reconnectMcpServer()` — reconnect a failed MCP server
  - `claude.toggleMcpServer()` — enable/disable MCP server
  - `claude.accountInfo()` — get account email, org, subscription
  - `claude.supportedModels()` — list available models with capabilities
  - `claude.supportedCommands()` — list slash commands
  - `claude.supportedAgents()` — list available subagents
  - `claude.mcpServerStatus()` — get MCP server connection statuses
  - `claude.interrupt()` — interrupt current query execution
- **Per-query abort** — `signal: AbortSignal` on `QueryOptions` (works in both SDK and CLI modes)
- **Task stream events** — `task_started`, `task_progress`, `task_notification` for subagent lifecycle tracking
- **StreamHandle task callbacks** — `.on('task_started', cb)`, `.on('task_progress', cb)`, `.on('task_notification', cb)`
- **New ClientOptions**: `settingSources` (controls CLAUDE.md loading), `settings` (inline settings/path), `plugins` (local plugins), `spawnClaudeCodeProcess` (custom spawn for VMs/containers), `stderr` (stderr callback), `allowDangerouslySkipPermissions`, `betas`, `agentProgressSummaries`, `includePartialMessages`, `promptSuggestions`, `debug`, `debugFile`, `onElicitation`, `enableFileCheckpointing`
- **Session utilities** — `listSessions()` and `getSessionMessages()` re-exported from SDK
- **New types** — `CanUseTool`, `PermissionResult`, `PermissionUpdate`, `ThinkingConfig`, `HookEvent`, `HookCallback`, `HookCallbackMatcher`, `AccountInfo`, `ModelInfo`, `AgentInfo`, `McpServerStatus`, `McpSetServersResult`, `RewindFilesResult`, `McpSdkServerConfig`, `SettingSource`, `PluginConfig`, `SpawnOptions`, `SpawnedProcess`, `OnElicitation`, `ElicitationRequest`
- **New constants** — `EVENT_TASK_STARTED`, `EVENT_TASK_PROGRESS`, `EVENT_TASK_NOTIFICATION`
- 78 new tests (200 total, 12 test files)

### Changed

- **SdkExecutor uses V1 `query()` API** — instead of V2 `unstable_v2_createSession()`. Session stays warm (single process), multi-turn via `InputController` (controllable async iterable). All control methods delegate to the `Query` object.
- **Manual `.next()` iteration** — replaced `for await ... break` with `readUntilResult()` helper to prevent generator closure on break (critical for session reuse)
- `ExecuteOptions` now includes optional `signal: AbortSignal`
- `StreamEvent` union expanded with `StreamTaskStartedEvent`, `StreamTaskProgressEvent`, `StreamTaskNotificationEvent`
- `McpServerConfig` accepts SDK in-process servers (`type: 'sdk'`)
- Landing page moved from `docs/` to `landing/` (clean separation from documentation)

## [0.3.0] - 2026-03-15

### Added

- **`StreamHandle`** — fluent streaming API returned by `stream()` and `session.stream()`:
  - `.on(EVENT_TEXT, cb)` — typed event callbacks with chaining
  - `.done()` — consume stream, fire callbacks, return result
  - `.text()` — collect all text into a string (one-liner)
  - `.pipe(writable)` — pipe text to any writable, return result
  - `.toReadable()` — Node.js `Readable` stream (text mode) for `pipeline()`, HTTP responses, file writes
  - `[Symbol.asyncIterator]` — backward-compatible `for await` over `StreamEvent` objects
- **`ChatHandle`** — bidirectional streaming via `--input-format stream-json`:
  - `claude.chat()` — open a persistent CLI process for multi-turn real-time conversation
  - `.send(prompt)` — send prompt, returns `Promise<StreamResultEvent>` when turn completes
  - `.on()` — same fluent callback API as `StreamHandle`
  - `.pipe(dest)` — continuous pipe to writable (returns dest for chaining)
  - `.toReadable()` — Node.js `Readable` for text output
  - `.toDuplex()` — Node.js `Duplex` (write prompts, read text) for `pipeline()` integration
  - `.end()` / `.abort()` — graceful close or immediate kill
  - `.sessionId`, `.turnCount`, `.closed` — state tracking
- **`constants.ts`** — all 180+ string literals extracted into named constants:
  - Event types: `EVENT_TEXT`, `EVENT_TOOL_USE`, `EVENT_RESULT`, `EVENT_ERROR`, `EVENT_SYSTEM`
  - Permission modes: `PERMISSION_DEFAULT`, `PERMISSION_ACCEPT_EDITS`, `PERMISSION_PLAN`, `PERMISSION_AUTO`, `PERMISSION_DONT_ASK`, `PERMISSION_BYPASS`
  - Effort levels: `EFFORT_LOW`, `EFFORT_MEDIUM`, `EFFORT_HIGH`, `EFFORT_MAX`
  - CLI flags: `FLAG_PRINT`, `FLAG_MODEL`, `FLAG_RESUME`, etc. (30+ flags)
  - JSON protocol keys: `KEY_RESULT`, `KEY_SESSION_ID`, `KEY_USAGE`, etc.
  - Scheduler events: `SCHED_RESULT`, `SCHED_ERROR`, `SCHED_TICK`, `SCHED_STOP`
  - Defaults: `DEFAULT_EXECUTABLE`, `DEFAULT_MODEL`, `DEFAULT_TIMEOUT_MS`
  - All constants exported from the package for client-side use
- `--input-format stream-json` support in `ArgsBuilder` (for `ChatHandle`)
- Streaming guide (`docs/STREAMING.md`) — 27 integration patterns (Express, Fastify, SSE, WebSocket, Telegram, Slack, Electron, Worker Threads, pipeline, gzip, etc.)
- 20 new unit tests (122 total)

### Changed

- `stream()` now returns `StreamHandle` instead of `AsyncIterable<StreamEvent>` (backward compatible — `StreamHandle` implements `AsyncIterable`)
- `session.stream()` now returns `StreamHandle`
- `ResolvedOptions.prompt` is now optional (for chat mode)
- Zero magic strings in source code — all modules import from `constants.ts`
- All documentation updated with constants in code examples

## [0.2.0] - 2026-03-15

### Fixed

- **CLI streaming was broken** — `--output-format stream-json` requires `--verbose` flag; `ArgsBuilder` now adds it automatically
- **`systemPrompt` was ignored in SDK mode** — now passed to SDK session creation and forwarded per-query via `ExecuteOptions`
- **`mcpServers` was dead code in CLI mode** — inline server definitions are now serialized as JSON and passed to `--mcp-config`
- **`hooks` was dead code in CLI mode** — hook configurations are now passed via `--settings` JSON flag
- **`effortLevel` was passed via env variable** — now uses the correct `--effort` CLI flag

### Added

- `PermissionMode: 'auto'` — automatic tool approval based on risk level
- `EffortLevel: 'max'` — maximum thinking depth
- `agent` option (`ClientOptions` + `QueryOptions`) — select a preconfigured agent (`--agent` flag)
- `tools` option (`ClientOptions` + `QueryOptions`) — restrict the set of available built-in tools (`--tools` flag)
- `name` option (`ClientOptions`) — display name for sessions (`--name` flag)
- `strictMcpConfig` option (`ClientOptions`) — ignore all MCP servers except explicitly provided (`--strict-mcp-config` flag)
- `systemPrompt` field in `ExecuteOptions` — enables per-query system prompt overrides in SDK mode
- `systemPrompt`, `appendSystemPrompt`, `maxTurns` fields in `SdkExecutorOptions` — passed to SDK session creation
- Comprehensive examples document (`docs/EXAMPLES.md`) covering all library features
- 20 new unit tests (102 total)

### Changed

- `resolveEnv()` no longer injects `CLAUDE_CODE_EFFORT_LEVEL` — effort is now a first-class CLI flag

## [0.1.0] - 2026-03-10

### Added

- `Claude` client with `query()`, `stream()`, `parallel()`, and `abort()` methods
- `Session` for multi-turn conversations with `--resume` / `--continue` support
- `ScheduledJob` via `claude.loop()` — recurring queries (Node.js-level `/loop`)
- `IExecutor` abstraction for swappable CLI backends
- `CliExecutor` — default implementation spawning `claude -p`
- `SdkExecutor` — persistent SDK session via Claude Agent SDK V2
- Full `ClientOptions` covering all Claude Code CLI flags:
  - `executable` — path to CLI binary (multiple installations)
  - `model`, `effortLevel`, `fallbackModel` — model configuration
  - `permissionMode`, `allowedTools`, `disallowedTools` — permission control
  - `systemPrompt`, `appendSystemPrompt` — prompt customization
  - `maxTurns`, `maxBudget` — execution limits
  - `mcpConfig`, `mcpServers` — MCP server integration
  - `agents` — custom subagent definitions
  - `hooks` — lifecycle hooks (PreToolUse, PostToolUse, etc.)
  - `worktree` — git worktree isolation
  - `additionalDirs` — extra working directories
  - `schema` — JSON Schema for structured output
  - `input` — piped stdin data
- Per-query option overrides via `QueryOptions`
- Streaming via NDJSON parsing (`--output-format stream-json`)
- Typed error hierarchy: `CliNotFoundError`, `CliExecutionError`, `CliTimeoutError`, `ParseError`, `ValidationError`
- 82 unit tests
- Integration test suite (`examples/integration-test/`)
- Architecture documentation (`docs/ARCHITECTURE.md`)
- API reference (`docs/API.md`)
