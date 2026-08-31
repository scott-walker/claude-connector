# Examples

Complete cookbook covering every feature of `@scottwalker/kraube-konnektor`.

All examples use ESM imports:

```ts
import { Claude } from '@scottwalker/kraube-konnektor'
```

---

## Table of Contents

- [Execution Modes](#execution-modes)
- [Basic Query](#basic-query)
- [Streaming](#streaming)
- [StreamHandle API](#streamhandle-api)
- [Chat](#chat)
- [Sessions](#sessions)
- [Parallel Queries](#parallel-queries)
- [Scheduled Queries (Loop)](#scheduled-queries-loop)
- [Model Selection](#model-selection)
- [Effort Level](#effort-level)
- [System Prompt](#system-prompt)
- [Permission Modes](#permission-modes)
- [Tool Control](#tool-control)
- [Structured Output (JSON Schema)](#structured-output-json-schema)
- [Piped Input (stdin)](#piped-input-stdin)
- [Additional Directories](#additional-directories)
- [Git Worktree Isolation](#git-worktree-isolation)
- [MCP Servers](#mcp-servers)
- [Agents](#agents)
- [Hooks](#hooks)
- [Environment Variables](#environment-variables)
- [Session Persistence](#session-persistence)
- [Session Name](#session-name)
- [Abort](#abort)
- [SDK Lifecycle](#sdk-lifecycle)
- [Custom Executable](#custom-executable)
- [Per-Query Overrides](#per-query-overrides)
- [Error Handling](#error-handling)
- [QueryResult Fields](#queryresult-fields)
- [Stream Events](#stream-events)
- [Thinking Config](#thinking-config)
- [Programmatic Permissions (canUseTool)](#programmatic-permissions-canusetool)
- [In-Process MCP Tools](#in-process-mcp-tools)
- [JS Hook Callbacks](#js-hook-callbacks)
- [Runtime Model & Permission Switch](#runtime-model--permission-switch)
- [Dynamic MCP](#dynamic-mcp)
- [File Checkpointing](#file-checkpointing)
- [Account & Model Info](#account--model-info)
- [Per-Query Abort (signal)](#per-query-abort-signal)
- [Subagent Control](#subagent-control)
- [Settings & Plugins](#settings--plugins)
- [Custom Process Spawn](#custom-process-spawn)
- [Session Management](#session-management)
- [Stderr Monitoring](#stderr-monitoring)
- [Bypass Permissions](#bypass-permissions)
- [Skills](#skills)
- [Sandbox](#sandbox)
- [Tool Aliases & Tool Config](#tool-aliases--tool-config)
- [Task Budget](#task-budget)
- [Plan Mode Instructions](#plan-mode-instructions)
- [User Dialogs](#user-dialogs)
- [Model Refusals](#model-refusals)
- [Context Usage](#context-usage)
- [Usage & Rate Limits](#usage--rate-limits)
- [Session Store Mirroring](#session-store-mirroring)
- [Settings Resolution](#settings-resolution)
- [File Access Through the Session](#file-access-through-the-session)
- [Advanced: Custom Executor](#advanced-custom-executor)

---

## Execution Modes

### SDK mode (default)

Persistent session via Claude Agent SDK. Fast after warm-up. SDK mode is enabled by default (`useSdk: true`).

```ts
const claude = new Claude({ model: 'sonnet' })

// Optional: warm up explicitly
await claude.init()

const result = await claude.query('Find bugs in src/')
console.log(result.text)

// Cleanup when done
claude.close()
```

### CLI mode

Each query spawns a new `claude -p` process. No warm-up, but slower per-query.

```ts
const claude = new Claude({
  useSdk: false,
  model: 'sonnet',
})

const result = await claude.query('Find bugs in src/')
console.log(result.text)
```

### Choosing between them

| | SDK mode (default) | CLI mode (`useSdk: false`) |
|---|---|---|
| Process | one persistent session | one process per query |
| Latency | warm after `init()` | full start-up every query |
| Per-query overrides | `model`, `permissionMode`, `thinking`, `effortLevel`, `fallbackModel`, `allowedTools`, `disallowedTools`, `additionalDirs`, `signal` | every `QueryOptions` field |
| Extended `QueryResult` fields | populated | populated — the JSON path shares the stream's result mapping |
| `result.messages` | always `[]` | populated from the CLI's JSON |
| Exclusive to it | 26 control methods, `canUseTool`, `hookCallbacks`, `sandbox`, `skills`, `toolAliases`, `toolConfig`, `sessionStore`, `onUserDialog`, `spawnClaudeCodeProcess` | `mcpConfig`, `safeMode`, `bare`, `autocompact`, `replayUserMessages`, `brief`, `disableSlashCommands`, `worktree`, per-query isolation |
| Concurrency | one session — concurrent queries interleave on it | independent processes run in parallel |

Both modes produce the same 43 stream events, and the stored-session API
(`rename` / `tag` / `fork` / `messages` / …) works in both.

---

## Basic Query

```ts
const claude = new Claude()

const result = await claude.query('Explain what src/index.ts does')

console.log(result.text)        // Claude's response text
console.log(result.sessionId)   // "abc-123-..." — for resuming later
console.log(result.usage)       // { inputTokens: 1500, outputTokens: 800 }
console.log(result.cost)        // 0.012 or null
console.log(result.durationMs)  // 3200
console.log(result.messages)    // full message history
```

---

## Streaming

Real-time response as events arrive. The `stream()` method returns a `StreamHandle`.

```ts
import {
  Claude,
  StreamHandle,
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
  EVENT_ERROR,
  EVENT_SYSTEM,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()

const handle: StreamHandle = claude.stream('Refactor auth.ts')

for await (const event of handle) {
  switch (event.type) {
    case EVENT_TEXT:
      process.stdout.write(event.text)
      break

    case EVENT_TOOL_USE:
      console.log(`\n[Tool: ${event.toolName}]`)
      console.log(event.toolInput)
      break

    case EVENT_RESULT:
      console.log(`\nDone in ${event.durationMs}ms`)
      console.log(`Tokens: ${event.usage.inputTokens} in, ${event.usage.outputTokens} out`)
      console.log(`Session: ${event.sessionId}`)
      break

    case EVENT_ERROR:
      console.error(`Error: ${event.message}`)
      break

    case EVENT_SYSTEM:
      console.log(`[System/${event.subtype}]`, event.data)
      break
  }
}
```

### Collect stream into a string

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

const claude = new Claude()

let fullText = ''

for await (const event of claude.stream('Summarize README.md')) {
  if (event.type === EVENT_TEXT) fullText += event.text
}

console.log(fullText)
```

---

## StreamHandle API

`stream()` returns a `StreamHandle` with fluent callbacks, convenience methods, and Node.js stream support.

### Fluent callbacks with `.on()` and `.done()`

```ts
import {
  Claude,
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()

const result = await claude.stream('Refactor auth')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TOOL_USE, (event) => console.log(`[Tool: ${event.toolName}]`))
  .on(EVENT_RESULT, (event) => console.log(`\nCost: $${event.cost}`))
  .done()

console.log(`Session: ${result.sessionId}`)
```

### Collect all text with `.text()`

```ts
const text = await claude.stream('Summarize README.md').text()
console.log(text)
```

### Pipe to stdout with `.pipe()`

```ts
const result = await claude.stream('Explain the auth module').pipe(process.stdout)
console.log(`\nDone in ${result.durationMs}ms`)
```

### Convert to Node.js Readable with `.toReadable()`

```ts
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { createWriteStream } from 'node:fs'

await pipeline(
  claude.stream('Generate a report').toReadable(),
  createGzip(),
  createWriteStream('report.gz'),
)
```

---

## Chat

Bidirectional streaming for multi-turn conversation over a single persistent process.

```ts
import {
  Claude,
  ChatHandle,
  EVENT_TEXT,
  EVENT_RESULT,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()

const chat: ChatHandle = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_RESULT, (event) => console.log(`\n[Turn done in ${event.durationMs}ms]`))

// Each send() returns a promise that resolves when the turn completes
await chat.send('What files are in src?')
await chat.send('Refactor the largest one')

console.log(`Session: ${chat.sessionId}`)
console.log(`Turns: ${chat.turnCount}`)

// Graceful close
chat.end()
```

### Chat as a Node.js Duplex stream

```ts
const duplex = claude.chat().toDuplex()
process.stdin.pipe(duplex).pipe(process.stdout)   // write prompts, read text back
```

### Chat as a Readable stream

```ts
const chat = claude.chat()
chat.toReadable().pipe(process.stdout)

await chat.send('Explain the codebase')
await chat.send('Now summarize in bullet points')
chat.end()
```

---

## Sessions

Multi-turn conversations with persistent context.

### New session

```ts
const session = claude.session()

const r1 = await session.query('What files are in src/?')
console.log(r1.text)

const r2 = await session.query('Refactor the largest file')
// Claude remembers the previous context
console.log(r2.text)

console.log(session.sessionId)  // "abc-123-..." (captured after first query)
console.log(session.queryCount) // 2
```

### Resume an existing session

```ts
const session = claude.session({ resume: 'abc-123-def-456' })

const result = await session.query('Continue where we left off')
```

### Continue the most recent session

```ts
const session = claude.session({ continue: true })

const result = await session.query('What were we working on?')
```

### Fork a session

Create a new branch from an existing session.

```ts
const session = claude.session({
  resume: 'original-session-id',
  fork: true,
})

// New session ID, but starts with the context of the original
const result = await session.query('Try a different approach')
```

### Streaming within a session

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const session = claude.session()

for await (const event of session.stream('Analyze the codebase')) {
  if (event.type === EVENT_TEXT) process.stdout.write(event.text)
}

// Session ID is captured from the stream result
console.log(session.sessionId)

// Subsequent queries continue the conversation
const r2 = await session.query('Now fix the bugs you found')
```

---

## Parallel Queries

Run multiple independent queries concurrently.

> **Pick the mode deliberately.** `parallel()` fires the queries at once. In CLI
> mode each gets its own process, which is genuinely parallel. In SDK mode they
> all run against the one persistent session and interleave on a single message
> stream — use `useSdk: false`, or one `Claude` instance per branch, when the
> queries must actually run side by side.

```ts
const claude = new Claude({ useSdk: false })

const results = await claude.parallel([
  { prompt: 'Review src/auth.ts for security issues' },
  { prompt: 'Find dead code in src/utils/' },
  { prompt: 'Check for TypeScript strict mode violations', options: { model: 'haiku' } },
])

for (const result of results) {
  console.log(result.text)
  console.log('---')
}
```

---

## Scheduled Queries (Loop)

Recurring queries at fixed intervals — the programmatic equivalent of `/loop`.

```ts
import {
  Claude,
  SCHED_RESULT,
  SCHED_ERROR,
  SCHED_TICK,
  SCHED_STOP,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()

const job = claude.loop('5m', 'Check deploy status on staging')

job.on(SCHED_RESULT, (result) => {
  console.log(`[Tick ${job.tickCount}] ${result.text}`)
})

job.on(SCHED_ERROR, (err) => {
  console.error('Query failed:', err.message)
})

job.on(SCHED_TICK, (count) => {
  console.log(`Starting tick #${count}...`)
})

job.on(SCHED_STOP, () => {
  console.log('Job stopped')
})

// Stop after 1 hour
setTimeout(() => job.stop(), 3_600_000)
```

### Interval formats

```ts
claude.loop('30s', 'Check status')      // 30 seconds
claude.loop('5m', 'Run tests')          // 5 minutes
claude.loop('2h', 'Generate report')    // 2 hours
claude.loop('1d', 'Daily summary')      // 1 day
claude.loop(120_000, 'Custom interval') // raw milliseconds
```

### Loop with query options

```ts
const job = claude.loop('10m', 'Check for regressions', {
  model: 'haiku',
  maxTurns: 3,
  maxBudget: 0.5,
})
```

### Loop properties

```ts
console.log(job.intervalMs)  // interval in ms
console.log(job.prompt)      // the prompt string
console.log(job.tickCount)   // number of executions
console.log(job.running)     // true if a query is in progress
console.log(job.stopped)     // true after stop()
```

---

## Model Selection

```ts
// Aliases
const claude = new Claude({ model: 'opus' })
const claude = new Claude({ model: 'sonnet' })
const claude = new Claude({ model: 'haiku' })

// Full model ID
const claude = new Claude({ model: 'claude-sonnet-4-6' })
```

### Fallback model

Automatically fall back if the primary model is overloaded.

```ts
const claude = new Claude({
  model: 'opus',
  fallbackModel: 'sonnet',
})
```

---

## Effort Level

Controls thinking depth.

```ts
import {
  Claude,
  EFFORT_LOW,
  EFFORT_MEDIUM,
  EFFORT_HIGH,
  EFFORT_MAX,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({ effortLevel: EFFORT_LOW })    // fast, shallow
const claude = new Claude({ effortLevel: EFFORT_MEDIUM })  // balanced
const claude = new Claude({ effortLevel: EFFORT_HIGH })    // deep thinking
const claude = new Claude({ effortLevel: EFFORT_MAX })     // maximum depth
```

---

## System Prompt

### Override the entire system prompt

```ts
const claude = new Claude({
  systemPrompt: 'You are a senior Go developer. Always respond in Go idioms.',
})

const result = await claude.query('How do I handle errors?')
```

### Append to the default system prompt

```ts
const claude = new Claude({
  appendSystemPrompt: 'Always include test examples in your answers.',
})
```

### Per-query system prompt override

```ts
const claude = new Claude({
  systemPrompt: 'You are a TypeScript expert.',
})

// Override for a specific query
const result = await claude.query('Explain ownership', {
  systemPrompt: 'You are a Rust expert.',
})
```

---

## Permission Modes

```ts
import {
  Claude,
  PERMISSION_DEFAULT,
  PERMISSION_ACCEPT_EDITS,
  PERMISSION_PLAN,
  PERMISSION_AUTO,
  PERMISSION_BYPASS,
  PERMISSION_DONT_ASK,
} from '@scottwalker/kraube-konnektor'

// Prompt on first use (default behavior)
new Claude({ permissionMode: PERMISSION_DEFAULT })

// Auto-accept file edits
new Claude({ permissionMode: PERMISSION_ACCEPT_EDITS })

// Read-only — no modifications allowed
new Claude({ permissionMode: PERMISSION_PLAN })

// Automatic tool approval based on risk
new Claude({ permissionMode: PERMISSION_AUTO })

// Skip all permission checks (use only in sandboxed environments)
new Claude({ permissionMode: PERMISSION_BYPASS })

// Skip all checks, don't even ask
new Claude({ permissionMode: PERMISSION_DONT_ASK })
```

---

## Tool Control

### Auto-approve specific tools (`allowedTools`)

These tools run without prompting. Others still require approval.

```ts
const claude = new Claude({
  allowedTools: ['Read', 'Glob', 'Grep', 'Bash(npm run *)'],
})
```

### Block specific tools (`disallowedTools`)

These tools are always denied.

```ts
const claude = new Claude({
  disallowedTools: ['Bash(rm *)', 'Write'],
})
```

### Restrict the available tool set (`tools`)

Controls which tools **exist** — Claude cannot use tools outside this list.

```ts
// Only allow reading — Claude cannot edit files at all
const readOnly = new Claude({
  tools: ['Read', 'Glob', 'Grep'],
})

// Disable all tools (pure chat, no file access)
const noTools = new Claude({ tools: [] })

// Every built-in tool — the preset form (SDK mode; CLI mode has no spelling for it
// and simply omits the flag, which is the same thing: no restriction)
const everything = new Claude({ tools: { type: 'preset', preset: 'claude_code' } })
```

`['default']` is the legacy spelling of the preset. SDK mode still translates it,
but prefer the object form.

### `tools` vs `allowedTools` — the difference

```ts
const claude = new Claude({
  // Claude CAN use: Read, Glob, Grep, Bash, Edit
  // Claude CANNOT use: Write, NotebookEdit, etc. (they don't exist)
  tools: ['Read', 'Glob', 'Grep', 'Bash', 'Edit'],

  // Of the tools above, these run without prompting:
  allowedTools: ['Read', 'Glob', 'Grep'],

  // Bash and Edit still require user approval (they exist but aren't auto-approved)
})
```

---

## Structured Output (JSON Schema)

Force Claude to return validated JSON matching a schema.

```ts
const result = await claude.query('Extract all TODO comments from src/', {
  schema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            line: { type: 'number' },
            text: { type: 'string' },
          },
          required: ['file', 'line', 'text'],
        },
      },
    },
    required: ['todos'],
  },
})

// Typed structured output
const data = result.structured as { todos: Array<{ file: string; line: number; text: string }> }
for (const todo of data.todos) {
  console.log(`${todo.file}:${todo.line} — ${todo.text}`)
}
```

---

## Piped Input (stdin)

Provide additional context alongside the prompt — equivalent to `echo "data" | claude -p "prompt"`.

```ts
import { readFileSync } from 'node:fs'

const logContent = readFileSync('/var/log/app.log', 'utf-8')

const result = await claude.query('Find errors in these logs', {
  input: logContent,
})
```

### Analyze diff output

```ts
import { execSync } from 'node:child_process'

const diff = execSync('git diff HEAD~5').toString()

const result = await claude.query('Review these changes for bugs', {
  input: diff,
})
```

---

## Additional Directories

Grant Claude access to directories outside the main working directory.

```ts
const claude = new Claude({
  cwd: '/home/user/project',
  additionalDirs: ['/home/user/shared-lib', '/home/user/config'],
})
```

### Per-query additional directories

```ts
const result = await claude.query('Compare our auth with the shared lib', {
  additionalDirs: ['/home/user/other-project/src'],
})
```

---

## Git Worktree Isolation

Run queries in an isolated git worktree — changes don't affect your working tree.

```ts
// Auto-generated worktree name
const result = await claude.query('Experiment with a new API design', {
  worktree: true,
})

// Named worktree
const result = await claude.query('Build the auth feature', {
  worktree: 'feature-auth',
})
```

---

## MCP Servers

### From config files

```ts
const claude = new Claude({
  mcpConfig: './mcp-servers.json',
})

// Multiple config files
const claude = new Claude({
  mcpConfig: ['./mcp-local.json', './mcp-shared.json'],
})
```

### Inline server definitions

```ts
const claude = new Claude({
  mcpServers: {
    filesystem: {
      type: 'stdio',                       // `type` is optional — stdio is the default
      command: 'mcp-server-filesystem',
      args: ['--root', '/home/user/data'],
      env: { DB_URL: 'postgres://localhost/mydb' },   // stdio servers take env…
      timeout: 30_000,
    },
    github: {
      type: 'http',
      url: 'http://localhost:3000/mcp',
      headers: { Authorization: 'Bearer token123' },  // …remote ones take headers
    },
    database: {
      type: 'sse',
      url: 'http://localhost:8080/sse',
      headers: { Authorization: 'Bearer token456' },
    },
  },
})
```

### Mixed: config files + inline

```ts
const claude = new Claude({
  mcpConfig: './base-servers.json',
  mcpServers: {
    custom: { type: 'stdio', command: 'my-mcp-tool' },
  },
})
```

### Strict MCP config

Ignore all MCP servers except the ones explicitly provided.

```ts
const claude = new Claude({
  mcpConfig: './my-servers.json',
  strictMcpConfig: true,
})
```

---

## Agents

### Define and use custom agents

```ts
import {
  Claude,
  PERMISSION_PLAN,
  PERMISSION_ACCEPT_EDITS,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  agents: {
    reviewer: {
      description: 'Reviews code for quality and security issues',
      prompt: 'You are a senior code reviewer. Focus on security, performance, and maintainability.',
      model: 'opus',
      tools: ['Read', 'Glob', 'Grep'],
      permissionMode: PERMISSION_PLAN,
      maxTurns: 10,
    },
    fixer: {
      description: 'Fixes bugs and implements features',
      prompt: 'You fix bugs. Be minimal and precise.',
      model: 'sonnet',
      permissionMode: PERMISSION_ACCEPT_EDITS,
    },
    researcher: {
      description: 'Explores codebases and answers questions',
      prompt: 'You are a codebase explorer.',
      model: 'haiku',
      tools: ['Read', 'Glob', 'Grep'],
      isolation: 'worktree',
      background: true,
    },
  },
  agent: 'reviewer', // default agent for all queries
})

const result = await claude.query('Review the auth module')
```

### Switch agents per-query

```ts
// Uses the default 'reviewer' agent
const review = await claude.query('Review src/auth.ts')

// Switch to 'fixer' for this query
const fix = await claude.query('Fix the SQL injection in auth.ts', {
  agent: 'fixer',
})
```

---

## Hooks

Lifecycle hooks that execute shell commands at specific points.

```ts
const claude = new Claude({
  hooks: {
    // Before a tool is used
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          { command: 'echo "Bash tool invoked" >> /tmp/claude.log', timeout: 5 },
        ],
      },
    ],

    // After a tool is used
    PostToolUse: [
      {
        matcher: 'Edit',
        hooks: [
          { command: 'npm run lint --fix', timeout: 30 },
        ],
      },
    ],

    // When Claude finishes
    Stop: [
      {
        matcher: '.*',
        hooks: [
          { command: 'notify-send "Claude finished"' },
        ],
      },
    ],
  },
})
```

---

## Environment Variables

Pass extra env vars to the Claude process.

```ts
const claude = new Claude({
  env: {
    ANTHROPIC_API_KEY: 'sk-ant-...',
    GITHUB_TOKEN: 'ghp_...',
    NODE_ENV: 'test',
  },
})

// Per-query env override
const result = await claude.query('Deploy to staging', {
  env: { DEPLOY_TARGET: 'staging' },
})
```

---

## Session Persistence

Disable session persistence for ephemeral/CI workloads.

```ts
const claude = new Claude({
  noSessionPersistence: true,
})

// Sessions are not saved to disk and cannot be resumed
const result = await claude.query('Run CI checks')
```

---

## Session Name

Set a display name visible in `/resume` and the terminal title.

```ts
const claude = new Claude({
  name: 'deploy-review-march-2026',
})
```

---

## Abort

Two granularities, and they are not interchangeable.

### Per query — `signal` (preferred)

```ts
const controller = new AbortController()
setTimeout(() => controller.abort(), 10_000)

try {
  await claude.query('Analyze the entire codebase', { signal: controller.signal })
} catch (err) {
  // Both modes reject with the message 'Query aborted'
  console.log((err as Error).message)
}
```

In SDK mode this interrupts the turn and drains it to the result, so the session
survives and the next query runs normally. In CLI mode it sends SIGTERM to that
query's process.

`stream()` never throws on abort — the remaining events, including the aborted
`result`, are still yielded:

```ts
const signal = AbortSignal.timeout(10_000)

const result = await claude.stream('Long analysis…', { signal }).done()
console.log(result.terminalReason)   // 'aborted_streaming' | 'aborted_tools'
```

### Whole client — `abort()`

```ts
const promise = claude.query('Analyze the entire codebase')
setTimeout(() => claude.abort(), 10_000)
```

`claude.abort()` closes the SDK session entirely (the next query re-initializes)
or kills the active CLI process. `session.abort()` calls through to the same
executor, so it has the same reach — it is not scoped to that session.

---

## SDK Lifecycle

### Init events

Track initialization progress in SDK mode.

```ts
import {
  Claude,
  INIT_EVENT_STAGE,
  INIT_EVENT_READY,
  INIT_EVENT_ERROR,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({ model: 'sonnet' })

claude.on(INIT_EVENT_STAGE, (stage, message) => {
  // stage: 'importing' -> 'creating' -> 'connecting' -> 'ready'
  console.log(`[${stage}] ${message}`)
})

claude.on(INIT_EVENT_READY, () => {
  console.log('SDK session is warm — queries will be fast')
})

claude.on(INIT_EVENT_ERROR, (error) => {
  console.error('SDK init failed:', error.message)
})

// Explicit warm-up (optional — auto-inits on first query)
await claude.init()
```

### Check readiness

```ts
console.log(claude.ready) // true if SDK session is initialized (always true in CLI mode)
```

### Cleanup

```ts
// Free SDK session resources
claude.close()
```

---

## Custom Executable

Use a specific Claude Code binary.

```ts
import { Claude, DEFAULT_EXECUTABLE } from '@scottwalker/kraube-konnektor'

// Default executable is 'claude'
console.log(DEFAULT_EXECUTABLE) // 'claude'

const claude = new Claude({
  executable: '/usr/local/bin/claude-2.0',
})
```

### Working directory

```ts
const claude = new Claude({
  cwd: '/home/user/my-project',
})
```

---

## Per-Query Overrides

Any `ClientOptions` field with a `QueryOptions` counterpart can be overridden
per query — but **the two modes honour different subsets**, because the SDK
session is created once and its options are fixed at construction.

| | CLI mode (`useSdk: false`) | SDK mode (default) |
|---|---|---|
| How | argv is rebuilt for every query | eight overrides bridged over the control protocol |
| Applied | every `QueryOptions` field | `model`, `permissionMode`, `thinking`, plus `effortLevel`, `fallbackModel`, `allowedTools`, `disallowedTools`, `additionalDirs` through `applyFlagSettings()` — set before the turn, restored after |
| Special cases | — | `systemPrompt` is prepended to the prompt text; `signal` interrupts the turn |
| Ignored | `skills`, `background` (no CLI spelling for either) | everything else — set it on the client instead |

```ts
// Honoured in both modes
await claude.query('Deep analysis', {
  model: 'opus',
  permissionMode: PERMISSION_ACCEPT_EDITS,
  thinking: { type: 'enabled', budgetTokens: 30_000 },
})
```

```ts
import {
  Claude,
  PERMISSION_PLAN,
  PERMISSION_ACCEPT_EDITS,
  EFFORT_MEDIUM,
  EFFORT_MAX,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  model: 'sonnet',
  maxTurns: 10,
  maxBudget: 5.0,
  permissionMode: PERMISSION_PLAN,
  effortLevel: EFFORT_MEDIUM,
  systemPrompt: 'You are a helpful assistant.',
  allowedTools: ['Read', 'Glob'],
  tools: ['Read', 'Glob', 'Grep', 'Bash'],
})

// The full set — every field below is applied in CLI mode
const result = await claude.query('Fix the critical bug NOW', {
  model: 'opus',
  maxTurns: 50,
  maxBudget: 20.0,
  permissionMode: PERMISSION_ACCEPT_EDITS,
  effortLevel: EFFORT_MAX,
  systemPrompt: 'You are an emergency bug fixer. Act fast.',
  allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Bash'],
  tools: ['Read', 'Glob', 'Grep', 'Edit', 'Bash'],
  cwd: '/home/user/production-hotfix',
  additionalDirs: ['/home/user/shared-config'],
  env: { HOTFIX: 'true' },
  agent: 'fixer',
  worktree: 'hotfix-branch',
})
```

---

## Error Handling

All library errors extend `KraubeKonnektorError`.

```ts
import {
  Claude,
  KraubeKonnektorError,
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  ParseError,
  ValidationError,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({ useSdk: false })

try {
  await claude.query('Do something')
} catch (err) {
  if (err instanceof CliNotFoundError) {
    // Claude Code CLI not found
    console.error(`Install CLI: ${err.executable} not found`)
  } else if (err instanceof CliTimeoutError) {
    // Query took too long
    console.error(`Timeout after ${err.timeoutMs}ms`)
  } else if (err instanceof CliExecutionError) {
    // CLI exited with non-zero code
    console.error(`Exit code: ${err.exitCode}`)
    console.error(`Stderr: ${err.stderr}`)
  } else if (err instanceof ParseError) {
    // Unexpected CLI output format
    console.error(`Raw output: ${err.rawOutput.slice(0, 200)}`)
  } else if (err instanceof ValidationError) {
    // Invalid options
    console.error(`Invalid field: ${err.field}`)
  } else if (err instanceof KraubeKonnektorError) {
    // Catch-all for any library error
    console.error(err.message)
  }
}
```

### Validation errors fire immediately

```ts
// Throws ValidationError at construction
new Claude({ maxTurns: -1 })
new Claude({ maxBudget: 0 })
new Claude({ permissionMode: 'invalid' as any })
new Claude({ effortLevel: 'turbo' as any })

// Throws ValidationError at call time
await claude.query('')
await claude.query('   ')
await claude.query('Ok', { maxTurns: 0 })
```

---

## QueryResult Fields

Full reference for the object returned by `query()`.

```ts
const result = await claude.query('Explain the auth module')

result.text           // string — Claude's response
result.sessionId      // string — session ID for resuming
result.usage          // TokenUsage — input/output plus cache tokens, in both modes
result.cost           // number | null — USD cost
result.durationMs     // number — wall-clock time
result.messages       // Message[] — populated in CLI mode; always [] in SDK mode
result.structured     // unknown | null — parsed JSON when a schema was used
result.raw            // Record<string, unknown> — the raw result message
```

### Extended fields

Both modes fill in everything the result message carries: `parseJsonResult()`
runs the one-shot `--output-format json` payload through the same
`parseResultEvent()` mapping the stream uses, so `claude -p` and the SDK session
report the same 21-field shape. The raw payload stays in `raw` either way.

```ts
result.subtype            // 'success' | 'error_during_execution' | 'error_max_turns' | …
result.isError            // boolean
result.errors             // string[] — errors carried on the result
result.terminalReason     // why the turn stopped — see below
result.modelUsage         // per-model tokens, cost, context window
result.permissionDenials  // tool calls that were denied
result.deferredToolUse    // a tool call handed back to the caller
result.durationApiMs      // time spent in API calls
result.queuedTurnCount    // turns still queued behind this one
result.ttftMs             // time to first token
result.apiErrorStatus     // HTTP status of a failing API call
result.fastModeState      // 'off' | 'cooldown' | 'on'
result.origin             // what originated the turn (human, hook, coordinator, …)
```

### Terminal reasons

`terminalReason` says why the turn stopped — the difference between "finished"
and "ran out of budget" that `isError` alone cannot express. It is an open union,
so handle the ones you care about and fall through on the rest.

```ts
switch (result.terminalReason) {
  case 'completed':                 break
  case 'max_turns':                 console.warn('raise maxTurns'); break
  case 'budget_exhausted':          console.warn('raise maxBudget'); break
  case 'prompt_too_long':           console.error('compact or trim the prompt'); break
  case 'aborted_streaming':
  case 'aborted_tools':             console.log('cancelled by the caller'); break
  case 'stop_hook_prevented':
  case 'hook_stopped':              console.warn('a Stop hook blocked continuation'); break
  case 'tool_deferred':             console.log('run result.deferredToolUse yourself'); break
  case 'model_error':
  case 'api_error':                 console.error(`API ${result.apiErrorStatus}`); break
  default:                          console.log(result.terminalReason)
}
```

The full list is exported as `VALID_TERMINAL_REASONS`.

### Per-model usage and cache accounting

`usage` is the turn's total; `modelUsage` breaks it down per model — including
the cache-token counts that dominate cost on long sessions.

```ts
const { inputTokens, outputTokens, cacheReadInputTokens = 0, cacheCreationInputTokens = 0 } = result.usage
console.log(`in ${inputTokens} out ${outputTokens} cache ${cacheReadInputTokens}r/${cacheCreationInputTokens}w`)
console.log(result.usage.serviceTier)                 // 'standard' | 'priority' | 'batch'
console.log(result.usage.serverToolUse?.webSearchRequests)

for (const [model, usage] of Object.entries(result.modelUsage ?? {})) {
  console.log(
    `${model}: $${usage.costUsd.toFixed(4)}`,
    `(${usage.inputTokens}/${usage.outputTokens},`,
    `cache ${usage.cacheReadInputTokens}r/${usage.cacheCreationInputTokens}w,`,
    `window ${usage.contextWindow}, basis ${usage.costBasis ?? 'unknown'})`,
  )
}
```

### Permission denials

Everything denied during the turn is aggregated on the result, so a batch job can
report once instead of subscribing to `permission_denied` events.

```ts
for (const denial of result.permissionDenials ?? []) {
  console.warn(`denied ${denial.toolName} (${denial.toolUseId})`, denial.toolInput)
}
```

### Accessing message history

```ts
import {
  Claude,
  BLOCK_TEXT,
  BLOCK_TOOL_USE,
  BLOCK_TOOL_RESULT,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const result = await claude.query('Explain the auth module')

for (const msg of result.messages) {
  console.log(`[${msg.role}]`)

  if (typeof msg.content === 'string') {
    console.log(msg.content)
  } else {
    for (const block of msg.content) {
      switch (block.type) {
        case BLOCK_TEXT:
          console.log(block.text)
          break
        case BLOCK_TOOL_USE:
          console.log(`Tool: ${block.name}(${JSON.stringify(block.input)})`)
          break
        case BLOCK_TOOL_RESULT:
          console.log(`Result: ${block.content}`)
          break
      }
    }
  }
}
```

---

## Stream Events

`stream()` yields a discriminated union of **43 variants** — both executors
produce the same set. The complete table, with the option that gates each event,
lives in [STREAMING.md](./STREAMING.md#stream-events-reference).

| Group | Events |
|---|---|
| Conversation | `text`, `thinking`, `thinking_tokens`, `tool_use`, `tool_result`, `tool_progress`, `tool_use_summary`, `result`, `error` |
| Session lifecycle | `init`, `session_state_changed`, `status`, `compact_boundary`, `context_usage`, `conversation_reset`, `worker_shutting_down` |
| Subagents & background | `task_started`, `task_progress`, `task_notification`, `task_updated`, `background_tasks_changed` |
| Permissions & host UI | `permission_denied`, `notification`, `informational`, `prompt_suggestion`, `local_command_output` |
| Hooks | `hook_started`, `hook_progress`, `hook_response` |
| Reliability | `rate_limit`, `api_retry`, `model_refusal_fallback`, `model_refusal_no_fallback`, `mirror_error` |
| Environment | `auth_status`, `files_persisted`, `memory_recall`, `commands_changed`, `plugin_install`, `elicitation_complete`, `control_request_progress` |
| Escape hatches | `partial_message`, `system` |

```ts
import { Claude, EVENT_TEXT, EVENT_THINKING, EVENT_TOOL_RESULT } from '@scottwalker/kraube-konnektor'

const claude = new Claude()

for await (const event of claude.stream('Fix the failing test')) {
  switch (event.type) {
    case EVENT_TEXT:
      process.stdout.write(event.text)
      break
    case EVENT_THINKING:
      console.error(`[thinking] ${event.thinking.length} chars`)
      break
    case EVENT_TOOL_RESULT:
      console.error(`[${event.toolUseId}] ${event.isError ? 'error' : 'ok'}`)
      break
  }
}
```

Anything this version does not model arrives as `system` with its raw payload,
so a newer CLI never breaks a consumer.

---

## Thinking Config

Control Claude's extended thinking behavior. It is one of the eight overrides
SDK mode can apply per query: the executor switches the budget before the turn
and restores it afterwards. `{ type: 'disabled' }` sets the budget to `0`;
`null` is reserved for "clear the limit and let the model's default apply".

```ts
// Adaptive thinking (Claude decides when to think deeply)
const claude = new Claude({ thinking: { type: 'adaptive' } })

// Fixed budget, and hide the blocks from the stream
const quiet = new Claude({ thinking: { type: 'enabled', budgetTokens: 20_000, display: 'omitted' } })

// Off entirely
const off = new Claude({ thinking: { type: 'disabled' } })

// Per-query override — works in both modes
await claude.query('Complex analysis', {
  thinking: { type: 'enabled', budgetTokens: 10_000 },
})
```

Both modes support it: SDK mode passes `thinking` to the session, CLI mode emits
`--thinking <type>` plus `--max-thinking-tokens`.

### Reading thinking as it happens

`thinking` carries the blocks; `thinking_tokens` is a running estimate emitted
*between* them, which is what a progress indicator wants.

```ts
import { Claude, EVENT_THINKING, EVENT_THINKING_TOKENS, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

await claude.stream('Plan the migration')
  .on(EVENT_THINKING_TOKENS, (event) => {
    process.stderr.write(`\rthinking… ~${event.estimatedTokens} tokens (+${event.estimatedTokensDelta})`)
  })
  .on(EVENT_THINKING, (event) => {
    // `redacted: true` means the provider withheld the reasoning; `thinking` is opaque data
    console.error(event.redacted ? '\n[redacted]' : `\n[thinking] ${event.thinking}`)
  })
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .done()
```

Mid-session changes go through `setMaxThinkingTokens()`, which mirrors the SDK's
own deprecated control method:

```ts
await claude.setMaxThinkingTokens(50_000, 'summarized')
await claude.setMaxThinkingTokens(0)      // disable thinking
await claude.setMaxThinkingTokens(null)   // clear the cap — model default applies
```

---

## Programmatic Permissions (canUseTool)

Intercept tool calls at runtime and allow/deny them programmatically. SDK mode
only — in CLI mode the equivalent is `permissionPromptToolName`, an MCP tool
that answers prompts (it works in both modes).

```ts
const claude = new Claude({
  canUseTool: async (toolName, input, { signal, suggestions }) => {
    if (toolName === 'Bash' && String(input.command).includes('rm'))
      return { behavior: 'deny', message: 'Destructive commands blocked' }

    // 'ask' forces the interactive prompt; `updatedInput` rewrites the call
    return { behavior: 'allow', updatedPermissions: suggestions }
  },
})

// CLI-mode counterpart
const cli = new Claude({
  useSdk: false,
  mcpConfig: './mcp.json',
  permissionPromptToolName: 'mcp__approvals__prompt',
})
```

Denied calls also surface as `permission_denied` stream events and on
`result.permissionDenials`.

---

## In-Process MCP Tools

Define MCP tools directly in JavaScript — no external server process required.

```ts
import { createSdkMcpServer, sdkTool } from '@scottwalker/kraube-konnektor'
import { z } from 'zod/v4'

const server = await createSdkMcpServer({
  name: 'my-tools',
  tools: [
    await sdkTool('getPrice', 'Get stock price', { ticker: z.string() },
      // `args` is typed `unknown` — the schema is enforced at runtime
      async (args) => {
        const { ticker } = args as { ticker: string }
        return { content: [{ type: 'text', text: `${ticker}: 142.50` }] }
      }
    ),
  ],
})

const claude = new Claude({ mcpServers: { prices: server } })
```

---

## JS Hook Callbacks

Programmatic hooks that run JavaScript functions instead of shell commands.
All **33** hook events are supported (`VALID_HOOK_EVENTS`), including the ones
added in SDK 0.3.x: `PostToolBatch`, `UserPromptExpansion`, `StopFailure`,
`PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `PermissionDenied`,
`TaskCreated`, `CwdChanged`, `FileChanged`, `DirectoryAdded`, `MessageDisplay`.

```ts
const claude = new Claude({
  hookCallbacks: {
    PreToolUse: [{
      matcher: 'Bash',
      hooks: [async (input) => {
        // A callback receives the whole HookInput union — narrow to get the payload
        if (input.hook_event_name === 'PreToolUse') console.log('About to run:', input.tool_input)
        return { continue: true }
      }],
    }],
    SessionStart: [{
      hooks: [async (input) => {
        console.log('Session started:', input.session_id)   // on every hook input
        return {}
      }],
    }],
  },
})
```

Inputs are `snake_case` (straight off the wire), outputs are `camelCase` (the
protocol spells them that way). Narrow on `hook_event_name` to get the typed
payload — one callback can then serve several events:

```ts
import { Claude, HOOK_PRE_TOOL_USE, HOOK_FILE_CHANGED, HOOK_PERMISSION_DENIED } from '@scottwalker/kraube-konnektor'
import type { HookInput, HookJSONOutput } from '@scottwalker/kraube-konnektor'

async function audit(input: HookInput): Promise<HookJSONOutput> {
  switch (input.hook_event_name) {
    case 'PreToolUse': {
      const { command = '' } = input.tool_input as { command?: string }
      return command.includes('sudo')
        ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } }
        : { continue: true }
    }
    case 'FileChanged':
      console.log('changed:', input.file_path)
      return { continue: true }
    case 'PermissionDenied':
      console.warn('denied:', input.tool_name)
      return { continue: true }
    default:
      return { continue: true }
  }
}

const claude = new Claude({
  hookCallbacks: {
    [HOOK_PRE_TOOL_USE]: [{ matcher: 'Bash', hooks: [audit] }],
    [HOOK_FILE_CHANGED]: [{ hooks: [audit] }],
    [HOOK_PERMISSION_DENIED]: [{ hooks: [audit] }],
  },
})
```

Set `includeHookEvents: true` to also observe hooks from the *outside*, as
`hook_started` / `hook_progress` / `hook_response` stream events.

---

## Runtime Model & Permission Switch

Change model or permission mode on a live instance without recreating it.

```ts
const claude = new Claude({ model: 'sonnet' })

await claude.setModel('opus')
await claude.setPermissionMode('plan')
```

---

## Dynamic MCP

Add, reconnect, or toggle MCP servers at runtime.

```ts
const claude = new Claude()

// Replace all MCP servers
await claude.setMcpServers({ 'new-server': { command: 'node', args: ['srv.js'] } })

// Reconnect a specific server
await claude.reconnectMcpServer('github')

// Disable a server without removing it
await claude.toggleMcpServer('github', false)
```

---

## File Checkpointing

Track and revert file changes made during a session. SDK mode only.

`rewindFiles()` takes the uuid of the **user message** to restore to — not a
session id. Capture it from the stream (`partial_message` carries
`userMessageUuid`), or from your own record of the turn.

```ts
const claude = new Claude({ enableFileCheckpointing: true })

await claude.query('Refactor auth.ts')

// Preview what would be reverted
const preview = await claude.rewindFiles('msg-uuid-123', { dryRun: true })
// { canRewind: true, filesChanged: ['auth.ts'], insertions: 5, deletions: 2 }

// Actually revert the changes
if (preview.canRewind) {
  const done = await claude.rewindFiles('msg-uuid-123')
  // `skippedLinks` counts tracked files left alone because of a symlink,
  // hard link or unsafe parent — only reported on a real rewind
  console.log(done.filesChanged, done.skippedLinks ?? 0)
}
```

The transcript-side half is `resumeSessionAt`, which resumes only up to a given
message uuid — rewind the files, resume the transcript, and the session is back
where it was.

---

## Account & Model Info

Query account details, available models, agents, and MCP server status. All of
these are SDK-mode control methods.

```ts
const claude = new Claude()
await claude.init()

const account = await claude.accountInfo()
console.log(account.email, account.subscriptionType, account.apiProvider)

for (const model of await claude.supportedModels()) {
  console.log(model.value, model.displayName, model.supportedEffortLevels ?? [])
}

for (const agent of await claude.supportedAgents()) console.log(agent.name, agent.model)
for (const server of await claude.mcpServerStatus()) console.log(server.name, server.status)
for (const command of await claude.supportedCommands()) console.log(`/${command.name}`, command.argumentHint)
```

### What the session loaded at start-up

`initializationResult()` answers it from the value cached during warm-up — no
round trip. `reinitialize()` re-requests it (and redelivers pending
`canUseTool` / `onUserDialog` requests after a transport gap).

```ts
const init = await claude.initializationResult()
console.log(init.outputStyle, init.availableOutputStyles)
console.log(`${init.commands.length} commands, ${init.agents.length} agents`)
console.log(init.hooksApplied, init.fastModeState)

const refreshed = await claude.reinitialize()
```

### Reload plugins and skills from disk

```ts
const plugins = await claude.reloadPlugins()
console.log(`${plugins.plugins.length} plugins, ${plugins.errorCount} errors`)

const skills = await claude.reloadSkills()
console.log(skills.skills.map((skill) => skill.name))
```

---

## Per-Query Abort (signal)

Pass an `AbortSignal` to cancel a specific query without affecting the instance.

```ts
const controller = new AbortController()
setTimeout(() => controller.abort(), 30_000)

const result = await claude.query('Long task', { signal: controller.signal })
```

---

## Subagent Control

Five events track the subagent lifecycle. `task_updated` carries a **patch** to
apply over the task you are holding; `background_tasks_changed` carries the full
set (replace yours with it).

```ts
import {
  Claude,
  EVENT_TASK_STARTED, EVENT_TASK_PROGRESS, EVENT_TASK_NOTIFICATION,
  EVENT_TASK_UPDATED, EVENT_BACKGROUND_TASKS_CHANGED,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({ agentProgressSummaries: true, perTaskStopAffordance: true })

await claude.stream('Analyze and fix')
  .on(EVENT_TASK_STARTED, (event) => {
    console.log(`started ${event.taskId} (${event.subagentType ?? 'task'}): ${event.description}`)
    // Cancel a subagent that overruns
    setTimeout(() => void claude.stopTask(event.taskId), 120_000)
  })
  .on(EVENT_TASK_PROGRESS, (event) => {
    console.log(`  ${event.summary ?? event.description} — ${event.usage.totalTokens} tokens`)
  })
  .on(EVENT_TASK_UPDATED, (event) => console.log(`  patch ${event.taskId}:`, event.patch))
  .on(EVENT_TASK_NOTIFICATION, (event) => {
    if (event.status === 'completed') console.log(`done: ${event.summary}`)
    else console.error(`${event.status}: ${event.summary}`)
  })
  .on(EVENT_BACKGROUND_TASKS_CHANGED, (event) => {
    console.log('background:', event.tasks.map((task) => task.taskId))
  })
  .done()
```

`perTaskStopAffordance: true` declares that the host wires a per-task stop
control — without it a stop request interrupts the whole turn instead of one
task.

### Read a subagent's transcript afterwards

The live events say what happened; `subagents()` / `subagentMessages()` read it
back from the stored transcript.

```ts
const session = claude.session()
await session.query('Audit every module with subagents')

for (const agentId of await session.subagents()) {
  const transcript = await session.subagentMessages(agentId)
  console.log(agentId, transcript.length, 'messages')
}
```

---

## Settings & Plugins

Load settings from CLAUDE.md files and attach local plugins.

```ts
const claude = new Claude({
  settingSources: ['user', 'project'], // load CLAUDE.md!
  settings: { permissions: { allow: ['Bash(npm test)'] } },
  plugins: [{ type: 'local', path: './my-plugin' }],
})
```

---

## Custom Process Spawn

Override how the Claude CLI process is spawned — useful for VMs, containers, or remote execution.

```ts
const claude = new Claude({
  spawnClaudeCodeProcess: (opts) => {
    return docker.exec('claude-container', opts.command, opts.args)
  },
})
```

---

## Session Management

Stored transcripts can be listed, read, renamed, tagged, forked and deleted.
Two equivalent surfaces:

- **free functions** — for any session id, no client needed
- **`Session` methods** — for the session an instance is already holding, with
  the project directory defaulting to the client's `cwd`

Both work in **SDK and CLI mode**: they read and write the transcript rather
than talking to a running process.

### Free functions

```ts
import {
  listSessions, getSessionInfo, getSessionMessages,
  listSubagents, getSubagentMessages,
  forkSession, renameSession, tagSession, deleteSession,
} from '@scottwalker/kraube-konnektor'

// Newest first; `includeProgrammatic: false` hides headless runs, matching /resume
const sessions = await listSessions({ dir: process.cwd(), limit: 20, includeProgrammatic: false })

const target = sessions[0]
if (target) {
  const info = await getSessionInfo(target.sessionId, { dir: process.cwd() })
  console.log(info?.customTitle ?? info?.summary, info?.gitBranch, info?.tag)

  // `parent_tool_use_id` / `parent_agent_id` rebuild the subagent tree from the flat list
  const messages = await getSessionMessages(target.sessionId, { limit: 100, includeSystemMessages: true })
  console.log(messages.filter((message) => message.parent_agent_id === null).length, 'top-level')

  for (const agentId of await listSubagents(target.sessionId)) {
    console.log(agentId, (await getSubagentMessages(target.sessionId, agentId)).length)
  }

  await renameSession(target.sessionId, 'Auth refactor')
  await tagSession(target.sessionId, 'release-audit')
  await tagSession(target.sessionId, null)     // `null` clears — not "leave unchanged"

  const { sessionId } = await forkSession(target.sessionId, { title: 'What-if branch' })
  await deleteSession(sessionId)
}
```

Omitting `dir` searches every project directory — location-independent but
slower. Pass the session's `cwd` when you know it.

### Session methods

```ts
const claude = new Claude({ useSdk: false })
const session = claude.session()

await session.query('Audit src/')
await session.rename('src audit')
await session.tag('release-blockers')

const info = await session.info()
const messages = await session.messages({ limit: 50 })

// Branch without touching the original — the fork is usable immediately
const branch = await session.fork({ title: 'alternative plan' })
await branch.query('Try the other approach instead')

await session.delete()   // instance stays usable; the next query starts fresh
```

`session.fork()` copies the transcript into a new session **now**;
`claude.session({ resume, fork: true })` is the `--fork-session` flag, which
branches on the *next* turn. Forks start without undo history — file-history
snapshots are not copied.

Every stored-session method needs an id, so call them after the first query, or
create the session with `{ resume }` / `{ sessionId }`. Without one they throw a
`ValidationError`.

---

## Stderr Monitoring

Capture stderr output from the Claude process for logging or debugging.

```ts
const claude = new Claude({
  stderr: (data) => logger.warn('[claude]', data),
})
```

---

## Bypass Permissions

Skip all permission checks entirely. Requires an explicit safety flag.

```ts
const claude = new Claude({
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
})
```

---

## Skills

Skills are loaded by name (or all at once). This is the only supported way to
enable them — passing `'Skill'` in `allowedTools` is deprecated.

```ts
const claude = new Claude({ skills: ['pdf', 'docx'] })

// Everything the settings cascade discovers
const all = new Claude({ skills: 'all' })
```

SDK mode only. The CLI-side counterpart is the negative one:
`disableSlashCommands: true` turns off every slash command *and* every skill.

Skills are reported as `SlashCommand` entries — on the `init` event, and from
`reloadSkills()` after they change on disk:

```ts
import { Claude, EVENT_INIT } from '@scottwalker/kraube-konnektor'

await claude.stream('List what you can do')
  .on(EVENT_INIT, (event) => console.log('skills:', event.skills))
  .done()

const { skills } = await claude.reloadSkills()
for (const skill of skills) console.log(skill.name, '—', skill.description)
```

---

## Sandbox

Run tool calls under OS-level isolation: an egress allowlist, filesystem rules,
and credential masking so secrets never reach the model.

```ts
const claude = new Claude({
  sandbox: {
    enabled: true,
    failIfUnavailable: true,        // refuse to run unsandboxed
    autoAllowBashIfSandboxed: true, // Bash needs no prompt inside the sandbox

    network: {
      allowedDomains: ['registry.npmjs.org', 'api.github.com'],
      strictAllowlist: true,
      allowLocalBinding: true,
    },

    filesystem: {
      allowWrite: ['./build', './.cache'],
      denyRead: ['~/.ssh', '~/.aws'],
    },

    credentials: {
      // The token is masked in the model's view and injected only for these hosts
      envVars: [{ name: 'GITHUB_TOKEN', mode: 'mask', injectHosts: ['api.github.com'] }],
      files: [{ path: '~/.npmrc', mode: 'deny' }],
    },
  },
})
```

SDK mode only. `excludedCommands`, `ignoreViolations`, `bwrapPath` and the
`sigv4` / `awsPairs` credential helpers are available on the same object — see
`SandboxConfig` in `src/types/client.ts`.

---

## Tool Aliases & Tool Config

`toolAliases` redirects a built-in tool to an MCP tool — useful when the host
runs commands in its own container and wants Claude's `Bash` to land there. It is
single-hop: an alias target is never itself re-aliased.

```ts
const claude = new Claude({
  mcpServers: { workspace: { command: 'node', args: ['./workspace-mcp.js'] } },
  toolAliases: {
    Bash: 'mcp__workspace__bash',
    Read: 'mcp__workspace__read',
  },
})
```

`toolConfig` tunes behaviour the CLI otherwise hardcodes:

```ts
// Render AskUserQuestion previews as HTML fragments instead of Markdown
const web = new Claude({ toolConfig: { askUserQuestion: { previewFormat: 'html' } } })
```

Both are SDK mode only.

---

## Task Budget

`maxBudget` caps spend in USD and is enforced. `taskBudgetTokens` is different:
it is a token allowance the model is *told about*, so it can pace its tool use
and wrap up before hitting the limit.

```ts
const claude = new Claude({
  taskBudgetTokens: 200_000,   // "you have this much to work with"
  maxBudget: 5.0,              // hard stop at $5
})

// Per query, in both modes
await claude.query('Survey the repo, then summarize', { taskBudgetTokens: 50_000 })
```

Both must be positive integers (`maxBudget` a positive number) or the client
throws a `ValidationError` at construction.

When a budget ends the turn, `result.terminalReason` is `'budget_exhausted'` and
`result.subtype` is `'error_max_budget_usd'`.

---

## Plan Mode Instructions

`permissionMode: 'plan'` runs the built-in plan workflow. `planModeInstructions`
replaces its body, so a host can define what "planning" means for its domain.

```ts
import { Claude, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  permissionMode: PERMISSION_PLAN,
  planModeInstructions: [
    'Produce a numbered migration plan.',
    'Every step must name the files it touches and its rollback.',
    'Do not modify anything until the plan is approved.',
  ].join('\n'),
})

const plan = await claude.query('Move auth to the new session store')
```

Honoured in both modes at client level (`--plan-mode-instructions` in CLI
mode), and only while the permission mode is `'plan'`. A per-query value reaches
CLI mode only — the SDK has no mid-session control request for it.

---

## User Dialogs

Some CLI decisions need a human. `onUserDialog` lets the host render them; without
a handler the CLI fails closed and applies the dialog's default.

```ts
const claude = new Claude({
  supportedDialogKinds: ['refusal_fallback_prompt'],
  onUserDialog: async (request, { signal, requestId }) => {
    // `dialogKind` is an open union — cancel anything you do not recognise
    if (request.dialogKind !== 'refusal_fallback_prompt') return { behavior: 'cancelled' }

    const answer = await ui.ask(request.payload, { signal })
    return { behavior: 'completed', result: answer }
  },
})
```

Declaring a kind is what makes the CLI send it, so `supportedDialogKinds`
requires `onUserDialog` — the client throws a `ValidationError` otherwise.

Return `null` **only** when the answer was already sent out of band echoing
`requestId`; otherwise the dialog stays parked until the worker's deadline. The
same contract applies to `onElicitation`.

---

## Model Refusals

When a model refuses, the CLI either falls back to another model or gives up.
Both outcomes are events, not exceptions — and a fallback can **retract** content
you already streamed.

```ts
import {
  Claude, EVENT_MODEL_REFUSAL_FALLBACK, EVENT_MODEL_REFUSAL_NO_FALLBACK,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({ model: 'opus', fallbackModel: ['sonnet', 'haiku'] })
const transcript = new Map<string, string>()

await claude.stream('Summarize the incident report')
  .on(EVENT_MODEL_REFUSAL_FALLBACK, (event) => {
    console.warn(`${event.originalModel} → ${event.fallbackModel} (${event.direction})`)
    // Drop what the CLI withdrew, or you will show content it has retracted
    for (const uuid of event.retractedMessageUuids ?? []) transcript.delete(uuid)
  })
  .on(EVENT_MODEL_REFUSAL_NO_FALLBACK, (event) => {
    console.error(`refused (${event.refusalCategory ?? 'unknown'}): ${event.refusalExplanation ?? ''}`)
  })
  .done()
```

`direction` is `'retry'` (switching to the fallback), `'revert'` (switching back)
or `'sticky'` (staying on the fallback); `scope` says whether the switch is
`'session'`- or `'local'`-wide.

---

## Context Usage

`getContextUsage()` is the structured form of `/context` — what is filling the
window right now.

```ts
const usage = await claude.getContextUsage()

console.log(`${usage.percentage}% of ${usage.rawMaxTokens} on ${usage.model}`)
if (usage.overLimit) console.warn(`over by ${usage.overLimit.tokensOver} tokens`)

for (const category of usage.categories) {
  console.log(`${category.name.padEnd(24)} ${category.tokens}`, category.kind ?? '')
}

console.log('MCP tools:', usage.mcpTools?.length ?? 0)
console.log('memory files:', usage.memoryFiles?.length ?? 0)
console.log('auto-compact at:', usage.autoCompactThreshold, usage.isAutoCompactEnabled)
```

The same payload arrives on the stream as `context_usage` whenever an assistant
message carries it — see
[STREAMING.md](./STREAMING.md#context-pressure) for the watching pattern, and
`compact_boundary` for when compaction actually fires.

---

## Usage & Rate Limits

`usage()` is the structured form of `/usage`: session totals plus plan
utilization.

```ts
const report = await claude.usage()

console.log(report.session.totalCostUsd, report.subscriptionType)

if (report.rateLimitsAvailable) {
  const { fiveHour, sevenDay, sevenDayOpus } = report.rateLimits ?? {}
  console.log('5h  ', fiveHour?.utilization, 'resets', fiveHour?.resetsAt)
  console.log('7d  ', sevenDay?.utilization)
  console.log('opus', sevenDayOpus?.utilization)
}

console.log('requests today:', report.behaviors?.day.requestCount)
console.log('top skills:', report.behaviors?.week.skills.map((entry) => entry.name))
```

Marked experimental by the SDK — the wrapper keeps a stable name, but the payload
may still change. Live quota pressure also arrives as `rate_limit` events.

---

## Session Store Mirroring

`sessionStore` mirrors the transcript into your own storage. The subprocess still
writes locally; the adapter receives a copy **after** the local write succeeds —
which is why it cannot be combined with `noSessionPersistence`.

```ts
import { Claude, loadSessionStoreHelpers, type SessionStore } from '@scottwalker/kraube-konnektor'

const { foldSessionSummary } = await loadSessionStoreHelpers()

const store: SessionStore = {
  // `uuid` is the idempotency key — retries and imports replay batches
  async append(key, entries) {
    const previous = await db.readSummary(key)
    const summary = foldSessionSummary(previous, key, entries, { mtime: Date.now() })
    await db.write(key, entries, summary)
  },
  async load(key) {
    return (await db.read(key)) ?? null
  },
  async listSessions(projectKey) {
    return db.listSessions(projectKey)      // { sessionId, mtime } — mtime in epoch ms
  },
  async delete(key) {
    await db.delete(key)                    // omit entirely for WORM backends
  },
}

const claude = new Claude({ sessionStore: store, sessionStoreFlush: 'batched' })
```

`'batched'` (default) writes once per turn; `'eager'` writes per message, so
`append()` must stay cheap. A batch that fails all its retries is dropped and
surfaces as a `mirror_error` stream event — the run itself continues.

For tests, the SDK's in-memory store is one call away:

```ts
import { createInMemorySessionStore, importSessionToStore } from '@scottwalker/kraube-konnektor'

const store = await createInMemorySessionStore()
await importSessionToStore(existingSessionId, store, { dir: process.cwd() })
console.log(store.size)
store.clear()
```

The session-management functions accept the same store, so
`listSessions({ sessionStore: store })` and friends read from it instead of the
filesystem.

---

## Settings Resolution

Work out what settings a query *would* see, without spawning anything.

```ts
import { resolveSettings, loadSettingsHelpers } from '@scottwalker/kraube-konnektor'

const resolved = await resolveSettings({ cwd: process.cwd() })
console.log(resolved.provenance.model?.source)   // 'user' | 'project' | 'managed' | …

// resolveSettings() reports the RAW cascade, including escalating modes the CLI
// would refuse to honour from a repo-committed tier. Filter before acting.
const { filterEscalatingDefaultMode } = await loadSettingsHelpers()
const trusted = filterEscalatingDefaultMode(resolved)
console.log(trusted.permissions?.defaultMode)
```

The policy tier matches CLI start-up (managed settings, remote cache, MDM,
`managedSettings`) except that the admin-configured `policyHelper` subprocess is
not executed.

`applyFlagSettings()` is the live counterpart — it writes into the same
highest-priority flag layer, mid-session, without touching any file:

```ts
await claude.applyFlagSettings({ effortLevel: 'high' })
await claude.applyFlagSettings({ effortLevel: null })   // clear; next tier wins
```

---

## File Access Through the Session

Two control methods let a host cooperate with the session's file state instead of
working around it.

```ts
import { statSync } from 'node:fs'

// Read under the session's permission rules — returns null on denial or missing
const file = await claude.readFile('src/secret.ts', { maxBytes: 1_000_000 })
if (file) console.log(file.absPath, file.contents.length, file.truncated ?? false)

const image = await claude.readFile('docs/diagram.png', { encoding: 'base64' })

// Tell the session a file is already known, so Edit passes the read-before-edit
// guard for a file the host read itself
await claude.seedReadState('src/index.ts', statSync('src/index.ts').mtimeMs)
```

---

## Advanced: Custom Executor

Inject a custom executor for testing or custom transport.

```ts
import {
  Claude,
  EVENT_TEXT,
  EVENT_RESULT,
  type IExecutor,
  type ExecuteOptions,
  type QueryResult,
  type StreamEvent,
} from '@scottwalker/kraube-konnektor'

const mockExecutor: IExecutor = {
  async execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult> {
    return {
      text: 'Mocked response',
      sessionId: 'mock-session',
      usage: { inputTokens: 0, outputTokens: 0 },
      cost: null,
      durationMs: 0,
      messages: [],
      structured: null,
      raw: {},
    }
  },

  async *stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent> {
    yield { type: EVENT_TEXT, text: 'Mocked stream' }
    yield {
      type: EVENT_RESULT,
      text: 'Mocked stream',
      sessionId: 'mock-session',
      usage: { inputTokens: 0, outputTokens: 0 },
      cost: null,
      durationMs: 0,
    }
  },

  abort() {},
}

// Pass as second argument — bypasses SDK/CLI executor creation
const claude = new Claude({ model: 'sonnet' }, mockExecutor)
const result = await claude.query('Test')
console.log(result.text) // "Mocked response"
```

### Access the underlying executor

```ts
const claude = new Claude()
const executor = claude.getExecutor()
// executor is IExecutor (CliExecutor or SdkExecutor depending on useSdk)
```
