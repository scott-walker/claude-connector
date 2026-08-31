# IExecutor

The core abstraction interface that decouples the public API from the underlying transport mechanism. All interaction with Claude Code goes through an executor.

```typescript
import type { IExecutor } from '@scottwalker/kraube-konnektor'
```

## Why This Abstraction Exists

Today the package ships two executors: `SdkExecutor` (Agent SDK, default) and `CliExecutor` (spawns `claude -p`). By coding against `IExecutor`, the entire public surface remains stable -- only a new executor implementation is needed to support new transports (HTTP API, Unix socket, etc.).

## Interface

```typescript
interface IExecutor {
  execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult>
  stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent>
  abort?(): void
}
```

### execute()

```typescript
execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult>
```

Run a query to completion and return a structured result.

| Parameter | Type | Description |
|-----------|------|-------------|
| `args` | `readonly string[]` | Resolved CLI arguments (produced by ArgsBuilder) |
| `options` | [`ExecuteOptions`](#executeoptions) | Execution-level options |

**Returns:** `Promise<`[`QueryResult`](./types#queryresult)`>`

### stream()

```typescript
stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent>
```

Run a query and stream incremental events. The returned async iterable yields events as they arrive, and ends shortly after `'result'` or `'error'`. `SdkExecutor` drains the informational frames the SDK sends *after* the result — `prompt_suggestion`, a trailing `task_notification`, `session_state_changed` — bounded by `postResultDrainMs`, so `'result'` is the last *turn* event but not necessarily the last event of all.

| Parameter | Type | Description |
|-----------|------|-------------|
| `args` | `readonly string[]` | Resolved CLI arguments (produced by ArgsBuilder) |
| `options` | [`ExecuteOptions`](#executeoptions) | Execution-level options |

**Returns:** `AsyncIterable<`[`StreamEvent`](./types#streamevent)`>`

### abort()

```typescript
abort?(): void
```

Abort a running execution. Optional -- implementations should kill the underlying process gracefully. Sends `SIGTERM` in CLI mode.

## ExecuteOptions

Low-level options passed directly to the executor. These are resolved from `ClientOptions` + `QueryOptions` by the client layer.

```typescript
interface ExecuteOptions {
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly prompt?: string
  readonly input?: string
  readonly systemPrompt?: string
  readonly signal?: AbortSignal

  // Per-query overrides, mirroring QueryOptions
  readonly model?: string
  readonly fallbackModel?: string | readonly string[]
  readonly effortLevel?: EffortLevel
  readonly permissionMode?: PermissionMode
  readonly planModeInstructions?: string
  readonly allowedTools?: readonly string[]
  readonly disallowedTools?: readonly string[]
  readonly appendSystemPrompt?: string
  readonly systemPromptFile?: string
  readonly appendSystemPromptFile?: string
  readonly maxTurns?: number
  readonly maxBudget?: number
  readonly taskBudgetTokens?: number
  readonly schema?: Record<string, unknown>
  readonly worktree?: boolean | string
  readonly additionalDirs?: readonly string[]
  readonly agent?: string
  readonly tools?: readonly string[] | ToolsPresetConfig
  readonly skills?: readonly string[] | 'all'
  readonly files?: readonly string[]
  readonly background?: boolean
  readonly thinking?: ThinkingConfig
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cwd` | `string` | Working directory for the process |
| `env` | `Record<string, string>` | Environment variables merged with `process.env` |
| `prompt` | `string` | The prompt for this execution, verbatim |
| `input` | `string` | Data piped to stdin (like `echo "data" \| claude`) |
| `systemPrompt` | `string` | System prompt. The CLI executor ignores it (it is already in `args`); the SDK executor prepends it to the prompt |
| `signal` | `AbortSignal` | Abort signal for this execution |

The remaining fields mirror [`QueryOptions`](./types#queryoptions) so an executor can honour a per-query override without re-parsing `args`.

::: tip Why `prompt` is passed separately
An executor that does not spawn a process would otherwise have to parse the flag array back apart, which loses quoting and mis-handles flags whose value is optional. `prompt` is authoritative; recovering it from `args` is the fallback.
:::

## Contract

Executors must follow these rules:

1. **Isolated per invocation** -- one call must not leak configuration into the next. `SdkExecutor` keeps a live session, so it applies per-query overrides through the control protocol and restores the previous values afterwards
2. **Error handling** -- throw [`KraubeKonnektorError`](./errors) subclasses for error conditions
3. **Stream termination** -- `stream()` must yield a `'result'` or `'error'` event, and must end soon after it. Trailing informational frames may follow the result (`SdkExecutor` drains them for `postResultDrainMs`), but nothing that belongs to the turn may come after
4. **Argument passthrough** -- `args` are fully resolved; the executor should not interpret or modify them

## Custom Executor Example

Replace the built-in executor with your own implementation:

```typescript
import {
  Claude,
  EVENT_RESULT,
  type IExecutor,
  type QueryResult,
  type StreamEvent,
} from '@scottwalker/kraube-konnektor'

class HttpExecutor implements IExecutor {
  private controller: AbortController | null = null

  async execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult> {
    const response = await fetch('https://my-claude-proxy.com/query', {
      method: 'POST',
      body: JSON.stringify({ args, ...options }),
    })
    return response.json()
  }

  async *stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent> {
    this.controller = new AbortController()
    const response = await fetch('https://my-claude-proxy.com/stream', {
      method: 'POST',
      body: JSON.stringify({ args, ...options }),
      signal: this.controller.signal,
    })

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const event = JSON.parse(decoder.decode(value))
      yield event
    }
  }

  abort(): void {
    this.controller?.abort()
  }
}

// Use the custom executor
const claude = new Claude({ model: 'opus' }, new HttpExecutor())
const result = await claude.query('Analyze this code')
```

## Built-in Executors

The package ships two executor implementations:

| Executor | Mode | Description |
|----------|------|-------------|
| `SdkExecutor` | `useSdk: true` (default) | Uses the Claude Agent SDK. Persistent session, fast subsequent queries. |
| `CliExecutor` | `useSdk: false` | Spawns a new `claude -p` process per query. Stateless. |

You do not need to import or instantiate these directly -- the `Claude` constructor selects the appropriate executor based on the `useSdk` option.

### SdkExecutor Internals

#### V1 API Migration

`SdkExecutor` uses the stable V1 `query()` API from the Claude Agent SDK. Earlier versions relied on `unstable_v2_createSession` which had stability issues. The V1 API provides a simpler, more reliable interface with built-in session management.

#### readUntilResult Pattern

Internally, `SdkExecutor` uses a `readUntilResult` pattern when streaming. Instead of closing the async generator with `for await...of` (which can trigger premature cleanup), it manually calls `.next()` on the iterator until a result event is received. This ensures the SDK session stays alive for the full duration of the query:

```typescript
// Simplified internal pattern
const iterator = conversation.query(prompt)[Symbol.asyncIterator]()
while (true) {
  const { done, value } = await iterator.next()
  if (done) break
  yield mapEvent(value)
  if (isResult(value)) break
}
```

#### Control Methods

`SdkExecutor` exposes additional control methods beyond the `IExecutor` interface:

| Method | Description |
|--------|-------------|
| `abort()` | Abort the current query via `AbortController` |
| `stopTask(taskId)` | Stop a specific subagent task by ID |
| `getRunningTasks()` | List currently running subagent tasks |
| `isReady()` | Check if the executor is initialized and ready for queries |
