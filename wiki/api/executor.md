# IExecutor

The core abstraction interface that decouples the public API from the underlying transport mechanism. All interaction with Claude Code goes through an executor.

```typescript
import type { IExecutor } from '@scottwalker/claude-connector'
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

Run a query and stream incremental events. The returned async iterable yields events as they arrive. The final event is always of type `'result'` or `'error'`.

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
  readonly env: Record<string, string>
  readonly input?: string
  readonly systemPrompt?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cwd` | `string` | Working directory for the process |
| `env` | `Record<string, string>` | Environment variables merged with `process.env` |
| `input` | `string` | Data piped to stdin (like `echo "data" \| claude`) |
| `systemPrompt` | `string` | System prompt (used by SDK executor; CLI executor ignores this as it's in args) |

## Contract

Executors must follow these rules:

1. **Stateless per invocation** -- no mutable state between calls
2. **Error handling** -- throw [`ClaudeConnectorError`](./errors) subclasses for error conditions
3. **Stream termination** -- `stream()` must yield a `'result'` or `'error'` event as the final event
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
} from '@scottwalker/claude-connector'

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
