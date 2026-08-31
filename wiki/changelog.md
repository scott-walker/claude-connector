# Changelog

All notable changes to this project will be documented in this file.

## [0.7.0] - 2026-08-31

### Added

- **Agent SDK 0.3.251** — dependency bumped from `0.2.72`. ~210 audited gaps between the SDK surface and this wrapper are closed; everything below is a consequence of that audit.
- **39 new `ClientOptions` fields** (43 → 82), by capability:
  - *Session continuation* — `resume`, `sessionId`, `continueSession`, `forkSession`, `resumeSessionAt`, `resumeDropsTurn`. Previously reachable only as CLI flags; now honoured in SDK mode too.
  - *Session storage* — `sessionStore`, `sessionStoreFlush`, `sessionStoreLoadTimeoutMs` for mirroring transcripts into a custom backend.
  - *System prompt composition* — `systemPromptFile`, `appendSystemPromptFile`, `appendSubagentSystemPrompt`, `excludeDynamicSystemPromptSections`. `systemPrompt` now also accepts `string[]`, split on the exported `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` marker so the static prefix stays cacheable.
  - *Tools and skills* — `skills` (`string[] | 'all'`), `toolAliases`, `toolConfig`, `disableSlashCommands`. `tools` now also accepts `{ type: 'preset', preset: 'claude_code' }`.
  - *Sandboxing* — `sandbox` (`SandboxConfig`: network allow/deny lists, filesystem read/write policy, credential masking, proxy ports).
  - *Budgets and thinking* — `taskBudgetTokens`, `maxThinkingTokens`, `autocompact`.
  - *Permissions* — `permissionPromptToolName`, `dangerouslySkipPermissions`, `safeMode`, `bare`.
  - *Stream shaping* — `includeHookEvents`, `forwardSubagentText`, `replayUserMessages`, `perTaskStopAffordance`, `brief`.
  - *Runtime and escape hatches* — `runtime`, `runtimeArgs`, `abortController`, `managedSettings`, `planModeInstructions`, `onUserDialog`, `supportedDialogKinds`, `extraArgs`. `fallbackModel` accepts an array, `debug` accepts a filter string.
- **8 new `QueryOptions` fields** (19 → 27) — `fallbackModel`, `planModeInstructions`, `systemPromptFile`, `appendSystemPromptFile`, `taskBudgetTokens`, `skills`, `files`, `background`.
- **33 hook events, each with a typed input and a typed output** — `HookEvent` grew from 21 loose string literals to all 33 events the CLI dispatches (new: `PostToolBatch`, `UserPromptExpansion`, `StopFailure`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `PermissionDenied`, `TaskCreated`, `CwdChanged`, `FileChanged`, `DirectoryAdded`, `MessageDisplay`). `HookInput` is now a discriminated union of 33 per-event interfaces instead of an index-signature bag, so `input.tool_name` / `input.file_path` narrow off `input.hook_event_name`. 22 per-event `HookSpecificOutput` interfaces type the return side. All 33 `HOOK_*` name constants and `VALID_HOOK_EVENTS` are exported.
- **5 kinds of configured hook** — `HookEntry` is now a union of `CommandHookEntry` (with `args`, `if`, `shell`, `once`, `async`, `asyncRewake`, `statusMessage`), `PromptHookEntry`, `AgentHookEntry`, `HttpHookEntry` and `McpToolHookEntry`. `HooksConfig` and `HookMatcher` are keyed and completed by the 33 event names, with `matcher` now optional for non-tool events.
- **25 new stream events** (18 → 43), all typed and all wired into `StreamHandle.on()` / `ChatHandle.on()`:
  - *Reasoning* — `thinking`, `thinking_tokens`
  - *Tools and tasks* — `tool_result`, `task_updated`, `background_tasks_changed`
  - *Resilience* — `api_retry`, `model_refusal_fallback`, `model_refusal_no_fallback`
  - *Session and runtime* — `init`, `session_state_changed`, `status`, `worker_shutting_down`, `conversation_reset`, `mirror_error`
  - *Permissions and notices* — `permission_denied`, `notification`, `informational`, `prompt_suggestion`
  - *Context and memory* — `context_usage`, `memory_recall`, `partial_message`
  - *Environment* — `commands_changed`, `plugin_install`, `elicitation_complete`, `control_request_progress`
- **13 new control methods on `Claude`** (SDK mode) — `setMaxThinkingTokens()`, `applyFlagSettings()`, `seedReadState()`, `readFile()`, `backgroundTasks()`, `setMcpPermissionModeOverride()`, `initializationResult()`, `reinitialize()`, `reloadPlugins()`, `reloadSkills()`, `getContextUsage()`, `usage()`, `streamInput()`.
- **Session-management API** — 8 new methods on `Session` (`rename()`, `tag()`, `delete()`, `fork()`, `info()`, `messages()`, `subagents()`, `subagentMessages()`) and 12 new module-level functions: `getSessionInfo()`, `listSubagents()`, `getSubagentMessages()`, `forkSession()`, `renameSession()`, `tagSession()`, `deleteSession()`, `importSessionToStore()`, `createInMemorySessionStore()`, `loadSessionStoreHelpers()`, `resolveSettings()`, `loadSettingsHelpers()`. `listSessions()` and `getSessionMessages()` gained typed option objects. `SessionOptions` gained `sessionId` for pinning a session's UUID before the first turn.
- **32 new CLI flags** emitted by the args builder (28 → 60) — `--thinking`, `--max-thinking-tokens`, `--task-budget`, `--autocompact`, `--system-prompt-file`, `--append-system-prompt-file`, `--append-subagent-system-prompt`, `--exclude-dynamic-system-prompt-sections`, `--setting-sources`, `--safe-mode`, `--bare`, `--betas`, `--brief`, `--debug`, `--debug-file`, `--disable-slash-commands`, `--file`, `--include-hook-events`, `--include-partial-messages`, `--forward-subagent-text`, `--replay-user-messages`, `--prompt-suggestions`, `--permission-prompt-tool`, `--plan-mode-instructions`, `--plugin-dir`, `--plugin-dir-no-mcp`, `--plugin-url`, `--allow-dangerously-skip-permissions`, `--dangerously-skip-permissions`, `--resume-session-at`, `--resume-drops-turn`, plus `--session-id`, whose constant had been declared but never emitted.
- **13 new fields on `QueryResult` and `StreamResultEvent`** — `subtype`, `isError`, `errors`, `terminalReason`, `modelUsage`, `permissionDenials`, `deferredToolUse`, `durationApiMs`, `queuedTurnCount`, `ttftMs`, `apiErrorStatus`, `fastModeState`, `origin`.
- **New exported constant groups** — `VALID_RESULT_SUBTYPES`, `VALID_TERMINAL_REASONS`, `VALID_RATE_LIMIT_TYPES`, `VALID_HOOK_EVENTS`, `EFFORT_XHIGH`, `PERMISSION_MANUAL`, `MCP_SDK`, `MCP_CLAUDEAI_PROXY`, `BLOCK_THINKING`, `BLOCK_REDACTED_THINKING`, `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`, `RESUME_REJECTED_PREFIX`, `BETA_CONTEXT_1M`.
- **`postResultDrainMs`** — `result` is not the last frame of a turn (`prompt_suggestion`, a trailing `task_notification` and `session_state_changed` follow it), so SDK mode now keeps reading for a bounded window after the result. The default is one event-loop turn; raise it when you rely on `prompt_suggestion`, which arrives from a separate model call.
- **`parseStreamEvents()`** — the plural counterpart of `parseStreamLine()`. One stream-json line can carry several events (an assistant turn with a thinking block and a text block, a user turn answering parallel tool calls); the singular reader returns only the last one and is kept for compatibility.
- **`getUsageLimitPrefixes()`** — lazy accessor for the SDK's four message-prefix lists (`USAGE_LIMIT_ERROR_PREFIXES`, `USAGE_WARNING_PREFIXES`, `USAGE_TRANSITION_PREFIXES`, `ORG_POLICY_LIMIT_PREFIXES`), so a rate-limit message can be bucketed instead of pattern-matched by hand.
- **Option-combination validation** — `validateClientOptions()` now rejects `sessionId` together with `resume`/`continueSession` (unless `forkSession` is set), `supportedDialogKinds` without `onUserDialog`, and `sessionStore` together with `noSessionPersistence`, instead of letting the subprocess fail opaquely later. `taskBudgetTokens` is checked for being a positive integer. It also rejects `type: 'url'` plugins in SDK mode (the SDK's own arg builder throws on them from deep inside the module), in-process `mcpServers` in CLI mode (serializing one into `--mcp-config` throws on its circular structure), and `extraArgs` keys that are empty, carry a leading dash, or contain whitespace (both modes build the flag as `--` + key, so such a key can only produce argv the CLI misreads silently).

### Changed

- **Raw result error subtypes now surface.** `QueryResult.subtype` and `StreamResultEvent.subtype` previously collapsed every `error_*` value to the single string `'error'`. They now pass the CLI's value through verbatim — `error_during_execution`, `error_max_turns`, `error_max_budget_usd`, `error_max_structured_output_retries`. Code comparing `subtype === 'error'` must switch to `isError` or to the specific subtype constants.
- **Hook entries are serialized with `type: 'command'`.** Entries in the `--settings` payload that omit `type` now get `type: 'command'` injected. The CLI settings schema requires the discriminator and silently drops entries without it, so old `{ command, timeout }` configs start being executed where they were previously ignored.
- **`interrupt()` returns a receipt.** The signature changed from `Promise<void>` to `Promise<InterruptResult | undefined>`, reporting which queued message UUIDs survived the interrupt (`stillQueued`) and which were cancelled. Callers that ignore the return value are unaffected.

### Fixed

- **`QueryOptions` were silently ignored in SDK mode.** SDK mode is the default, and per-query overrides never reached the session. Eight are now bridged through the control protocol and restored after the query — `model`, `permissionMode` and `thinking` as their own control requests, and `effortLevel`, `fallbackModel`, `allowedTools`, `disallowedTools`, `additionalDirs` through `applyFlagSettings()`; `systemPrompt` is prepended to the prompt text. The remaining overrides are construction-time only in SDK mode and are documented as such instead of being dropped without a word. `skills` and `background` are inert per query in *both* modes and are now marked `@deprecated`.
- **`QueryOptions.signal` was a no-op in SDK mode.** `SdkExecutor` never read it, so `claude.query(p, { signal })` could not be cancelled. The read loop now races the signal, interrupts the running turn and rejects.
- **`systemPrompt` was overwritten by `appendSystemPrompt`.** Setting both discarded the custom prompt. The three forms (custom string/array, preset with `append`/`excludeDynamicSections`, default) are now mutually exclusive in precedence order.
- **`effortLevel: 'xhigh'` was rejected.** The value existed in the SDK but was missing from `EffortLevel` and `VALID_EFFORT_LEVELS`, so validation threw a `ValidationError`. Added as `EFFORT_XHIGH`.
- **`tools: ['default']` silently disabled every tool in SDK mode.** The documented "all tools" spelling was forwarded as a literal tool named `default`. It is now translated to `{ type: 'preset', preset: 'claude_code' }`, which is also the canonical way to write it.
- **Hook lifecycle events were dead code.** `hook_started` / `hook_progress` / `hook_response` were parsed and exported, but the SDK never emits them without `includeHookEvents: true` — an option the library had no way to set. Added.
- **A warm SDK session kept the process alive for two minutes.** `init()` armed the initialization-timeout `setTimeout` inside a `Promise.race` and never cleared it, so a script that had finished its work — and even called `close()` — sat idle until the deadline elapsed.
- **An abort that landed after the result threw away the answer.** With the post-result drain window open, a cancel arriving between the `result` message and the end of the window rejected the query instead of returning the result the turn had already produced.
- **CLI mode returned a fraction of `QueryResult`.** The non-streaming JSON path filled 8 of the 21 fields and 2 of the 6 `TokenUsage` fields — no `subtype`, `isError`, `errors`, `terminalReason`, `modelUsage`, `permissionDenials`, `ttftMs` and no cache-token accounting. `parseJsonResult()` now runs the one-shot payload through the same `parseResultEvent()` mapping the stream uses, so both modes report the same shape.
- **CLI mode could not correlate a tool result to its call.** The parser built `tool_use` events without `toolUseId`, leaving `StreamToolResultEvent.toolUseId` nothing to join against.
- **`ChatHandle` and the CLI stream parser dropped events.** Both consumed the single-event reader, so a `/context` turn lost its rendered table, an assistant line carrying both a thinking and a text block lost the thinking, a user line answering parallel tool calls kept only the first `tool_result`, and a wrapper-level `error` on a failed assistant turn was never surfaced. Both now consume `parseStreamEvents()`, which returns every event a line carries in wire order.
- **`SessionOptions.resumeSessionAt` / `resumeDropsTurn` were inert.** Both were declared and documented but never forwarded to the args builder.
- **`permissionMode: 'manual'` was rejected by validation.** `'manual'` is the `claude` binary's own spelling of `'default'`, but it was missing from `VALID_PERMISSION_MODES`. It is now accepted and normalized to `'default'` before being forwarded to the SDK, which knows only the latter.

## [0.6.0] - 2026-04-03

### Changed

- **Rebrand** — package renamed from `@scottwalker/claude-connector` to `@scottwalker/kraube-konnektor`. CLI binary, error classes (`KraubeKonnektorError`), all docs and examples updated. A backwards-compatible wrapper package is available at `compat/` for the old name.
- **Init without probe message** — replaced the `"."` probe message with `initializationResult()` SDK method. No more phantom sessions created during warm-up.
- **Landing page font** — heading font changed from Bangers to Underdog.

### Added

- **9 new typed StreamEvent types** for full SDK message coverage:
  - `StreamToolProgressEvent` — tool execution progress (toolName, elapsedTimeSeconds)
  - `StreamToolUseSummaryEvent` — AI-generated summary of tool usage
  - `StreamAuthStatusEvent` — MCP authentication status
  - `StreamHookStartedEvent` / `StreamHookProgressEvent` / `StreamHookResponseEvent` — hook lifecycle
  - `StreamFilesPersistedEvent` — file checkpoint events
  - `StreamCompactBoundaryEvent` — context compaction events
  - `StreamLocalCommandOutputEvent` — output from slash commands (/voice, /cost, etc.)
- **9 new EVENT_* constants** — `EVENT_TOOL_PROGRESS`, `EVENT_TOOL_USE_SUMMARY`, `EVENT_AUTH_STATUS`, `EVENT_HOOK_STARTED`, `EVENT_HOOK_PROGRESS`, `EVENT_HOOK_RESPONSE`, `EVENT_FILES_PERSISTED`, `EVENT_COMPACT_BOUNDARY`, `EVENT_LOCAL_COMMAND_OUTPUT`

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

- **`bin` entry point** — fixed invalid script path format that caused npm to strip the `kraube-konnektor` binary during publish

## [0.5.0] - 2026-03-29

### Added

- **CLI `setup` command** — one-command bootstrap for fresh servers: checks Node.js version, installs Claude Code globally, runs `claude login` for authentication, and verifies the result
- **`bin` entry point** — package now provides `kraube-konnektor` executable via `npx @scottwalker/kraube-konnektor setup`
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
