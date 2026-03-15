# Examples

Complete cookbook covering every feature of `@scottwalker/claude-connector`.

All examples use ESM imports:

```ts
import { Claude } from '@scottwalker/claude-connector'
```

---

## Table of Contents

- [Execution Modes](#execution-modes)
- [Basic Query](#basic-query)
- [Streaming](#streaming)
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
- [Advanced: Custom Executor](#advanced-custom-executor)

---

## Execution Modes

### SDK mode (default)

Persistent session via Claude Agent SDK. Fast after warm-up.

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

Real-time response as events arrive.

```ts
const claude = new Claude()

for await (const event of claude.stream('Refactor auth.ts')) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.text)
      break

    case 'tool_use':
      console.log(`\n[Tool: ${event.toolName}]`)
      console.log(event.toolInput)
      break

    case 'result':
      console.log(`\nDone in ${event.durationMs}ms`)
      console.log(`Tokens: ${event.usage.inputTokens} in, ${event.usage.outputTokens} out`)
      console.log(`Session: ${event.sessionId}`)
      break

    case 'error':
      console.error(`Error: ${event.message}`)
      break

    case 'system':
      console.log(`[System/${event.subtype}]`, event.data)
      break
  }
}
```

### Collect stream into a string

```ts
let fullText = ''

for await (const event of claude.stream('Summarize README.md')) {
  if (event.type === 'text') fullText += event.text
}

console.log(fullText)
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
const session = claude.session()

for await (const event of session.stream('Analyze the codebase')) {
  if (event.type === 'text') process.stdout.write(event.text)
}

// Session ID is captured from the stream result
console.log(session.sessionId)

// Subsequent queries continue the conversation
const r2 = await session.query('Now fix the bugs you found')
```

---

## Parallel Queries

Run multiple independent queries concurrently.

```ts
const claude = new Claude()

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
const job = claude.loop('5m', 'Check deploy status on staging')

job.on('result', (result) => {
  console.log(`[Tick ${job.tickCount}] ${result.text}`)
})

job.on('error', (err) => {
  console.error('Query failed:', err.message)
})

job.on('tick', (count) => {
  console.log(`Starting tick #${count}...`)
})

job.on('stop', () => {
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
const claude = new Claude({ effortLevel: 'low' })    // fast, shallow
const claude = new Claude({ effortLevel: 'medium' })  // balanced
const claude = new Claude({ effortLevel: 'high' })    // deep thinking
const claude = new Claude({ effortLevel: 'max' })     // maximum depth
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
// Prompt on first use (default behavior)
new Claude({ permissionMode: 'default' })

// Auto-accept file edits
new Claude({ permissionMode: 'acceptEdits' })

// Read-only — no modifications allowed
new Claude({ permissionMode: 'plan' })

// Automatic tool approval based on risk
new Claude({ permissionMode: 'auto' })

// Skip all permission checks (use only in sandboxed environments)
new Claude({ permissionMode: 'bypassPermissions' })

// Skip all checks, don't even ask
new Claude({ permissionMode: 'dontAsk' })
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
const claude = new Claude({
  tools: ['Read', 'Glob', 'Grep'],
})

// Disable all tools (pure chat, no file access)
const claude = new Claude({ tools: [] })

// All built-in tools (default)
const claude = new Claude({ tools: ['default'] })
```

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
      type: 'stdio',
      command: 'mcp-server-filesystem',
      args: ['--root', '/home/user/data'],
    },
    github: {
      type: 'http',
      url: 'http://localhost:3000/mcp',
      headers: { Authorization: 'Bearer token123' },
    },
    database: {
      type: 'sse',
      url: 'http://localhost:8080/sse',
      env: { DB_URL: 'postgres://localhost/mydb' },
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
const claude = new Claude({
  agents: {
    reviewer: {
      description: 'Reviews code for quality and security issues',
      prompt: 'You are a senior code reviewer. Focus on security, performance, and maintainability.',
      model: 'opus',
      tools: ['Read', 'Glob', 'Grep'],
      permissionMode: 'plan',
      maxTurns: 10,
    },
    fixer: {
      description: 'Fixes bugs and implements features',
      prompt: 'You fix bugs. Be minimal and precise.',
      model: 'sonnet',
      permissionMode: 'acceptEdits',
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

Cancel a running query.

```ts
const claude = new Claude()

// Start a long query
const promise = claude.query('Analyze the entire codebase')

// Abort after 10 seconds
setTimeout(() => claude.abort(), 10_000)

try {
  await promise
} catch (err) {
  console.log('Query was aborted')
}
```

### Abort within a session

```ts
const session = claude.session()
const promise = session.query('Long analysis...')

setTimeout(() => session.abort(), 5_000)
```

---

## SDK Lifecycle

### Init events

Track initialization progress in SDK mode.

```ts
const claude = new Claude({ model: 'sonnet' })

claude.on('init:stage', (stage, message) => {
  // stage: 'importing' → 'creating' → 'connecting' → 'ready'
  console.log(`[${stage}] ${message}`)
})

claude.on('init:ready', () => {
  console.log('SDK session is warm — queries will be fast')
})

claude.on('init:error', (error) => {
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

Any `ClientOptions` field that has a `QueryOptions` counterpart can be overridden per-query.

```ts
const claude = new Claude({
  model: 'sonnet',
  maxTurns: 10,
  maxBudget: 5.0,
  permissionMode: 'plan',
  effortLevel: 'medium',
  systemPrompt: 'You are a helpful assistant.',
  allowedTools: ['Read', 'Glob'],
  tools: ['Read', 'Glob', 'Grep', 'Bash'],
})

// Override everything for one query
const result = await claude.query('Fix the critical bug NOW', {
  model: 'opus',
  maxTurns: 50,
  maxBudget: 20.0,
  permissionMode: 'acceptEdits',
  effortLevel: 'max',
  systemPrompt: 'You are an emergency bug fixer. Act fast.',
  allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Bash'],
  tools: ['default'],
  cwd: '/home/user/production-hotfix',
  additionalDirs: ['/home/user/shared-config'],
  env: { HOTFIX: 'true' },
  agent: 'fixer',
  worktree: 'hotfix-branch',
})
```

---

## Error Handling

All library errors extend `ClaudeConnectorError`.

```ts
import {
  Claude,
  ClaudeConnectorError,
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  ParseError,
  ValidationError,
} from '@scottwalker/claude-connector'

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
  } else if (err instanceof ClaudeConnectorError) {
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
result.usage          // { inputTokens: number, outputTokens: number }
result.cost           // number | null — USD cost
result.durationMs     // number — wall-clock time
result.messages       // Message[] — full conversation history
result.structured     // unknown | null — parsed JSON when schema was used
result.raw            // Record<string, unknown> — raw CLI JSON response
```

### Accessing message history

```ts
for (const msg of result.messages) {
  console.log(`[${msg.role}]`)

  if (typeof msg.content === 'string') {
    console.log(msg.content)
  } else {
    for (const block of msg.content) {
      switch (block.type) {
        case 'text':
          console.log(block.text)
          break
        case 'tool_use':
          console.log(`Tool: ${block.name}(${JSON.stringify(block.input)})`)
          break
        case 'tool_result':
          console.log(`Result: ${block.content}`)
          break
      }
    }
  }
}
```

---

## Stream Events

Full reference for the discriminated union yielded by `stream()`.

| Type | Fields | Description |
|------|--------|-------------|
| `text` | `text` | Incremental text chunk |
| `tool_use` | `toolName`, `toolInput` | Tool invocation |
| `result` | `text`, `sessionId`, `usage`, `cost`, `durationMs` | Final result (always last) |
| `error` | `message`, `code?` | Error during execution |
| `system` | `subtype`, `data` | System/internal events |

---

## Advanced: Custom Executor

Inject a custom executor for testing or custom transport.

```ts
import { Claude, type IExecutor, type ExecuteOptions, type QueryResult, type StreamEvent } from '@scottwalker/claude-connector'

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
    yield { type: 'text', text: 'Mocked stream' }
    yield {
      type: 'result',
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
