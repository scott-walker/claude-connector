# Architecture

## Overview

`kraube-konnektor` is a programmatic Node.js interface for Claude Code. It supports two execution modes: **SDK mode** (default, uses the Claude Agent SDK in-process) and **CLI mode** (spawns `claude -p` per query). The library gives both modes the same typed surface: 82 client options, 27 per-query options, 43 stream events, 33 hook events, and — in SDK mode — 26 control methods on the live session.

Built against `@anthropic-ai/claude-agent-sdk` **^0.3.251**.

```
┌──────────────────────────────────────────────────────────────────┐
│                        Consumer Code                             │
│                                                                  │
│  const claude = new Claude({ model: 'sonnet' })                  │
│  const result = await claude.query('Fix the bug')                │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Claude (Facade)                              │
│                                                                  │
│  Orchestrates all components. Validates input. Merges options.   │
│  Delegates execution. Proxies SDK control methods.               │
│  Exposes: query, stream, chat, session, loop, parallel.          │
│  SDK control: 26 methods (model, permissions, MCP, context,      │
│  usage, plugins, skills, files, tasks, interrupt, …)             │
└──────┬────────────────────┬──────────────────────┬───────────────┘
       │                    │                      │
       ▼                    ▼                      ▼
┌─────────────┐    ┌──────────────┐    ┌────────────────────┐
│ ArgsBuilder │    │  IExecutor   │    │     Session        │
│             │    │  (interface) │    │                    │
│ Converts    │    │              │    │ Multi-turn state   │
│ options →   │    │  ┌────────┐  │    │ management via     │
│ CLI args    │    │  │  SDK   │  │    │ --resume/--continue│
│ (constants) │    │  │Executor│  │    │                    │
│             │    │  └───┬────┘  │    │ Returns StreamHandle│
└─────────────┘    │      │       │    └────────────────────┘
                   │      │ V1    │
                   │      │query()│    ┌────────────────────┐
                   │      ▼       │    │   StreamHandle     │
                   │  ┌────────┐  │    │   (Readable)       │
                   │  │ Query  │  │    │                    │
                   │  │ object │  │    │   .on() × 43 events│
                   │  │        │  │    │   .done() .text()  │
                   │  │ 26 ctrl│  │    │   .pipe()          │
                   │  │ methods│  │    │   .toReadable()    │
                   │  └────────┘  │    └────────────────────┘
                   │  ┌────────┐  │    ┌────────────────────┐
                   │  │  CLI   │  │    │   ChatHandle       │
                   │  │Executor│  │    │   (Duplex)         │
                   │  └───┬────┘  │    │                    │
                   └──────┼───────┘    │   .send() .pipe()  │
                          │            │   .toReadable()    │
                          ▼            │   .toDuplex()      │
              ┌───────────────────┐    └────────────────────┘
              │   CLI Process     │
              │   claude -p "..." │
              │   --output-format │
              │   stream-json     │
              └───────────────────┘
```

## Design Principles

### 1. SOLID

**Single Responsibility**:
- `Claude` — facade, delegates everything, proxies SDK control methods
- `ArgsBuilder` — only converts options to CLI args (using constants from `constants.ts`)
- `SdkExecutor` — manages persistent SDK session via V1 `query()` API (default)
- `CliExecutor` — only spawns and manages CLI processes
- `InputController` — controllable async iterable for multi-turn message delivery
- `Session` — only tracks session state
- `StreamHandle` — fluent streaming API + Node.js Readable bridge
- `ChatHandle` — bidirectional streaming + Node.js Duplex bridge
- `Scheduler` — only manages recurring execution
- Parsers — only parse CLI output

**Open/Closed**:
- New execution backends are added by implementing `IExecutor` — no changes to existing code.
- New CLI flags are added to `ArgsBuilder` — parsers and executor remain unchanged.
- New stream consumers are added via `StreamHandle.on()` — no core changes needed.
- New control methods are added to `SdkExecutor` by delegating to the `Query` object.

**Liskov Substitution**:
- Any `IExecutor` implementation can replace `SdkExecutor`/`CliExecutor` without breaking the client.

**Interface Segregation**:
- `IExecutor` has only 3 methods: `execute`, `stream`, `abort`.
- SDK control methods live on `SdkExecutor` (not on `IExecutor`) — CLI mode callers are never burdened with SDK-only methods.
- Types are split into focused files: `client.ts`, `result.ts`, `hooks.ts`, `session.ts`, `settings.ts`.

**Dependency Inversion**:
- `Claude` depends on `IExecutor` (abstraction), not `SdkExecutor` (implementation).
- Constructor injection: `new Claude(options, customExecutor)`.

### 2. No Magic Strings

All string literals (event types, CLI flags, permission modes, etc.) are centralized in `constants.ts`. Source files import named constants — no hardcoded strings anywhere in the codebase.

### 3. DRY

- Option merging logic is centralized in `mergeOptions()`.
- Validation is centralized in `utils/validation.ts`, referencing `VALID_PERMISSION_MODES` and `VALID_EFFORT_LEVELS` from constants.
- Error hierarchy has a single base class.
- Event dispatching logic is shared between `StreamHandle` and `ChatHandle`.

## Layer Map

```
src/
├── constants.ts          All string constants (events, flags, keys, modes)
├── index.ts              Public API surface (re-exports)
├── types/                Type definitions (no runtime code)
│   ├── client.ts         ClientOptions (82 fields), QueryOptions (27), PermissionMode,
│   │                     EffortLevel, CanUseTool, ThinkingConfig, SandboxConfig,
│   │                     ToolConfig, OnElicitation, OnUserDialog, McpServerConfig,
│   │                     AgentConfig, PluginConfig, SpawnOptions
│   ├── result.ts         QueryResult, StreamEvent (43 variants), TokenUsage,
│   │                     ModelUsageEntry, ContextUsage, UsageReport, TerminalReason,
│   │                     PermissionDenial, InitializationResult, Message
│   ├── hooks.ts          HookEvent (33), one input + one output type per event,
│   │                     HookCallback, HooksConfig, HookEntry
│   ├── session.ts        SessionOptions, SessionInfo, SessionMessage,
│   │                     SessionStore, SessionKey, ForkSessionOptions
│   └── settings.ts       Settings, ResolvedSettings, provenance types
├── executor/             Execution abstraction
│   ├── interface.ts      IExecutor, ExecuteOptions (two channels: argv + per-query)
│   ├── sdk-executor.ts   SDK implementation (V1 query API, persistent session, default)
│   │                     InputController, readMessages(), mapMessages(),
│   │                     applyPerQueryOverrides(), 26 control methods
│   └── cli-executor.ts   CLI implementation (spawn per query)
├── builder/              Options → CLI args
│   └── args-builder.ts   buildArgs(), mergeOptions(), resolveEnv()
├── parser/               CLI output → typed objects
│   ├── json-parser.ts    JSON mode parsing (delegates to parseResultEvent)
│   └── stream-parser.ts  NDJSON stream parsing
├── client/               High-level API
│   ├── claude.ts         Claude class (facade + SDK control method proxies)
│   ├── session.ts        Session class (stateful wrapper)
│   ├── stream-handle.ts  StreamHandle (fluent API + Node.js Readable)
│   └── chat-handle.ts    ChatHandle (bidirectional + Node.js Duplex)
├── scheduler/            Recurring execution (/loop equivalent)
│   └── scheduler.ts      Scheduler, ScheduledJob
├── errors/               Error hierarchy
│   └── errors.ts         All error classes
└── utils/                Shared utilities
    └── validation.ts     Input validation
```

## Key Abstractions

### IExecutor (executor/interface.ts)

The central abstraction that decouples the public API from the transport mechanism.

**Why it exists**: Today there are two executors — `SdkExecutor` (persistent SDK session, default) and `CliExecutor` (spawns `claude -p` per query). Tomorrow, Anthropic may ship an HTTP API or Unix socket interface. By coding against `IExecutor`, only a new implementation is needed.

**Contract**:
- `execute(args, options)` → `Promise<QueryResult>` (run to completion)
- `stream(args, options)` → `AsyncIterable<StreamEvent>` (incremental)
- `abort()` → `void` (cancel running execution)

**Invariants**:
- Error conditions throw `KraubeKonnektorError` subclasses
- Arguments are fully resolved (no option merging in the executor)

### SdkExecutor (executor/sdk-executor.ts)

Persistent in-process session using the Claude Agent SDK V1 `query()` API. This is the default executor.

**Why V1 instead of V2**: The V2 `SDKSession` API (`unstable_v2_createSession()`) is marked as unstable (`@alpha`) and only exposes `send()` + `stream()`. The V1 `query()` API returns a `Query` object with full control methods: `setModel`, `setPermissionMode`, `rewindFiles`, `stopTask`, `setMcpServers`, `accountInfo`, `supportedModels`, and more.

**Lifecycle**:
```
const executor = new SdkExecutor({ model: 'sonnet' })
await executor.init()          // warm up (emits stage events)
executor.execute(args, opts)   // fast — session already running
executor.execute(args, opts)   // fast — reuses InputController
executor.close()               // cleanup
```

**Multi-turn via InputController**: The V1 `query()` accepts an `AsyncIterable<SDKUserMessage>` as the `prompt` parameter. `InputController` is a controllable async iterable — each `execute()` / `stream()` call pushes a user message into the iterable, and the SDK consumes it. This avoids spawning a new process per query.

```
InputController                     Query (V1 API)
┌──────────────┐                   ┌──────────────┐
│ .push(msg)  ─┼──── iterable ───►│ reads prompt │
│              │                   │              │
│ queue[]      │                   │ yields       │
│ resolve()    │                   │ SDKMessage   │
│ .close()     │                   │ events       │
└──────────────┘                   └──────────────┘
```

**readMessages() pattern**: A critical implementation detail. The SDK `Query` object is an `AsyncGenerator`. Using `for await ... break` would call the generator's `.return()` method, closing it permanently and preventing session reuse. Instead, `readMessages()` uses manual `.next()` calls in a `while` loop, which never closes the generator.

```ts
// WRONG — for-await calls .return() on break, killing the session
for await (const msg of query) {
  if (msg.type === 'result') break; // closes generator!
}

// RIGHT — manual .next() preserves the generator for reuse
while (true) {
  const { value, done } = await query.next();
  if (done) break;
  const events = this.mapMessages(value);
  yield { source: value, events };
  if (events.some((e) => e.type === EVENT_RESULT)) openDrainWindow(); // generator stays open
}
```

**Post-result drain**: `result` is not the last frame of a turn — the SDK
documents `prompt_suggestion` as arriving after it, `task_notification` can
trail a backgrounded task, and `session_state_changed: 'idle'` is the
authoritative turn-over signal. Breaking on `result` made all three unreachable,
so the loop keeps reading afterwards until whichever comes first:
`session_state_changed: 'idle'`, the generator ending, or the
`postResultDrainMs` window elapsing (default `0` — one event-loop turn, which
picks up frames the transport has already delivered at no measurable cost). A
read still in flight when the window closes is parked on `pendingRead` and
handed to the next turn rather than swallowed.

**Per-query overrides**: the SDK session is created once, so the flags in `args` are inert for this executor and `ExecuteOptions` is the channel that works. `applyPerQueryOverrides()` bridges eight of them through the control protocol and returns a restore function that runs in a `finally`, so the session is left as it was found:

| Override | Control call | Restored with |
|---|---|---|
| `options.model` | `setModel()` | the previously mirrored model |
| `options.permissionMode` | `setPermissionMode()` | the previously mirrored mode |
| `options.thinking` | `setMaxThinkingTokens()` (`'adaptive'` is skipped — it has no token-budget spelling) | the previous budget + display |
| `options.effortLevel` | `applyFlagSettings({ effortLevel })` | whatever the flag layer held, or `null` |
| `options.fallbackModel` | `applyFlagSettings({ fallbackModel })` | whatever the flag layer held, or `null` |
| `options.allowedTools` / `disallowedTools` / `additionalDirs` | `applyFlagSettings({ permissions })` — the settings-file spelling `allow` / `deny` / `additionalDirectories` | whatever the flag layer held, or `null` |

Restores are best-effort: a failed restore is swallowed so it cannot mask the query's own outcome. Because the SDK exposes setters but no getters, the executor mirrors `currentModel` / `currentPermissionMode` / `currentThinking` / `currentFlagSettings` locally — that mirror is what "previous" means. The flag-settings tier is shallow-merged, so each bridged key is written whole. Everything else (`tools`, `agent`, `maxTurns`, `maxBudget`, `taskBudgetTokens`, `schema`, `worktree`, `files`, `planModeInstructions`, `input`, `env`, `cwd`) is construction-time only in SDK mode, and `skills` / `background` are inert per query in *both* modes; `options.systemPrompt` is prepended to the prompt text instead.

**Abort bridging**: `ExecuteOptions.signal` cannot kill a shared session — the next turn still needs it. `watchAbort()` turns the signal into a promise that resolves once with an `ABORTED` sentinel; `readMessages()` races a *marker derived from* the pending `.next()` (never the pending promise itself, so losing the race cannot consume a message). On abort it calls `Query.interrupt()` and keeps reading until the result arrives, so the generator is left positioned at the start of the next turn. `execute()` then throws `CliExecutionError('Query aborted')`; `stream()` yields the remaining events, including the aborted `result`. `CliExecutor` needs none of this — it sends SIGTERM to its own process.

**Message mapping**: one SDK message becomes zero or more `StreamEvent`s.

| SDK message | Mapper | Events produced |
|---|---|---|
| `assistant` | `mapAssistantMessage()` | wrapper-level `error`, then one event per content block (`text`, `tool_use`, `thinking` — plain or redacted), then `context_usage` when the wrapper carries it |
| `user` | `mapUserMessage()` | one `tool_result` per `tool_result` block; anything else falls back to `system` |
| `result` | `mapResultMessage()` | an `error` first when the turn was a rejected `resumeDropsTurn`, then `result` |
| `system` | `mapSystemMessage()` | dispatched on `subtype` — `init`, task/hook/compaction/status/refusal/permission/notification/memory/plugin events; unknown subtypes become `system` |
| `rate_limit_event` | inline | `rate_limit` |
| `stream_event` | inline | `partial_message` |
| `tool_progress`, `tool_use_summary`, `auth_status`, `conversation_reset`, `prompt_suggestion` | inline | the matching typed event |
| anything else | `genericSystemEvent()` | `system`, carrying the raw payload |

The CLI executor reaches the same 43 variants through `parseStreamEvents()`, which returns every event a single NDJSON line carries — that is why the two modes are interchangeable for consumers. `parseStreamLine()` is the single-event view kept for backward compatibility.

**Control methods (26)**: `SdkExecutor` exposes methods that delegate directly to the `Query` object:

| Group | Methods |
|---|---|
| Model & sampling | `setModel`, `setMaxThinkingTokens`, `applyFlagSettings` |
| Permissions | `setPermissionMode`, `setMcpPermissionModeOverride` |
| Files | `rewindFiles`, `seedReadState`, `readFile` |
| Tasks | `stopTask`, `backgroundTasks`, `interrupt` |
| MCP | `setMcpServers`, `reconnectMcpServer`, `toggleMcpServer`, `mcpServerStatus` |
| Discovery | `accountInfo`, `supportedModels`, `supportedCommands`, `supportedAgents`, `initializationResult`, `reinitialize` |
| Reload | `reloadPlugins`, `reloadSkills` |
| Telemetry | `getContextUsage`, `usage` |
| Input | `streamInput` |

The `Claude` facade proxies all 26, each guarded by `requireSdk()` so CLI mode throws a message naming the method. `initializationResult()` is served from the value cached during warm-up (no round trip); `reinitialize()` re-requests it.

### StreamHandle (client/stream-handle.ts)

Wraps an `AsyncIterable<StreamEvent>` with a fluent API and Node.js stream bridge.

**Why it exists**: Raw `for await` loops require boilerplate for common patterns (collect text, pipe to stdout, track progress). `StreamHandle` provides `.on().done()`, `.text()`, `.pipe()`, and `.toReadable()` for these cases, while preserving `for await` backward compatibility.

### ChatHandle (client/chat-handle.ts)

Manages a persistent CLI process with `--input-format stream-json` for bidirectional streaming.

**Why it exists**: One-shot `stream()` spawns a process per query. For multi-turn conversations where latency matters, `ChatHandle` keeps one process alive and sends messages via stdin. It provides `.send()` (Promise-based), `.toDuplex()` (Node.js Duplex), and the same `.on()` fluent API as `StreamHandle`.

### ArgsBuilder (builder/args-builder.ts)

Purely functional module that converts typed options into CLI argument arrays.

**Why it's separate**: Argument building is a distinct concern from execution. All CLI flag strings come from `constants.ts` — no hardcoded flags in the builder.

### Constants (constants.ts)

Single source of truth for all string literals: event types, CLI flags, JSON protocol keys, permission modes, effort levels, error names, etc. Every module imports from here — zero magic strings in the codebase.

## Data Flow

### query() — Synchronous request

```
claude.query('Find bugs', { model: 'opus' })
  │
  ├─ validate prompt & options
  ├─ mergeOptions(clientOpts, queryOpts, { outputFormat: FORMAT_JSON })
  ├─ buildArgs(resolvedOptions) → [FLAG_PRINT, FLAG_OUTPUT_FORMAT, FORMAT_JSON, ...]
  ├─ resolveEnv(clientOpts, queryOpts)
  │
  └─ executor.execute(args, { cwd, env, input, systemPrompt })
       │
       │  SDK mode:                          CLI mode:
       │  ┌──────────────────────────┐      ┌─────────────────────────┐
       │  │ applyPerQueryOverrides() │      │ spawn(executable, args) │
       │  │ inputController.push()   │      │ collect stdout          │
       │  │ readMessages(signal)     │      │ wait for exit           │
       │  │ mapMessages() → events   │      │ parseJsonResult()       │
       │  │ restore overrides        │      └─────────────────────────┘
       │  └──────────────────────────┘
       │
       │  Both modes fill the extended QueryResult fields (terminalReason,
       │  modelUsage, permissionDenials, …): `parseJsonResult()` runs the
       │  one-shot payload through the same `parseResultEvent()` mapping the
       │  stream uses. The raw payload is kept in `raw` either way.
       └─→ QueryResult
```

### stream() — Streaming request

```
claude.stream('Rewrite module')
  │
  ├─ validate & merge (outputFormat: FORMAT_STREAM_JSON)
  │
  └─ new StreamHandle(() => executor.stream(args, options))
       │
       ├─ .on(EVENT_TEXT, cb)     → register callback
       ├─ .on(EVENT_TOOL_USE, cb) → register callback
       ├─ .on(EVENT_TASK_STARTED, cb) → subagent lifecycle
       ├─ .done()                 → consume iterable, dispatch events
       │     │
       │     │  SDK mode: applyPerQueryOverrides() → push message →
       │     │            readMessages() (manual .next()) → mapMessages()
       │     │            → restore overrides in `finally`
       │     │  CLI mode: for each NDJSON line, parseStreamEvents()
       │     │
       │     └─ dispatch to registered callbacks
       │
       ├─ .text()                 → collect text, return string
       ├─ .pipe(writable)         → pipe text, return result
       └─ .toReadable()           → Node.js Readable (text mode)
```

### chat() — Bidirectional streaming

```
claude.chat()
  │
  ├─ buildArgs({ inputFormat: FORMAT_STREAM_JSON, ... })
  │
  └─ new ChatHandle(executable, args, { cwd, env })
       │
       ├─ spawn process with stdin open
       ├─ .send(prompt) → write JSON to stdin, await result
       ├─ stdout → parseStreamEvents → dispatch every event on the line
       ├─ .toDuplex() → Node.js Duplex (write prompts, read text)
       └─ .end() → close stdin → process exits
```

### SDK init() — Session warm-up

```
executor.init()
  │
  ├─ Stage 1: import('@anthropic-ai/claude-agent-sdk')
  │
  ├─ Stage 2: Create InputController + build SDK options
  │    └─ sdkModule.query({ prompt: inputController.iterable, options })
  │
  ├─ Stage 3: await query.initializationResult() over the control protocol
  │    └─ No probe message is sent, so no phantom session is created
  │    └─ Emits INIT_EVENT_STAGE events for progress tracking
  │    └─ Races DEFAULT_INIT_TIMEOUT_MS (or initTimeoutMs)
  │
  └─ Stage 4: _ready = true, emit INIT_EVENT_READY
```

## Hook Systems

There are two independent hook systems for different execution modes:

### hooks (CLI mode — shell commands)

Defined via `ClientOptions.hooks`. Each hook entry specifies a shell command that is executed by the CLI process. Configured in `HooksConfig` with matchers for tool names.

```ts
new Claude({
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'echo "Bash used"' }] }],
  },
})
```

### hookCallbacks (SDK mode — JS functions)

Defined via `ClientOptions.hookCallbacks`. Each callback is an async JS function that runs in-process. Supports all **33** hook events, listed in `VALID_HOOK_EVENTS` (`src/constants.ts`) and exported individually as `HOOK_*` constants:

| Group | Events |
|---|---|
| Tools | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch` |
| Prompt & turn | `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `StopFailure`, `MessageDisplay` |
| Session | `SessionStart`, `SessionEnd`, `Setup`, `ConfigChange`, `InstructionsLoaded` |
| Subagents & tasks | `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle` |
| Context | `PreCompact`, `PostCompact` |
| Model | `PreModelSwitch`, `PostModelSwitch` |
| Permissions | `PermissionRequest`, `PermissionDenied` |
| Elicitation | `Elicitation`, `ElicitationResult` |
| Workspace | `WorktreeCreate`, `WorktreeRemove`, `CwdChanged`, `FileChanged`, `DirectoryAdded`, `Notification` |

Hook **inputs** keep the wire's `snake_case` (`tool_name`, `hook_event_name`); hook **outputs** are `camelCase` (`hookEventName`, `permissionDecision`). The asymmetry is the protocol's, not an oversight — narrow on `input.hook_event_name` to get the typed payload for one event.

```ts
new Claude({
  hookCallbacks: {
    PreToolUse: [{
      matcher: 'Bash',
      hooks: [async (input) => ({ continue: true })],
    }],
  },
})
```

## Permission Control

### canUseTool (SDK mode)

Programmatic permission callback at the executor level. Called before each tool execution with the tool name, input, and context (abort signal, suggestions, tool use ID, agent ID). Returns `{ behavior: 'allow' }`, `{ behavior: 'deny', message }`, or `{ behavior: 'ask' }`.

```ts
new Claude({
  canUseTool: async (toolName, input, { signal }) => {
    if (toolName === 'Bash' && String(input.command).includes('rm -rf'))
      return { behavior: 'deny', message: 'Dangerous command blocked' }
    return { behavior: 'allow' }
  },
})
```

This is separate from `permissionMode` (which sets coarse-grained policy) and `allowedTools`/`disallowedTools` (which set static rules). `canUseTool` provides dynamic, context-aware decisions.

## In-Process MCP Servers

The `McpSdkServerConfig` type (`type: 'sdk'`) allows running MCP servers in the same process as the SDK session. Created via `createSdkMcpServer()` from the SDK. Unlike stdio/http/sse MCP servers which run as separate processes, SDK-type servers share the Node.js event loop with the executor.

```ts
new Claude({
  mcpServers: {
    'my-server': { type: 'sdk', name: 'my-server', instance: sdkMcpServer },
    'remote':    { type: 'http', url: 'https://...' },
  },
})
```

## Task Events (Subagent Lifecycle)

Five event types track the lifecycle of subagent tasks:

| Event | When | Key fields |
|---|---|---|
| `task_started` | Subagent task begins | `taskId`, `toolUseId`, `description`, `taskType`, `subagentType`, `prompt` |
| `task_progress` | Periodic progress update | `taskId`, `usage`, `lastToolName`, `summary` (needs `agentProgressSummaries`) |
| `task_notification` | Task completes/fails/stops | `taskId`, `status`, `outputFile`, `summary`, `usage` |
| `task_updated` | Task metadata changed | `taskId`, `patch` — apply over the task you hold |
| `background_tasks_changed` | A task moved to/from the background | `tasks[]` — REPLACE semantics |

These are emitted as `StreamEvent` subtypes and can be captured via `StreamHandle.on()`:

```ts
claude.stream('Run tests')
  .on('task_started', (e) => console.log(`Task ${e.taskId}: ${e.description}`))
  .on('task_progress', (e) => console.log(`Progress: ${e.summary ?? e.description}`))
  .on('task_notification', (e) => console.log(`Done: ${e.status}`))
  .done()
```

Use `stopTask(taskId)` to cancel one task (declare `perTaskStopAffordance` so a stop request targets the task rather than the whole turn), and `backgroundTasks(toolUseId?)` to push the running tool call into the background.

## Error Handling Strategy

```
KraubeKonnektorError          Base class (catch-all)
├── CliNotFoundError          Binary not found (ERR_ENOENT)
├── CliExecutionError         Non-zero exit code
├── CliTimeoutError           Process exceeded DEFAULT_TIMEOUT_MS
├── ParseError                Unexpected CLI output format
└── ValidationError           Invalid options/input
```

**Philosophy**: Fail fast with descriptive messages. Each error class carries contextual data (exit code, stderr, raw output) for debugging. Error class names use constants from `ERR_NAME_*`.

## Testing Strategy

- **Unit tests**: Every module is tested in isolation using mock executors.
- **No real CLI calls in tests**: `IExecutor` is mocked, so tests run instantly.
- **Parser tests**: Cover both happy paths and edge cases (missing fields, malformed JSON).
- **Session tests**: Verify state management (session ID tracking, query counting, flag selection).
- **StreamHandle tests**: Verify `.on()`, `.done()`, `.text()`, `.pipe()`, `.toReadable()`, and `for await`.
- **ChatHandle tests**: Verify lifecycle (properties, close, abort, send-after-close).
- **Scheduler tests**: Use `vi.useFakeTimers()` for deterministic timing.
- **SDK executor tests**: Cover the message-mapping table, the option projection into the SDK session, per-query override apply/restore, and abort bridging against a fake `Query`.
- Run the suite with `npm test` (`vitest run`); `npm run typecheck` type-checks without emitting.

## Future Extensibility

### Adding new CLI flags

1. Add the constant to `constants.ts`
2. Add the option to `ClientOptions` and/or `QueryOptions` in `types/client.ts`
3. Add the field to `ResolvedOptions` and the merging logic in `mergeOptions()`
4. Add argument building in `buildArgs()` using the constant
5. If the SDK has an equivalent, add the field to `SdkExecutorOptions`, map it in `toSdkExecutorOptions()` (`client/claude.ts`) and consume it in `doInit()` — a field missing from that projection is a silent drop, not a type error
6. Add tests
7. No changes needed in the parsers

### Adding new stream event types

1. Add the constant to `constants.ts`
2. Add the type to the `StreamEvent` union in `types/result.ts`
3. Add parsing logic in `stream-parser.ts` (CLI mode) and `mapMessages()` / `mapSystemMessage()` in `sdk-executor.ts` (SDK mode)
4. Add the `.on()` overload in `StreamHandle` and `ChatHandle` (dispatch itself is keyed on `event.type` and needs no change)
5. Unknown types are already forwarded as `EVENT_SYSTEM` events, so existing code won't break

### Adding new SDK control methods

1. Add the method to `SdkExecutor`, delegating to `this.activeQuery!.methodName()` after `ensureQuery()`
2. Add a proxy method to `Claude` with a `this.requireSdk()` guard
3. Add type definitions in `types/result.ts` if new return types are needed, and a `map…()` function to translate the response's `snake_case` wire shape into the library's camelCase
4. No changes to `IExecutor` — control methods are SDK-specific
