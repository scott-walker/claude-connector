# API Reference

## Claude

Main client class. Entry point for all interactions with Claude Code CLI.

### Constructor

```typescript
new Claude(options?: ClientOptions, executor?: IExecutor)
```

| Parameter  | Type            | Description                                      |
|-----------|-----------------|--------------------------------------------------|
| `options`  | `ClientOptions` | Client-level defaults (frozen after construction) |
| `executor` | `IExecutor`     | Custom executor (default: `SdkExecutor`)          |

### Methods

#### `query(prompt, options?): Promise<QueryResult>`

Execute a one-shot query and wait for the complete result.

```typescript
import { Claude, PERMISSION_PLAN } from '@scottwalker/claude-connector'

const claude = new Claude()
const result = await claude.query('Find bugs in auth.ts', {
  model: 'opus',
  maxTurns: 5,
  permissionMode: PERMISSION_PLAN,
})
console.log(result.text)
console.log(result.usage)
```

#### `stream(prompt, options?): StreamHandle`

Execute a query with real-time streaming output. Returns a `StreamHandle` with fluent callbacks, Node.js stream support, and backward-compatible async iteration.

```typescript
import { Claude, EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR } from '@scottwalker/claude-connector'

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
for await (const event of claude.stream('Analyze')) { /* ... */ }
```

#### `chat(options?): ChatHandle`

Open a bidirectional streaming channel — a persistent CLI process for multi-turn real-time conversation via `--input-format stream-json`.

```typescript
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const claude = new Claude({ useSdk: false })
const chat = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))

const r1 = await chat.send('What files are in src?')
const r2 = await chat.send('Fix the largest file')
chat.end()
```

#### `session(options?): Session`

Create a multi-turn conversation session.

```typescript
const session = claude.session()
await session.query('Analyze the codebase')
await session.query('Now refactor the auth module')  // remembers context
```

#### `loop(interval, prompt, options?): ScheduledJob`

Schedule a recurring query (equivalent of CLI `/loop`).

```typescript
import { Claude, SCHED_RESULT, SCHED_ERROR } from '@scottwalker/claude-connector'

const claude = new Claude()
const job = claude.loop('5m', 'Check if deployment finished')
job.on(SCHED_RESULT, (r) => console.log(r.text))
job.on(SCHED_ERROR, (e) => console.error(e))
job.stop()
```

#### `parallel(queries): Promise<QueryResult[]>`

Run multiple independent queries concurrently.

```typescript
import { Claude, PERMISSION_PLAN } from '@scottwalker/claude-connector'

const claude = new Claude()
const [bugs, docs] = await claude.parallel([
  { prompt: 'Find bugs', options: { cwd: './src' } },
  { prompt: 'Check docs', options: { permissionMode: PERMISSION_PLAN } },
])
```

#### `init(): Promise<void>`

Initialize the SDK session (warm up). Only needed when `useSdk: true` (default). In CLI mode this is a no-op.

#### `abort(): void`

Cancel the currently running execution.

#### `close(): void`

Close the SDK session and free resources.

### Runtime Control Methods (SDK mode only)

These methods modify the active SDK session at runtime. They require `useSdk: true` (default) and throw if called in CLI mode.

#### `setModel(model?): Promise<void>`

Change the model at runtime without recreating the session.

```typescript
const claude = new Claude({ model: 'sonnet' })
await claude.init()

// Switch to opus mid-session
await claude.setModel('opus')
await claude.query('Complex analysis task')

// Reset to default
await claude.setModel()
```

#### `setPermissionMode(mode): Promise<void>`

Change the permission mode at runtime.

```typescript
const claude = new Claude({ permissionMode: 'plan' })
await claude.init()

// Upgrade to auto mode
await claude.setPermissionMode('auto')
await claude.query('Apply all fixes')
```

#### `rewindFiles(userMessageId, options?): Promise<RewindFilesResult>`

Rollback files to the state they were in at a specific message. Requires `enableFileCheckpointing: true` in client options.

```typescript
const claude = new Claude({ enableFileCheckpointing: true })
await claude.init()

const result = await claude.query('Refactor auth module')

// Preview what would change
const preview = await claude.rewindFiles(result.messages[0].id, { dryRun: true })
console.log(`Would change ${preview.filesChanged?.length} files`)

// Actually rewind
const rewind = await claude.rewindFiles(result.messages[0].id)
console.log(`Reverted: +${rewind.insertions} -${rewind.deletions}`)
```

#### `stopTask(taskId): Promise<void>`

Stop a running subagent task by its ID. Use with `task_started` stream events.

```typescript
import { Claude, EVENT_TASK_STARTED } from '@scottwalker/claude-connector'

const claude = new Claude()
const result = await claude.stream('Run analysis with subagents')
  .on(EVENT_TASK_STARTED, async (event) => {
    console.log(`Task started: ${event.description}`)
    // Stop task if it runs too long
    setTimeout(() => claude.stopTask(event.taskId), 30_000)
  })
  .done()
```

#### `setMcpServers(servers): Promise<McpSetServersResult>`

Dynamically add or replace MCP servers on the running session.

```typescript
const claude = new Claude()
await claude.init()

const result = await claude.setMcpServers({
  database: { type: 'stdio', command: 'npx', args: ['db-mcp-server'] },
})
console.log(`Added: ${result.added}, Removed: ${result.removed}`)
```

#### `reconnectMcpServer(serverName): Promise<void>`

Reconnect a disconnected or failed MCP server.

```typescript
await claude.reconnectMcpServer('database')
```

#### `toggleMcpServer(serverName, enabled): Promise<void>`

Enable or disable an MCP server without removing it.

```typescript
// Disable temporarily
await claude.toggleMcpServer('database', false)

// Re-enable
await claude.toggleMcpServer('database', true)
```

#### `accountInfo(): Promise<AccountInfo>`

Get information about the logged-in account.

```typescript
const info = await claude.accountInfo()
console.log(`Email: ${info.email}`)
console.log(`Org: ${info.organization}`)
console.log(`Plan: ${info.subscriptionType}`)
```

#### `supportedModels(): Promise<ModelInfo[]>`

Get the list of available models.

```typescript
const models = await claude.supportedModels()
for (const m of models) {
  console.log(`${m.displayName} (${m.value}) — ${m.description}`)
}
```

#### `supportedCommands(): Promise<SlashCommand[]>`

Get available slash commands.

```typescript
const commands = await claude.supportedCommands()
```

#### `supportedAgents(): Promise<AgentInfo[]>`

Get available subagents.

```typescript
const agents = await claude.supportedAgents()
for (const a of agents) {
  console.log(`${a.name}: ${a.description}`)
}
```

#### `mcpServerStatus(): Promise<McpServerStatus[]>`

Get the connection status of all MCP servers.

```typescript
const statuses = await claude.mcpServerStatus()
for (const s of statuses) {
  console.log(`${s.name}: ${s.status}`)
  if (s.tools) console.log(`  Tools: ${s.tools.map(t => t.name).join(', ')}`)
}
```

#### `interrupt(): Promise<void>`

Interrupt the current query without killing the session. The session remains usable for subsequent queries.

```typescript
// Interrupt after 10 seconds
setTimeout(() => claude.interrupt(), 10_000)
const result = await claude.query('Very long analysis...')
```

---

## ClientOptions

Options set at client construction time. Act as defaults for all queries.

| Option                | Type                    | Description                                     |
|-----------------------|-------------------------|-------------------------------------------------|
| `useSdk`              | `boolean`               | Use Agent SDK (default: `true`) or CLI mode     |
| `executable`          | `string`                | Path to CLI binary (default: `DEFAULT_EXECUTABLE`) |
| `cwd`                 | `string`                | Working directory (default: `process.cwd()`)    |
| `model`               | `string`                | Model: `'opus'`, `'sonnet'`, `'haiku'`, or full ID |
| `effortLevel`         | `EffortLevel`           | `EFFORT_LOW` \| `EFFORT_MEDIUM` \| `EFFORT_HIGH` \| `EFFORT_MAX` |
| `fallbackModel`       | `string`                | Auto-fallback model on failure                  |
| `permissionMode`      | `PermissionMode`        | Tool approval behavior                          |
| `allowedTools`        | `string[]`              | Auto-approved tools (supports glob patterns)    |
| `disallowedTools`     | `string[]`              | Always-denied tools                             |
| `tools`               | `string[]`              | Restrict available built-in tools (`--tools`)   |
| `systemPrompt`        | `string`                | Replace entire system prompt                    |
| `appendSystemPrompt`  | `string`                | Append to default system prompt                 |
| `maxTurns`            | `number`                | Max agentic turns per query                     |
| `maxBudget`           | `number`                | Max spend in USD per query                      |
| `additionalDirs`      | `string[]`              | Extra working directories                       |
| `mcpConfig`           | `string \| string[]`    | Path(s) to MCP config files                     |
| `mcpServers`          | `Record<string, McpServerConfig \| McpSdkServerConfig>` | Inline MCP server definitions |
| `agents`              | `Record<string, AgentConfig>`     | Custom subagent definitions         |
| `agent`               | `string`                | Select preconfigured agent (`--agent`)          |
| `hooks`               | `HooksConfig`           | Lifecycle hooks (shell commands, CLI mode)       |
| `env`                 | `Record<string, string>` | Extra environment variables                    |
| `noSessionPersistence`| `boolean`               | Don't save sessions to disk                     |
| `name`                | `string`                | Display name for the session (`--name`)         |
| `schema`              | `object`                | JSON Schema for structured output               |
| `strictMcpConfig`     | `boolean`               | Ignore MCP servers not in `mcpConfig`           |

### SDK-only ClientOptions

These options only take effect when `useSdk: true` (the default). They are ignored in CLI mode.

| Option                          | Type                              | Description                                         |
|---------------------------------|-----------------------------------|-----------------------------------------------------|
| `canUseTool`                    | `CanUseTool`                      | Programmatic permission callback                    |
| `hookCallbacks`                 | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | JS hook callbacks (21 event types) |
| `thinking`                      | `ThinkingConfig`                  | Thinking/reasoning behavior control                 |
| `enableFileCheckpointing`       | `boolean`                         | Enable file rollback via `rewindFiles()`            |
| `onElicitation`                 | `OnElicitation`                   | MCP elicitation request handler                     |
| `settingSources`                | `SettingSource[]`                 | Which settings files to load (`'user'`, `'project'`, `'local'`) |
| `settings`                      | `string \| Record<string, unknown>` | Inline settings object or path to settings file   |
| `plugins`                       | `PluginConfig[]`                  | Load local plugins                                  |
| `spawnClaudeCodeProcess`        | `(options: SpawnOptions) => SpawnedProcess` | Custom spawn for VMs/containers            |
| `stderr`                        | `(data: string) => void`         | Stderr output callback                              |
| `allowDangerouslySkipPermissions` | `boolean`                       | Safety flag required for `bypassPermissions` mode   |
| `betas`                         | `string[]`                        | Beta features (e.g. `'context-1m-2025-08-07'`)      |
| `agentProgressSummaries`        | `boolean`                         | AI-generated subagent progress summaries            |
| `includePartialMessages`        | `boolean`                         | Streaming text deltas                               |
| `promptSuggestions`             | `boolean`                         | AI-predicted next prompts                           |
| `debug`                         | `boolean`                         | Enable debug logging                                |
| `debugFile`                     | `string`                          | Debug log file path (implies `debug: true`)         |

#### `canUseTool` (SDK mode only)

Programmatic permission callback. Called before each tool execution to allow or deny it.

```typescript
const claude = new Claude({
  canUseTool: async (toolName, input, { signal }) => {
    if (toolName === 'Bash' && String(input.command).includes('rm -rf'))
      return { behavior: 'deny', message: 'Dangerous command blocked' }
    return { behavior: 'allow' }
  },
})
```

#### `hookCallbacks` (SDK mode only)

JS hook callbacks that run in-process. Supports all 21 hook event types: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`, `Setup`, `TeammateIdle`, `TaskCompleted`, `Elicitation`, `ElicitationResult`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `InstructionsLoaded`.

```typescript
const claude = new Claude({
  hookCallbacks: {
    PreToolUse: [{
      matcher: 'Bash',
      hooks: [async (input) => ({ continue: true })],
    }],
    Stop: [{
      hooks: [async (input) => ({ continue: true })],
    }],
  },
})
```

#### `thinking` (SDK mode only)

Controls Claude's thinking/reasoning behavior.

```typescript
// Claude decides when and how much to think
new Claude({ thinking: { type: 'adaptive' } })

// Fixed token budget for thinking
new Claude({ thinking: { type: 'enabled', budgetTokens: 10_000 } })

// Disable extended thinking
new Claude({ thinking: { type: 'disabled' } })
```

#### `settingSources` (SDK mode only)

Controls which filesystem settings are loaded. **Important:** without `'project'`, CLAUDE.md files are NOT read.

```typescript
// Load project settings + CLAUDE.md
new Claude({ settingSources: ['user', 'project'] })

// Full isolation (default SDK behavior)
new Claude({ settingSources: [] })
```

#### `settings` (SDK mode only)

Additional settings loaded into the highest-priority "flag settings" layer.

```typescript
// Inline permissions
new Claude({
  settings: {
    permissions: { allow: ['Bash(npm test)', 'Read(*)'] },
    model: 'claude-sonnet-4-6',
  },
})

// Path to file
new Claude({ settings: '/path/to/settings.json' })
```

#### `plugins` (SDK mode only)

Load local plugins that provide custom commands, agents, skills, and hooks.

```typescript
new Claude({
  plugins: [
    { type: 'local', path: './my-plugin' },
    { type: 'local', path: '/absolute/path/to/plugin' },
  ],
})
```

#### `spawnClaudeCodeProcess` (SDK mode only)

Custom function to spawn the Claude Code process. Use for VMs, containers, or remote environments.

```typescript
new Claude({
  spawnClaudeCodeProcess: (options) => {
    // options: { command, args, cwd, env, signal }
    return myDockerProcess // Must satisfy SpawnedProcess interface
  },
})
```

#### `onElicitation` (SDK mode only)

Callback for handling MCP server elicitation requests (when a server asks for user input).

```typescript
new Claude({
  onElicitation: async (request, { signal }) => {
    console.log(`Server ${request.serverName}: ${request.message}`)
    return { action: 'accept', content: { answer: 'yes' } }
  },
})
```

---

## QueryOptions

Per-query overrides. Any field set here takes precedence over `ClientOptions`.

| Option                | Type                    | Description                                    | Mode    |
|-----------------------|-------------------------|------------------------------------------------|---------|
| `cwd`                 | `string`                | Override working directory                     | Both    |
| `model`               | `string`                | Override model                                 | CLI only |
| `effortLevel`         | `EffortLevel`           | Override effort level                          | CLI only |
| `permissionMode`      | `PermissionMode`        | Override permission mode                       | CLI only |
| `allowedTools`        | `string[]`              | Override allowed tools                         | CLI only |
| `disallowedTools`     | `string[]`              | Override disallowed tools                      | CLI only |
| `tools`               | `string[]`              | Override available built-in tools              | CLI only |
| `systemPrompt`        | `string`                | Override system prompt                         | Both *  |
| `appendSystemPrompt`  | `string`                | Override appended system prompt                | CLI only |
| `maxTurns`            | `number`                | Override max turns                             | CLI only |
| `maxBudget`           | `number`                | Override max budget                            | CLI only |
| `input`               | `string`                | Piped stdin data (like `echo data \| claude`)  | CLI only |
| `schema`              | `object`                | JSON Schema for structured output              | CLI only |
| `worktree`            | `boolean \| string`     | Run in isolated git worktree                   | CLI only |
| `additionalDirs`      | `string[]`              | Override additional directories                | CLI only |
| `env`                 | `Record<string, string>` | Override environment variables                | Both    |
| `agent`               | `string`                | Override agent for this query                  | CLI only |
| `signal`              | `AbortSignal`           | Per-query cancellation                         | CLI only |
| `thinking`            | `ThinkingConfig`        | Per-query thinking override                    | Not implemented |

> **SDK mode note:** In SDK mode, most per-query overrides are ignored because the SDK session is configured once at initialization. Options marked "CLI only" are passed as CLI flags in CLI mode but have no effect in SDK mode. Use `ClientOptions` to set these at session level.
>
> \* `systemPrompt` in SDK mode is prepended as text to the prompt (`[System instruction: ...]`), not as a true system prompt parameter.

### Per-query cancellation with AbortSignal

```typescript
const controller = new AbortController()

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30_000)

try {
  const result = await claude.query('Long analysis...', {
    signal: controller.signal,
  })
} catch (e) {
  if (e.name === 'AbortError') console.log('Query cancelled')
}
```

### Per-query thinking override (SDK mode only)

```typescript
// Use more thinking for complex queries
const result = await claude.query('Solve this math problem', {
  thinking: { type: 'enabled', budgetTokens: 50_000 },
})
```

---

## StreamHandle

Returned from `stream()` and `session.stream()`. Provides four ways to consume streaming output.

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.on(type, callback)` | `this` | Register typed callback. Chainable. |
| `.done()` | `Promise<StreamResultEvent>` | Consume stream, fire callbacks, return result. |
| `.text()` | `Promise<string>` | Collect all text chunks into a string. |
| `.pipe(writable)` | `Promise<StreamResultEvent>` | Pipe text to writable, return result. |
| `.toReadable()` | `Readable` | Get Node.js Readable (text mode). |
| `[Symbol.asyncIterator]` | `AsyncIterator<StreamEvent>` | Raw async iteration. |

### Event callbacks

| Event | Constant | Callback | Description |
|-------|----------|----------|-------------|
| `'text'` | `EVENT_TEXT` | `(text: string)` | Text chunk |
| `'tool_use'` | `EVENT_TOOL_USE` | `(event: StreamToolUseEvent)` | Tool invocation |
| `'result'` | `EVENT_RESULT` | `(event: StreamResultEvent)` | Final result |
| `'error'` | `EVENT_ERROR` | `(event: StreamErrorEvent)` | Error |
| `'system'` | `EVENT_SYSTEM` | `(event: StreamSystemEvent)` | System event |
| `'task_started'` | `EVENT_TASK_STARTED` | `(event: StreamTaskStartedEvent)` | Subagent started |
| `'task_progress'` | `EVENT_TASK_PROGRESS` | `(event: StreamTaskProgressEvent)` | Subagent progress |
| `'task_notification'` | `EVENT_TASK_NOTIFICATION` | `(event: StreamTaskNotificationEvent)` | Subagent completed/failed/stopped |

---

## ChatHandle

Returned from `chat()`. Bidirectional streaming over a persistent CLI process.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `sessionId` | `string \| null` | Session ID (after first result) |
| `turnCount` | `number` | Completed turns |
| `closed` | `boolean` | Whether chat is closed |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.send(prompt)` | `Promise<StreamResultEvent>` | Send prompt, await turn completion. |
| `.on(type, callback)` | `this` | Register callback (same events as StreamHandle). |
| `.pipe(dest)` | `dest` | Pipe text to writable (returns dest for chaining). |
| `.toReadable()` | `Readable` | Get Node.js Readable (text mode). |
| `.toDuplex()` | `Duplex` | Get Node.js Duplex (write prompts, read text). |
| `.end()` | `void` | Close gracefully (EOF to stdin). |
| `.abort()` | `void` | Kill process immediately (SIGTERM). |

---

## QueryResult

Returned from `query()`.

| Field        | Type               | Description                          |
|-------------|--------------------|-----------------------------------------|
| `text`       | `string`           | Text response from Claude               |
| `sessionId`  | `string`           | Session ID for resuming                 |
| `usage`      | `TokenUsage`       | `{ inputTokens, outputTokens }`        |
| `cost`       | `number \| null`   | Cost in USD                             |
| `durationMs` | `number`           | Wall-clock duration                     |
| `messages`   | `Message[]`        | Full conversation history               |
| `structured` | `unknown \| null`  | Structured output (when schema is used) |
| `raw`        | `object`           | Raw CLI JSON (for advanced use)         |

---

## StreamEvent

Discriminated union yielded by `stream()`. Check `event.type` to narrow.

| Type | Constant | Fields | When |
|------|----------|--------|------|
| `'text'` | `EVENT_TEXT` | `text: string` | Text chunk received |
| `'tool_use'` | `EVENT_TOOL_USE` | `toolName: string`, `toolInput: object` | Tool being invoked |
| `'result'` | `EVENT_RESULT` | `text`, `sessionId`, `usage`, `cost`, `durationMs`, `subtype?`, `isError?`, `stopReason?`, `numTurns?`, `structured?` | Query completed |
| `'error'` | `EVENT_ERROR` | `message: string`, `code?: string` | Error occurred |
| `'system'` | `EVENT_SYSTEM` | `subtype: string`, `data: object` | System/unknown event |
| `'task_started'` | `EVENT_TASK_STARTED` | `taskId`, `description`, `taskType?`, `prompt?` | Subagent started |
| `'task_progress'` | `EVENT_TASK_PROGRESS` | `taskId`, `description`, `usage`, `lastToolName?`, `summary?` | Subagent progress update |
| `'task_notification'` | `EVENT_TASK_NOTIFICATION` | `taskId`, `status`, `outputFile`, `summary`, `usage?` | Subagent completed/failed/stopped |
| `'rate_limit'` | `EVENT_RATE_LIMIT` | `status`, `resetsAt?`, `rateLimitType?`, `utilization?`, `data` | Rate limit warning or rejection (SDK mode) |

### Task event details

#### `StreamTaskStartedEvent`

Emitted when a subagent task begins.

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | `string` | Unique task ID for tracking and control |
| `toolUseId` | `string?` | Tool use ID that spawned this task |
| `description` | `string` | Description of the task |
| `taskType` | `string?` | Task type (e.g. agent type name) |
| `prompt` | `string?` | The prompt given to the subagent |

#### `StreamTaskProgressEvent`

Emitted periodically with subagent progress updates.

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | `string` | Task ID |
| `description` | `string` | Description of current progress |
| `usage` | `{ totalTokens, toolUses, durationMs }` | Resource usage so far |
| `lastToolName` | `string?` | Last tool used |
| `summary` | `string?` | AI-generated summary (if `agentProgressSummaries` enabled) |

#### `StreamTaskNotificationEvent`

Emitted when a subagent task finishes.

| Field | Type | Description |
|-------|------|-------------|
| `taskId` | `string` | Task ID |
| `status` | `'completed' \| 'failed' \| 'stopped'` | Task completion status |
| `outputFile` | `string` | Path to the task output file |
| `summary` | `string` | Summary of what the task accomplished |
| `usage` | `{ totalTokens, toolUses, durationMs }?` | Resource usage |

```typescript
import { Claude, EVENT_TASK_STARTED, EVENT_TASK_PROGRESS, EVENT_TASK_NOTIFICATION } from '@scottwalker/claude-connector'

const claude = new Claude({ agentProgressSummaries: true })

await claude.stream('Analyze all modules with subagents')
  .on(EVENT_TASK_STARTED, (e) => console.log(`[started] ${e.taskId}: ${e.description}`))
  .on(EVENT_TASK_PROGRESS, (e) => console.log(`[progress] ${e.taskId}: ${e.summary ?? e.description}`))
  .on(EVENT_TASK_NOTIFICATION, (e) => console.log(`[${e.status}] ${e.taskId}: ${e.summary}`))
  .done()
```

---

## Result Types (SDK mode only)

Types returned by runtime control methods.

### `AccountInfo`

| Field | Type | Description |
|-------|------|-------------|
| `email` | `string?` | Account email |
| `organization` | `string?` | Organization name |
| `subscriptionType` | `string?` | Subscription tier |
| `tokenSource` | `string?` | Token source |
| `apiKeySource` | `string?` | API key source |

### `ModelInfo`

| Field | Type | Description |
|-------|------|-------------|
| `value` | `string` | Model identifier |
| `displayName` | `string` | Human-readable name |
| `description` | `string` | Model description |
| `supportsEffort` | `boolean?` | Whether effort levels are supported |
| `supportedEffortLevels` | `EffortLevel[]?` | Available effort levels |
| `supportsAdaptiveThinking` | `boolean?` | Supports adaptive thinking mode |
| `supportsFastMode` | `boolean?` | Supports fast mode |
| `supportsAutoMode` | `boolean?` | Supports auto mode |

### `SlashCommand`

Generic object representing a slash command. Fields vary by command.

### `AgentInfo`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Agent name |
| `description` | `string` | What the agent does |
| `model` | `string?` | Model used by the agent |

### `McpServerStatus`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Server name |
| `status` | `'connected' \| 'failed' \| 'needs-auth' \| 'pending' \| 'disabled'` | Connection status |
| `serverInfo` | `{ name, version }?` | Server metadata |
| `error` | `string?` | Error message if failed |
| `config` | `object?` | Server configuration |
| `scope` | `string?` | Server scope |
| `tools` | `Array<{ name, description?, annotations? }>?` | Available tools |

### `McpSetServersResult`

| Field | Type | Description |
|-------|------|-------------|
| `added` | `string[]` | Newly added server names |
| `removed` | `string[]` | Removed server names |
| `errors` | `Record<string, string>` | Errors keyed by server name |

### `RewindFilesResult`

| Field | Type | Description |
|-------|------|-------------|
| `canRewind` | `boolean` | Whether rewind is possible |
| `error` | `string?` | Error message if rewind failed |
| `filesChanged` | `string[]?` | Files that were (or would be) changed |
| `insertions` | `number?` | Lines inserted |
| `deletions` | `number?` | Lines deleted |

---

## Session

Multi-turn conversation wrapper. Created via `claude.session()`.

### Properties

| Property     | Type             | Description                              |
|-------------|------------------|------------------------------------------|
| `sessionId`  | `string \| null` | Current session ID (null until first query) |
| `queryCount` | `number`         | Number of queries executed               |

### Methods

- `query(prompt, options?)` — Same as `claude.query()`, but continues the session
- `stream(prompt, options?)` — Returns `StreamHandle`, continues the session
- `abort()` — Cancel the running query

### SessionOptions

| Option     | Type      | Description                              |
|-----------|-----------|------------------------------------------|
| `resume`   | `string`  | Resume an existing session by ID         |
| `fork`     | `boolean` | Fork instead of continuing in-place      |
| `continue` | `boolean` | Continue the most recent session         |

---

## ScheduledJob

Recurring query job. Created via `claude.loop()`.

### Properties

| Property     | Type      | Description                |
|-------------|-----------|----------------------------|
| `intervalMs` | `number`  | Interval in milliseconds   |
| `prompt`     | `string`  | Query to execute           |
| `tickCount`  | `number`  | Number of executions       |
| `running`    | `boolean` | Is a query currently active |
| `stopped`    | `boolean` | Has the job been stopped   |

### Methods

- `stop()` — Stop the scheduled job

### Events

| Event | Constant | Callback | Description |
|-------|----------|----------|-------------|
| `'result'` | `SCHED_RESULT` | `(result: QueryResult)` | After each successful query |
| `'error'` | `SCHED_ERROR` | `(error: Error)` | On query failure |
| `'tick'` | `SCHED_TICK` | `(count: number)` | Before each execution |
| `'stop'` | `SCHED_STOP` | `()` | When stopped |

### Interval format

| Format   | Example        | Result             |
|----------|---------------|---------------------|
| Seconds  | `'30s'`       | Every 30 seconds    |
| Minutes  | `'5m'`        | Every 5 minutes     |
| Hours    | `'2h'`        | Every 2 hours       |
| Days     | `'1d'`        | Every 24 hours      |
| Raw ms   | `60000`       | Every 60 seconds    |

---

## Standalone Functions

### `createSdkMcpServer(options)` (SDK mode only)

Create an in-process MCP server for custom tools.

```typescript
import { createSdkMcpServer, sdkTool, Claude } from '@scottwalker/claude-connector'
import { z } from 'zod/v4'

const server = await createSdkMcpServer({
  name: 'my-tools',
  tools: [
    await sdkTool('getPrice', 'Get stock price', { ticker: z.string() },
      async ({ ticker }) => ({ content: [{ type: 'text', text: '142.50' }] })
    ),
  ],
})

const claude = new Claude({ mcpServers: { prices: server } })
```

### `sdkTool(name, description, inputSchema, handler, extras?)` (SDK mode only)

Define a custom MCP tool with a Zod schema for use with `createSdkMcpServer()`.

```typescript
import { sdkTool } from '@scottwalker/claude-connector'
import { z } from 'zod/v4'

const myTool = await sdkTool(
  'greet',
  'Say hello',
  { name: z.string() },
  async ({ name }) => ({ content: [{ type: 'text', text: `Hello ${name}!` }] }),
  { annotations: { readOnly: true } },
)
```

### `listSessions(options?)`

List saved sessions from disk.

```typescript
import { listSessions } from '@scottwalker/claude-connector'

const sessions = await listSessions({ limit: 10 })
for (const s of sessions) {
  console.log(`${s.sessionId}: ${s.summary} (${new Date(s.lastModified).toLocaleString()})`)
}
```

| Option | Type | Description |
|--------|------|-------------|
| `dir` | `string?` | Directory to search for sessions |
| `limit` | `number?` | Max number of sessions to return |
| `includeWorktrees` | `boolean?` | Include worktree sessions |

### `getSessionMessages(sessionId, options?)`

Get messages from an existing session.

```typescript
import { getSessionMessages } from '@scottwalker/claude-connector'

const messages = await getSessionMessages('session-abc-123', { limit: 50 })
for (const m of messages) {
  console.log(`[${m.type}] ${m.uuid}`)
}
```

| Option | Type | Description |
|--------|------|-------------|
| `dir` | `string?` | Directory to search for sessions |
| `limit` | `number?` | Max number of messages to return |
| `offset` | `number?` | Skip first N messages |

---

## Constants

All string literals are exported as constants. Use them instead of raw strings.

```typescript
import {
  // Event types
  EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR, EVENT_SYSTEM,
  // Task event types
  EVENT_TASK_STARTED, EVENT_TASK_PROGRESS, EVENT_TASK_NOTIFICATION,
  // Permission modes
  PERMISSION_DEFAULT, PERMISSION_ACCEPT_EDITS, PERMISSION_PLAN,
  PERMISSION_AUTO, PERMISSION_DONT_ASK, PERMISSION_BYPASS,
  // Effort levels
  EFFORT_LOW, EFFORT_MEDIUM, EFFORT_HIGH, EFFORT_MAX,
  // Scheduler events
  SCHED_RESULT, SCHED_ERROR, SCHED_TICK, SCHED_STOP,
  // Defaults
  DEFAULT_EXECUTABLE, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS,
} from '@scottwalker/claude-connector'
```

---

## Type Exports

All types are available for import:

```typescript
import type {
  // Client options
  ClientOptions, QueryOptions,
  PermissionMode, EffortLevel,
  McpServerConfig, McpSdkServerConfig,
  AgentConfig, HookEntry, HookMatcher, HooksConfig,

  // Permission types (SDK)
  CanUseTool, PermissionResult, PermissionUpdate,
  PermissionBehavior, PermissionRuleValue, PermissionUpdateDestination,

  // Thinking types (SDK)
  ThinkingConfig, ThinkingAdaptive, ThinkingEnabled, ThinkingDisabled,

  // Hook callback types (SDK)
  HookEvent, HookCallback, HookCallbackMatcher,
  HookInput, HookJSONOutput, SyncHookJSONOutput, AsyncHookJSONOutput,

  // Elicitation types (SDK)
  OnElicitation, ElicitationRequest,

  // Settings and plugins (SDK)
  SettingSource, PluginConfig,

  // Custom spawn (SDK)
  SpawnOptions, SpawnedProcess,

  // Result types
  QueryResult, StreamEvent,
  StreamTextEvent, StreamToolUseEvent, StreamResultEvent,
  StreamErrorEvent, StreamSystemEvent,

  // Task event types
  StreamTaskStartedEvent, StreamTaskProgressEvent, StreamTaskNotificationEvent,

  // Info types (SDK control methods)
  AccountInfo, ModelInfo, SlashCommand, AgentInfo,
  McpServerStatus, McpSetServersResult, RewindFilesResult,

  // Other
  TokenUsage, Message, ContentBlock,
  TextBlock, ToolUseBlock, ToolResultBlock,
  SessionOptions, SessionInfo,
} from '@scottwalker/claude-connector'
```

---

## Errors

All errors extend `ClaudeConnectorError`.

| Error                | When                                        | Extra fields          |
|----------------------|---------------------------------------------|-----------------------|
| `CliNotFoundError`   | CLI binary not found at specified path       | `executable`          |
| `CliExecutionError`  | CLI exited with non-zero code                | `exitCode`, `stderr`  |
| `CliTimeoutError`    | CLI exceeded timeout                         | `timeoutMs`           |
| `ParseError`         | CLI output couldn't be parsed                | `rawOutput`           |
| `ValidationError`    | Invalid options or prompt                    | `field`               |

```typescript
import { ClaudeConnectorError, CliNotFoundError } from '@scottwalker/claude-connector'

try {
  await claude.query('...')
} catch (e) {
  if (e instanceof CliNotFoundError) {
    console.error(`Install Claude Code or set executable path`)
  } else if (e instanceof ClaudeConnectorError) {
    console.error(`Claude connector error: ${e.message}`)
  }
}
```

---

## IExecutor

Low-level executor interface. Implement this to add new transport backends.

```typescript
interface IExecutor {
  execute(args: string[], options: ExecuteOptions): Promise<QueryResult>
  stream(args: string[], options: ExecuteOptions): AsyncIterable<StreamEvent>
  abort?(): void
}

interface ExecuteOptions {
  cwd: string
  env: Record<string, string>
  input?: string
  systemPrompt?: string
}
```

### Custom executor example

```typescript
import { Claude, type IExecutor } from '@scottwalker/claude-connector'

class MyExecutor implements IExecutor {
  async execute(args, options) { /* ... */ }
  async *stream(args, options) { /* ... */ }
}

const claude = new Claude({ model: 'opus' }, new MyExecutor())
```
