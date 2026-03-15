# Claude

Main client class. Entry point for all interactions with Claude Code CLI.

```typescript
import { Claude } from '@scottwalker/claude-connector'
```

## Constructor

```typescript
new Claude(options?: ClientOptions, executor?: IExecutor)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options` | [`ClientOptions`](./types#clientoptions) | `{}` | Client-level defaults (frozen after construction) |
| `executor` | [`IExecutor`](./executor) | `SdkExecutor` | Custom executor implementation |

When `useSdk` is `true` (the default), the client creates an `SdkExecutor` that maintains a persistent SDK session. Set `useSdk: false` to use CLI mode where each query spawns a new process.

```typescript
import { Claude, PERMISSION_PLAN, EFFORT_HIGH } from '@scottwalker/claude-connector'

// SDK mode (default) — persistent session, faster subsequent queries
const claude = new Claude({
  model: 'opus',
  permissionMode: PERMISSION_PLAN,
  effortLevel: EFFORT_HIGH,
})

// CLI mode — each query spawns a new process
const cliClaude = new Claude({ useSdk: false })
```

## Methods

### query()

```typescript
query(prompt: string, options?: QueryOptions): Promise<QueryResult>
```

Execute a one-shot query and wait for the complete result.

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | The prompt to send to Claude |
| `options` | [`QueryOptions`](./types#queryoptions) | Per-query overrides |

**Returns:** `Promise<`[`QueryResult`](./types#queryresult)`>`

```typescript
import { Claude, PERMISSION_PLAN } from '@scottwalker/claude-connector'

const claude = new Claude()
const result = await claude.query('Find bugs in auth.ts', {
  model: 'opus',
  maxTurns: 5,
  permissionMode: PERMISSION_PLAN,
})

console.log(result.text)
console.log(result.usage) // { inputTokens, outputTokens }
console.log(result.sessionId) // for resuming later
```

### stream()

```typescript
stream(prompt: string, options?: QueryOptions): StreamHandle
```

Execute a query with real-time streaming output. Returns a [`StreamHandle`](./stream-handle) with fluent callbacks, Node.js stream support, and backward-compatible async iteration.

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | The prompt to send to Claude |
| `options` | [`QueryOptions`](./types#queryoptions) | Per-query overrides |

**Returns:** [`StreamHandle`](./stream-handle)

```typescript
import {
  Claude, EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR,
} from '@scottwalker/claude-connector'

const claude = new Claude()

// Fluent API
const result = await claude.stream('Rewrite the module')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TOOL_USE, (event) => console.log(`Tool: ${event.toolName}`))
  .on(EVENT_RESULT, (event) => console.log(`Done in ${event.durationMs}ms`))
  .on(EVENT_ERROR, (event) => console.error(event.message))
  .done()

// Collect text
const text = await claude.stream('Summarize').text()

// Pipe to stdout
const r = await claude.stream('Explain').pipe(process.stdout)

// Node.js Readable
claude.stream('Generate').toReadable().pipe(createWriteStream('out.txt'))

// Async iteration (backward compat)
for await (const event of claude.stream('Analyze')) {
  if (event.type === EVENT_TEXT) console.log(event.text)
}
```

### chat()

```typescript
chat(options?: QueryOptions): ChatHandle
```

Open a bidirectional streaming channel -- a persistent CLI process for multi-turn real-time conversation via `--input-format stream-json`.

::: warning CLI mode only
`chat()` always uses CLI mode (spawns a process), regardless of the `useSdk` setting.
:::

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | [`QueryOptions`](./types#queryoptions) | Per-query overrides |

**Returns:** [`ChatHandle`](./chat-handle)

```typescript
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const claude = new Claude({ useSdk: false })
const chat = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))

const r1 = await chat.send('What files are in src?')
const r2 = await chat.send('Fix the largest file')
chat.end()
```

### session()

```typescript
session(options?: SessionOptions): Session
```

Create a multi-turn conversation session. Each query in the session continues the same conversation context.

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | [`SessionOptions`](./session#sessionoptions) | Resume, fork, or continue options |

**Returns:** [`Session`](./session)

```typescript
const session = claude.session()
await session.query('Analyze the codebase')
await session.query('Now refactor the auth module') // remembers context
```

### loop()

```typescript
loop(interval: string | number, prompt: string, options?: QueryOptions): ScheduledJob
```

Schedule a recurring query (equivalent of CLI `/loop`). Executes immediately on creation, then repeats at the configured interval.

| Parameter | Type | Description |
|-----------|------|-------------|
| `interval` | `string \| number` | Interval string (`'30s'`, `'5m'`, `'2h'`, `'1d'`) or raw milliseconds |
| `prompt` | `string` | The prompt to execute on each tick |
| `options` | [`QueryOptions`](./types#queryoptions) | Per-query overrides |

**Returns:** [`ScheduledJob`](./scheduled-job)

```typescript
import { Claude, SCHED_RESULT, SCHED_ERROR } from '@scottwalker/claude-connector'

const claude = new Claude()
const job = claude.loop('5m', 'Check if deployment finished')
job.on(SCHED_RESULT, (r) => console.log(r.text))
job.on(SCHED_ERROR, (e) => console.error(e))

// Stop later
job.stop()
```

### parallel()

```typescript
parallel(queries: { prompt: string; options?: QueryOptions }[]): Promise<QueryResult[]>
```

Run multiple independent queries concurrently. All queries run in parallel using `Promise.all`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `queries` | `{ prompt: string; options?: QueryOptions }[]` | Array of queries to run |

**Returns:** `Promise<QueryResult[]>`

```typescript
import { Claude, PERMISSION_PLAN } from '@scottwalker/claude-connector'

const claude = new Claude()
const [bugs, docs] = await claude.parallel([
  { prompt: 'Find bugs', options: { cwd: './src' } },
  { prompt: 'Check docs', options: { permissionMode: PERMISSION_PLAN } },
])
```

### init()

```typescript
init(): Promise<void>
```

Initialize the SDK session (warm up). Only needed when `useSdk: true` (the default). In CLI mode this is a no-op.

The first query will auto-initialize if `init()` hasn't been called, but calling it explicitly lets you control the timing and monitor progress via events.

```typescript
const claude = new Claude()

claude.on('init:stage', (stage, msg) => console.log(stage, msg))
claude.on('init:ready', () => console.log('Warm and ready'))

await claude.init()
// All subsequent queries are fast
```

### abort()

```typescript
abort(): void
```

Cancel the currently running execution on the underlying executor. Sends `SIGTERM` to the CLI process or aborts the SDK call.

### close()

```typescript
close(): void
```

Close the SDK session and free resources. Only needed when `useSdk: true`. After calling `close()`, the client cannot be used again.

```typescript
const claude = new Claude()
try {
  const result = await claude.query('Do work')
} finally {
  claude.close()
}
```

## Properties

### ready

```typescript
get ready(): boolean
```

Whether the SDK session is initialized and ready. Always returns `true` in CLI mode.

## Events (on)

```typescript
on(event: string, listener: Function): this
```

Subscribe to initialization events. Only relevant when `useSdk: true`.

| Event | Constant | Callback | Description |
|-------|----------|----------|-------------|
| `'init:stage'` | `INIT_EVENT_STAGE` | `(stage: InitStage, message: string) => void` | Initialization progress |
| `'init:ready'` | `INIT_EVENT_READY` | `() => void` | SDK session is ready |
| `'init:error'` | `INIT_EVENT_ERROR` | `(error: Error) => void` | Initialization failed |

`InitStage` is one of: `'importing'`, `'creating'`, `'connecting'`, `'ready'`.

```typescript
import { Claude, INIT_EVENT_STAGE, INIT_EVENT_READY } from '@scottwalker/claude-connector'

const claude = new Claude()
claude.on(INIT_EVENT_STAGE, (stage, msg) => console.log(`[${stage}] ${msg}`))
claude.on(INIT_EVENT_READY, () => console.log('SDK session ready'))
await claude.init()
```
