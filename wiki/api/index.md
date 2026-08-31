# Claude

Main client class. Entry point for all interactions with Claude Code CLI.

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'
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
import { Claude, PERMISSION_PLAN, EFFORT_HIGH } from '@scottwalker/kraube-konnektor'

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
import { Claude, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

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
} from '@scottwalker/kraube-konnektor'

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
import { Claude, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

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
import { Claude, SCHED_RESULT, SCHED_ERROR } from '@scottwalker/kraube-konnektor'

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
import { Claude, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

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

## SDK Control Methods

The 26 methods below only exist in SDK mode (`useSdk: true`, the default). In CLI mode each one throws `"<method>() is only available in SDK mode."`.

### Session configuration

#### setModel()

```typescript
setModel(model?: string): Promise<void>
```

Change the active model for the current session. Omit `model` to reset to the default.

#### setPermissionMode()

```typescript
setPermissionMode(mode: PermissionMode): Promise<void>
```

Change the permission mode for the current session.

#### setMaxThinkingTokens()

```typescript
setMaxThinkingTokens(
  maxThinkingTokens: number | null,
  thinkingDisplay?: ThinkingDisplay | null,
): Promise<void>
```

Change the thinking budget mid-session. `0` disables thinking; `null` clears the budget so the model's default maximum applies again; any other value caps an adaptive budget. `thinkingDisplay` is `'summarized'` to show a summary, `'omitted'` to hide the blocks, or `null` to restore the default.

::: tip
Prefer [`ClientOptions.thinking`](./types#thinkingconfig) at construction. This mirrors the SDK's own deprecated control method and exists for mid-session changes.
:::

#### applyFlagSettings()

```typescript
applyFlagSettings(settings: FlagSettings): Promise<void>
```

Apply settings to the flag layer — the highest-priority settings tier — for the rest of the session. The mid-session twin of [`ClientOptions.settings`](./types#clientoptions).

Shallow merge: keys you pass replace that key, keys you omit are left alone, and an explicit `null` clears the key so the next tier down wins again. Nothing is written to any settings file.

```typescript
await claude.applyFlagSettings({ effortLevel: 'high' })
await claude.applyFlagSettings({ effortLevel: null }) // back to what settings say
```

### Files

#### rewindFiles()

```typescript
rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult>
```

Revert file changes back to their state at a given user message. Requires `enableFileCheckpointing: true`. Pass `dryRun: true` to preview.

#### readFile()

```typescript
readFile(
  path: string,
  options?: { maxBytes?: number; encoding?: 'utf-8' | 'base64' },
): Promise<ReadFileResult | null>
```

Read a file **through the session**, so the read honours the same permission rules as the `Read` tool. Returns `null` — never throws — on permission denial, a missing file, or a transport error. `maxBytes` caps the read (default 1 MB); pass `encoding: 'base64'` for binary files.

#### seedReadState()

```typescript
seedReadState(path: string, mtime: number): Promise<void>
```

Tell the session a file is already known to the caller, so the Read-before-Edit guard accepts an edit the session never read itself. `mtime` is the modification time the caller observed, in milliseconds.

### Tasks

#### stopTask()

```typescript
stopTask(taskId: string): Promise<void>
```

Stop a running subagent task by its ID.

#### backgroundTasks()

```typescript
backgroundTasks(toolUseId?: string): Promise<boolean>
```

Send the running tool call to the background — the Ctrl+B affordance. Omit `toolUseId` for the current call. Resolves `true` when something was backgrounded.

#### interrupt()

```typescript
interrupt(): Promise<InterruptResult | undefined>
```

Interrupt the current query.

Returns a receipt naming which queued user messages survived (`stillQueued`) and which were cancelled. Resolves to `undefined` on a CLI that predates the receipt protocol — the interrupt still happened, it just reported nothing.

::: warning Changed in 0.7.0
The return type went from `Promise<void>` to `Promise<InterruptResult | undefined>`. Callers that ignore the return value are unaffected.
:::

#### streamInput()

```typescript
streamInput(stream: AsyncIterable<unknown>): Promise<void>
```

Attach an extra input stream to the running session. Normal turns do not go through here — `query()` and `stream()` push onto the session's own input. Use this to inject pre-built user messages (attachments, caller-chosen UUIDs) alongside them.

### MCP

#### setMcpServers()

```typescript
setMcpServers(
  servers: Record<string, McpServerConfig | McpSdkServerConfig>,
): Promise<McpSetServersResult>
```

Replace the current set of MCP servers.

#### reconnectMcpServer()

```typescript
reconnectMcpServer(serverName: string): Promise<void>
```

Reconnect a disconnected MCP server by name.

#### toggleMcpServer()

```typescript
toggleMcpServer(serverName: string, enabled: boolean): Promise<void>
```

Enable or disable an MCP server by name.

#### setMcpPermissionModeOverride()

```typescript
setMcpPermissionModeOverride(
  serverName: string,
  mode: McpPermissionModeOverride,
): Promise<McpPermissionModeOverrideResult>
```

Pin one MCP server's permission mode, independent of the session's. `'auto'` lets the CLI decide, `'default'` always prompts, `null` clears the pin.

#### mcpServerStatus()

```typescript
mcpServerStatus(): Promise<McpServerStatus[]>
```

Connection status of all configured MCP servers.

### Introspection

#### initializationResult()

```typescript
initializationResult(): Promise<InitializationResult>
```

What the session loaded when it started: commands, agents, models, output styles and the signed-in account. Served from the warm-up cache — this does not hit the control protocol.

#### reinitialize()

```typescript
reinitialize(): Promise<InitializationResult>
```

Re-send `initialize` and refresh the cached result. Use after a transport gap: it redelivers pending `canUseTool` / `onUserDialog` requests and re-registers stdio hooks.

#### getContextUsage()

```typescript
getContextUsage(): Promise<ContextUsage>
```

Structured `/context` report — what is filling the context window right now.

```typescript
const usage = await claude.getContextUsage()
console.log(`${usage.percentage}% of ${usage.rawMaxTokens}`)
```

#### usage()

```typescript
usage(): Promise<UsageReport>
```

Session cost totals plus plan rate-limit utilization — the structured form of what `/usage` prints.

::: warning Experimental
The SDK marks the underlying control request unstable. This wrapper keeps a stable name, but the payload may still change.
:::

#### accountInfo()

```typescript
accountInfo(): Promise<AccountInfo>
```

Account information for the authenticated user.

#### supportedModels()

```typescript
supportedModels(): Promise<ModelInfo[]>
```

Models available to the current account.

#### supportedCommands()

```typescript
supportedCommands(): Promise<SlashCommand[]>
```

Slash commands the session recognizes.

#### supportedAgents()

```typescript
supportedAgents(): Promise<AgentInfo[]>
```

Configured agents available to the Task tool.

### Reloading

#### reloadPlugins()

```typescript
reloadPlugins(): Promise<ReloadPluginsResult>
```

Reload plugins from disk and return the refreshed command and agent lists.

#### reloadSkills()

```typescript
reloadSkills(): Promise<ReloadSkillsResult>
```

Reload skills from disk and return the refreshed list.

## Other Methods

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
import { Claude, INIT_EVENT_STAGE, INIT_EVENT_READY } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
claude.on(INIT_EVENT_STAGE, (stage, msg) => console.log(`[${stage}] ${msg}`))
claude.on(INIT_EVENT_READY, () => console.log('SDK session ready'))
await claude.init()
```
