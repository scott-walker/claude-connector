# Changelog

All notable changes to this project will be documented in this file.

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

## [0.4.7] - 2026-03-18

### Fixed

- Synced version across landing page, wiki config, and CHANGELOG
- Added missing CHANGELOG entries for 0.4.1–0.4.6
- Fixed JSDoc examples in index.ts (`tool` → `sdkTool`)

## [0.4.6] - 2026-03-18

### Fixed

- **README examples** — fixed 7 incorrect code examples (canUseTool, hookCallbacks, createSdkMcpServer, plugins, spawnClaudeCodeProcess, session utilities, mcpConfig)
- **API docs** — added per-query option mode support column (CLI only vs Both)
- **Wiki** — fixed `event.agentName` and `event.message` references in task event examples
- **Landing page** — updated version, test count, and package size

## [0.4.5] - 2026-03-18

### Added

- **Rate limit events** — new `StreamRateLimitEvent` with status, utilization, and reset time
- **`EVENT_RATE_LIMIT` constant** and `StreamHandle.on('rate_limit', cb)` support
- **Unknown SDK event forwarding** — forwarded as generic system events instead of being silently dropped

## [0.4.4] - 2026-03-18

### Fixed

- **Structured output** — `result.structured` now correctly populated from SDK `structured_output` field (was always `null`)
- **Error result distinction** — `StreamResultEvent` now includes `subtype`, `isError`, `stopReason`, `numTurns`
- **Init retry** — `initPromise` resets on failure so `init()` can be retried
- **Init timeout** — new `initTimeoutMs` option (default 2 minutes) prevents infinite hangs
- **mcpConfig validation** — throws error when used in SDK mode (not supported)
- **ChatHandle crash handling** — pending `send()` promises reject when CLI process exits
- **Safe dispatch** — callback errors no longer break the stream for other callbacks
- **Buffer limit** — 100MB stdout limit in CliExecutor to prevent OOM

## [0.4.3] - 2026-03-18

### Fixed

- Added missing `schema` field to `ClientOptions` for SDK mode structured output

## [0.4.2] - 2026-03-17

### Added

- Open Graph meta tags for link previews in Telegram and messengers

## [0.4.1] - 2026-03-17

### Changed

- Updated npm README

## [0.4.0] - 2026-03-16

### Added

- **SDK near-parity** — 95% coverage of `@anthropic-ai/claude-agent-sdk` Options and Query API
- **SdkExecutor V1 migration** — stable V1 `query()` API with full control methods (was unstable V2)
- **`canUseTool` callback** — programmatic permission control with access to tool name, arguments, and abort signal
- **In-process MCP tools** — `createSdkMcpServer()` and `sdkTool()` for custom tools without external processes
- **JS hook callbacks** — `hookCallbacks` option with all 21 event types
- **Thinking config** — `{ type: 'adaptive' }`, `{ type: 'enabled', budgetTokens }`, `{ type: 'disabled' }`
- **13 runtime control methods** — `setModel()`, `setPermissionMode()`, `rewindFiles()`, `stopTask()`, `setMcpServers()`, `reconnectMcpServer()`, `toggleMcpServer()`, `accountInfo()`, `supportedModels()`, `supportedCommands()`, `supportedAgents()`, `mcpServerStatus()`, `interrupt()`
- **Per-query abort** — `signal: AbortSignal` on `QueryOptions`
- **Task stream events** — `task_started`, `task_progress`, `task_notification`
- **New options** — `settingSources`, `settings`, `plugins`, `spawnClaudeCodeProcess`, `stderr`, `allowDangerouslySkipPermissions`, `betas`, `onElicitation`, `enableFileCheckpointing`
- **Session utilities** — `listSessions()`, `getSessionMessages()`
- 200 tests (was 122), now 214 as of v0.4.7

### Changed

- SdkExecutor uses V1 `query()` API instead of V2 `unstable_v2_createSession()`
- Manual `.next()` iteration via `readUntilResult()` to prevent generator closure
- `StreamEvent` union expanded with task event types
- Landing page moved from `docs/` to `landing/`

## [0.3.0] - 2026-03-15

### Added

- **StreamHandle** — fluent streaming API returned by `stream()`:
  - `.on(EVENT_TEXT, cb)` — typed event callbacks with chaining
  - `.done()` — consume stream, fire callbacks, return result
  - `.text()` — collect all text into a string
  - `.pipe(writable)` — pipe text to any writable, return result
  - `.toReadable()` — Node.js Readable for `pipeline()`, HTTP responses, file writes
  - `[Symbol.asyncIterator]` — backward-compatible `for await`
- **ChatHandle** — bidirectional streaming via `--input-format stream-json`:
  - `claude.chat()` — persistent CLI process for multi-turn conversation
  - `.send(prompt)` — returns `Promise<StreamResultEvent>`
  - `.toDuplex()` — Node.js Duplex (write prompts, read text)
  - `.toReadable()`, `.pipe()`, `.end()`, `.abort()`
- **Constants** — all 180+ string literals extracted to named constants, exported for client use
- Streaming guide with 27 integration patterns
- 122 tests

### Changed

- `stream()` returns `StreamHandle` instead of `AsyncIterable<StreamEvent>` (backward compatible)
- Zero magic strings in source code

## [0.2.0] - 2026-03-15

### Fixed

- CLI streaming (`--verbose` flag for `stream-json`)
- `systemPrompt` in SDK mode
- `mcpServers` and `hooks` dead code in CLI mode
- `effortLevel` via `--effort` flag instead of env variable

### Added

- Permission mode `auto`, effort level `max`
- `--agent`, `--tools`, `--name`, `--strict-mcp-config` flags
- Comprehensive examples document

## [0.1.0] - 2026-03-10

### Added

- Initial release: `Claude`, `Session`, `ScheduledJob`, `CliExecutor`, `SdkExecutor`
- Full `ClientOptions` covering 45+ CLI flags
- Streaming, structured output, MCP, agents, hooks, worktrees
- Typed error hierarchy
- 82 unit tests
