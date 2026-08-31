# Kraube Konnektor

<p align="center">
  <picture>
    <img src="etc/origin.png?v=2" alt="Kraube Konnektor" width="250" style="border-radius: 16px" />
  </picture>
</p>

Programmatic Node.js interface for [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) CLI.

Use Claude Code from your application code — no terminal required. Works with your existing Max/Team/Enterprise subscription.

**[Website](https://scott-walker.github.io/kraube-konnektor/)** | **[Examples](./docs/EXAMPLES.md)** | **[API Reference](./docs/API.md)** | **[Streaming](./docs/STREAMING.md)** | **[Architecture](./docs/ARCHITECTURE.md)**

---

## Why

Claude Code is a powerful AI coding agent, but it only runs in a terminal. **kraube-konnektor** turns it into a programmable API — so you can embed it into CI pipelines, build custom tools, orchestrate multi-agent workflows, or integrate it with any Node.js application.

**Key design decisions:**

- **CLI wrapper, not API client** — uses your local `claude` binary and subscription, not the Anthropic HTTP API
- **Two execution modes** — persistent SDK session (fast, default) or CLI process spawning (simple)
- **Executor abstraction** — swap CLI for SDK or HTTP backend without changing your code
- **Full parity** — 82 client options, 27 per-query options, 60 CLI flags, 33 hook events, 43 stream events, 26 live control methods
- **Typed handles** — `StreamHandle` (fluent `.on().done()` + `for-await`) and `ChatHandle` (multi-turn conversations)

## What's new in 0.7

Built on `@anthropic-ai/claude-agent-sdk` **0.3.x**. Highlights, with the details
in the docs:

| Capability | Where |
|---|---|
| Skills, sandbox, tool aliases, per-tool config | [Examples](./docs/EXAMPLES.md#skills) |
| 13 more control methods — context usage, usage report, plugin/skill reload, file reads, background tasks | [API](./docs/API.md#control-methods-sdk-mode-only) |
| Session management — fork, rename, tag, delete, read transcripts and subagents | [API](./docs/API.md#session-management) |
| 43 stream events, including thinking, refusals, retries, context pressure | [Streaming](./docs/STREAMING.md#stream-events-reference) |
| Richer results — terminal reasons, per-model usage, cache tokens, permission denials | [Examples](./docs/EXAMPLES.md#queryresult-fields) |
| 33 hook events, session-store mirroring, host dialogs, plan-mode instructions | [Examples](./docs/EXAMPLES.md#js-hook-callbacks) |

`thinking`, `betas`, `debug` and `includePartialMessages` are no longer SDK-only —
they have CLI flags now. The [option tables](./docs/API.md#clientoptions) mark
every option `both` / `SDK` / `CLI`.

## Requirements

- **Node.js** >= 18.0.0
- **Claude Code CLI** installed and authenticated
- **`@anthropic-ai/claude-agent-sdk`** ^0.3.251 — a dependency, installed for you

## Install

```bash
npm install @scottwalker/kraube-konnektor
```

## CLI Setup

Bootstrap Claude Code on a fresh server with a single command:

```bash
npx @scottwalker/kraube-konnektor setup
```

The setup wizard will:
1. Check Node.js version
2. Install Claude Code globally (if not installed)
3. Ask for a config directory (default: `~/.claude`) — use different paths for isolated instances
4. Ask for an HTTP proxy (optional) — for servers behind a proxy
5. Run `claude login` for authentication
6. Print a ready-to-use code example with your settings

Use `--proxy` to skip the interactive proxy prompt:

```bash
npx @scottwalker/kraube-konnektor setup --proxy "http://user:pass@host:port"
```

Each instance can have its own config directory and proxy — no global environment variables needed:

```typescript
const claude = new Claude({
  model: 'sonnet',
  env: {
    CLAUDE_CONFIG_DIR: '/opt/my-project/.claude',
    HTTPS_PROXY: 'http://user:pass@host:port',
  },
})
```

## Quick Start

```typescript
import { Claude, PERMISSION_ACCEPT_EDITS } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ permissionMode: PERMISSION_ACCEPT_EDITS })

// Simple query
const result = await claude.query('Find and fix bugs in auth.ts')
console.log(result.text)
console.log(result.sessionId)   // resume later
console.log(result.usage)       // { inputTokens, outputTokens }
```

## Features

### Custom CLI Path

Point to a specific Claude Code installation when multiple versions coexist:

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  executable: '/opt/claude-code/v2/bin/claude',
  cwd: '/path/to/project',
})
```

### Streaming

Real-time output as Claude works. `stream()` returns a `StreamHandle` — use the fluent `.on().done()` API or classic `for-await`:

```typescript
import {
  Claude,
  EVENT_TEXT, EVENT_TOOL_USE, EVENT_THINKING, EVENT_RESULT, EVENT_ERROR,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()

// Fluent API (.on / .done) — one overload per event, 43 in total
const result = await claude
  .stream('Rewrite the auth module')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))   // `text` gets the chunk itself
  .on(EVENT_TOOL_USE, (e) => console.log(`[Tool] ${e.toolName}`))
  .on(EVENT_THINKING, (e) => console.error(`[thinking] ${e.thinking.length} chars`))
  .on(EVENT_ERROR, (e) => console.error(e.message))
  .done()

console.log(`Done in ${result.durationMs}ms`)

// Classic for-await
const handle = claude.stream('Rewrite the auth module')

for await (const event of handle) {
  switch (event.type) {
    case EVENT_TEXT:
      process.stdout.write(event.text)
      break
    case EVENT_TOOL_USE:
      console.log(`[Tool] ${event.toolName}`)
      break
    case EVENT_RESULT:
      console.log(`\nDone in ${event.durationMs}ms`)
      break
    case EVENT_ERROR:
      console.error(event.message)
      break
  }
}
```

All 43 event variants are listed in [docs/STREAMING.md](./docs/STREAMING.md#stream-events-reference).

### Multi-turn Sessions

Maintain conversation context across queries:

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const session = claude.session()
await session.query('Analyze the architecture of this project')
await session.query('Now refactor the auth module based on your analysis')
// ^ Claude remembers the previous context

// Resume a session later (even across process restarts)
const s2 = claude.session({ resume: session.sessionId! })
await s2.query('Continue where we left off')

// Fork a session (branch without modifying the original)
const s3 = claude.session({ resume: session.sessionId!, fork: true })

// Manage the stored transcript — works in both modes
await session.rename('architecture audit')
await session.tag('q3-review')
const branch = await session.fork({ title: 'alternative plan' })
const history = await session.messages({ limit: 50 })
```

### Structured Output

Get typed JSON responses via JSON Schema:

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const result = await claude.query('Extract all API endpoints from the codebase', {
  schema: {
    type: 'object',
    properties: {
      endpoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            method: { type: 'string' },
            path: { type: 'string' },
            handler: { type: 'string' },
          },
        },
      },
    },
  },
})
console.log(result.structured)
// { endpoints: [{ method: 'GET', path: '/api/users', handler: 'getUsers' }, ...] }
```

### Parallel Execution

Run independent queries concurrently. In CLI mode each spawns its own process; in SDK mode they interleave on the one persistent session, so use `useSdk: false` when they must truly run side by side:

```typescript
import { Claude, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ useSdk: false })

const [bugs, tests, docs] = await claude.parallel([
  { prompt: 'Find bugs in src/', options: { cwd: './src' } },
  { prompt: 'Run the test suite', options: { allowedTools: ['Bash'] } },
  { prompt: 'Review documentation', options: { permissionMode: PERMISSION_PLAN } },
])
```

### Recurring Tasks

Node.js-level equivalent of the `/loop` CLI command:

```typescript
import { Claude, SCHED_RESULT, SCHED_ERROR } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const job = claude.loop('5m', 'Check CI pipeline status and report failures')

job.on(SCHED_RESULT, (result) => {
  console.log(`[${new Date().toISOString()}] ${result.text}`)
})

job.on(SCHED_ERROR, (err) => {
  console.error('Check failed:', err.message)
})

// Stop when no longer needed
job.stop()
```

Supported intervals: `'30s'`, `'5m'`, `'2h'`, `'1d'`, or raw milliseconds.

### MCP Servers

Connect Model Context Protocol servers:

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

// SDK mode (default) — inline definitions
const claude = new Claude({
  mcpServers: {
    playwright: {
      command: 'npx',
      args: ['@playwright/mcp@latest'],
    },
    database: {
      type: 'http',
      url: 'http://localhost:3001/mcp',
    },
  },
})

// CLI mode — config file path
const cliClaude = new Claude({
  useSdk: false,
  mcpConfig: './mcp.json',
})
```

### Custom Subagents

Define specialized agents:

```typescript
import { Claude, PERMISSION_ACCEPT_EDITS } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  agents: {
    reviewer: {
      description: 'Code review expert',
      model: 'haiku',
      tools: ['Read', 'Glob', 'Grep'],
      prompt: 'Review code for bugs, security issues, and style',
    },
    deployer: {
      description: 'Deployment automation agent',
      tools: ['Bash', 'Read'],
      permissionMode: PERMISSION_ACCEPT_EDITS,
    },
  },
})
```

### Git Worktree Isolation

Run operations in an isolated copy of the repository:

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const result = await claude.query('Refactor the entire auth module', {
  worktree: 'refactor-auth',  // or `true` for auto-generated name
})
```

### Piped Input

Pass data alongside the prompt (like `echo data | claude -p "prompt"`):

```typescript
import { readFileSync } from 'node:fs'
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const result = await claude.query('Analyze this error log and suggest fixes', {
  input: readFileSync('./error.log', 'utf-8'),
})
```

### Lifecycle Hooks

Attach hooks to tool execution:

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  hooks: {
    PostToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [{ command: 'prettier --write ${file_path}' }],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [{ command: './scripts/validate-command.sh', timeout: 5 }],
      },
    ],
  },
})
```

### Programmatic Permissions

Control tool approval with a callback instead of static permission modes:

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  canUseTool: async (toolName, input, { signal }) => {
    if (toolName === 'Bash' && String(input.command).includes('rm -rf'))
      return { behavior: 'deny', message: 'Dangerous command blocked' }
    return { behavior: 'allow' }
  },
})
```

### In-Process MCP Tools

Define custom tools that run in-process — no external MCP server required:

```typescript
import { Claude, createSdkMcpServer, sdkTool } from '@scottwalker/kraube-konnektor'
import { z } from 'zod/v4'

const server = await createSdkMcpServer({
  name: 'my-tools',
  tools: [
    await sdkTool('getUser', 'Get user by ID', { id: z.string() },
      async (args) => {
        const { id } = args as { id: string }   // schema is enforced at runtime
        return { content: [{ type: 'text', text: JSON.stringify({ id, role: 'admin' }) }] }
      }
    ),
  ],
})
const claude = new Claude({ mcpServers: { myTools: server } })
```

### JS Hook Callbacks

Subscribe to all 33 hook events with native JS callbacks (no shell commands):

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  hookCallbacks: {
    PreToolUse: [{
      matcher: 'Bash',
      hooks: [async (input) => {
        // Narrow on hook_event_name to get this event's typed payload
        if (input.hook_event_name !== 'PreToolUse') return { continue: true }
        const { command = '' } = input.tool_input as { command?: string }
        return command.includes('sudo')
          ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } }
          : { continue: true }
      }],
    }],
    FileChanged: [{
      hooks: [async () => ({ continue: true })],
    }],
  },
})
```

### Thinking Config

Control Claude's reasoning behavior — in both modes, and per query:

```typescript
import { Claude, EVENT_THINKING_TOKENS } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ thinking: { type: 'enabled', budgetTokens: 20_000 } })
// 'adaptive' — Claude decides | 'enabled' — always think | 'disabled' — no thinking

await claude.stream('Plan the migration')
  .on(EVENT_THINKING_TOKENS, (e) => process.stderr.write(`\rthinking… ${e.estimatedTokens}`))
  .done()
```

### Runtime Control

26 control methods drive the live SDK session — model, permissions, MCP, context,
usage, plugins, skills, files, tasks:

```typescript
import { Claude, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ model: 'sonnet' })
await claude.setModel('opus')                     // switch to a more capable model
await claude.setPermissionMode(PERMISSION_PLAN)   // tighten permissions mid-session
await claude.applyFlagSettings({ effortLevel: 'high' })

const context = await claude.getContextUsage()    // structured /context
const report = await claude.usage()               // structured /usage
console.log(context.percentage, report.session.totalCostUsd)
```

Full list in the [API reference](./docs/API.md#control-methods-sdk-mode-only). All
of them throw in CLI mode.

### Dynamic MCP

Add, reconnect, or toggle MCP servers at runtime:

```typescript
const claude = new Claude()
await claude.setMcpServers({ db: { command: 'npx', args: ['@db/mcp'] } })
await claude.reconnectMcpServer('db')          // restart after config change
await claude.toggleMcpServer('db', false)      // temporarily disable
await claude.setMcpPermissionModeOverride('db', 'auto')  // pin one server's mode
```

### File Checkpointing

Snapshot and restore files modified by Claude:

```typescript
import { Claude, EVENT_PARTIAL_MESSAGE } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ enableFileCheckpointing: true, includePartialMessages: true })

// rewindFiles() takes the uuid of the USER MESSAGE to restore to — capture it
// from the stream (`userMessageUuid`), not from result.sessionId
let checkpoint: string | undefined
await claude.stream('Refactor the auth module')
  .on(EVENT_PARTIAL_MESSAGE, (e) => { checkpoint ??= e.userMessageUuid })
  .done()

if (checkpoint) {
  const preview = await claude.rewindFiles(checkpoint, { dryRun: true })
  if (preview.canRewind) await claude.rewindFiles(checkpoint)
}
```

### Account & Model Info

Query your subscription info and available models:

```typescript
const claude = new Claude()
const account = await claude.accountInfo()    // { email, organization, subscriptionType, apiProvider }
const models = await claude.supportedModels() // ModelInfo[] — value, displayName, capabilities
const agents = await claude.supportedAgents() // AgentInfo[] — name, description, model
```

### Per-Query Abort

Cancel individual queries with standard `AbortSignal`:

```typescript
const controller = new AbortController()
setTimeout(() => controller.abort(), 30_000)     // 30s timeout

const result = await claude.query('Long analysis task', {
  signal: controller.signal,
})
```

### Subagent Control

Monitor and stop spawned subagent tasks:

```typescript
import {
  Claude, EVENT_TASK_STARTED, EVENT_TASK_PROGRESS, EVENT_TASK_NOTIFICATION,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({ agentProgressSummaries: true, perTaskStopAffordance: true })

await claude.stream('Run a full analysis')
  .on(EVENT_TASK_STARTED, (e) => console.log(`Subagent ${e.taskId}: ${e.description}`))
  .on(EVENT_TASK_PROGRESS, (e) => console.log(`Progress: ${e.summary ?? e.description}`))
  .on(EVENT_TASK_NOTIFICATION, (e) => console.log(`${e.status}: ${e.summary}`))
  .done()

// Stop one subagent, or push the running tool call to the background
await claude.stopTask('task-42')
await claude.backgroundTasks()
```

### Settings & Plugins

Provide CLAUDE.md instructions, settings overrides, and plugins programmatically:

```typescript
const claude = new Claude({
  settingSources: ['user', 'project'],
  settings: {
    permissions: { allow: ['Bash(npm test)', 'Read(*)'] },
  },
  plugins: [
    { type: 'local', path: './my-plugin' },
  ],
})
```

### Custom Process Spawn

Override how Claude Code processes are created — useful for VMs, containers, or remote execution:

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  spawnClaudeCodeProcess: (options) => {
    // options: { command, args, cwd, env, signal }
    // Run inside a Docker container instead of locally
    return spawn('docker', ['exec', 'my-sandbox', options.command, ...options.args], {
      env: options.env,
      cwd: options.cwd,
    })
  },
})
```

### Session Management

List, read, fork, rename, tag and delete stored sessions — in both modes:

```typescript
import {
  listSessions, getSessionMessages, listSubagents, forkSession, tagSession,
} from '@scottwalker/kraube-konnektor'

const sessions = await listSessions({ dir: process.cwd(), limit: 10 })
const id = sessions[0]!.sessionId

const messages = await getSessionMessages(id, { limit: 50 })  // full message history
const agentIds = await listSubagents(id)                      // subagent transcripts
const { sessionId } = await forkSession(id, { title: 'What-if' })
await tagSession(sessionId, 'experiment')
```

### Full Configuration

A tour of the main option groups — all 82 are tabulated, with their supported
mode, in the [API reference](./docs/API.md#clientoptions).

```typescript
import {
  Claude,
  EFFORT_HIGH, PERMISSION_ACCEPT_EDITS, PERMISSION_PLAN,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  // CLI binary
  executable: '/usr/local/bin/claude',
  cwd: '/path/to/project',

  // Model
  model: 'opus',                      // 'opus' | 'sonnet' | 'haiku' | full model ID
  effortLevel: EFFORT_HIGH,           // low | medium | high | xhigh | max
  fallbackModel: ['sonnet', 'haiku'], // tried in order
  thinking: { type: 'adaptive' },     // adaptive | enabled (+budgetTokens) | disabled

  // Permissions & isolation
  permissionMode: PERMISSION_ACCEPT_EDITS,  // default | manual | acceptEdits | plan | dontAsk | auto | bypassPermissions
  allowedTools: ['Read', 'Edit', 'Bash(npm run *)'],
  disallowedTools: ['WebFetch'],
  sandbox: { enabled: true, network: { allowedDomains: ['registry.npmjs.org'] } },  // SDK mode

  // Prompts
  systemPrompt: 'You are a senior TypeScript developer',
  appendSystemPrompt: 'Always write tests for new code',

  // Limits
  maxTurns: 10,                       // max agentic turns per query
  maxBudget: 5.0,                     // max USD per query — enforced
  taskBudgetTokens: 200_000,          // token allowance the model is told about

  // Tools, skills, agents, MCP
  skills: ['pdf'],                    // SDK mode — the only way to enable skills
  agents: { /* ... */ },
  mcpServers: { /* ... */ },          // inline; `mcpConfig` is the CLI-mode file form
  additionalDirs: ['../shared-lib', '../proto'],

  // Hooks: `hookCallbacks` are JS functions (SDK mode), `hooks` shell entries (CLI mode)
  hookCallbacks: { /* ... */ },

  // Settings — without 'project', CLAUDE.md is NOT read
  settingSources: ['user', 'project'],

  // Environment
  env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },

  // Session
  noSessionPersistence: true,         // for CI/automation
})

// Per-query overrides. CLI mode applies all of them; SDK mode bridges eight
// (model, permissionMode, thinking, effortLevel, fallbackModel, allowedTools,
// disallowedTools, additionalDirs) and restores them after the turn.
const result = await claude.query('Analyze this module', {
  model: 'haiku',                     // cheaper model for this query
  permissionMode: PERMISSION_PLAN,    // read-only
  effortLevel: 'high',                // bridged in both modes
  maxTurns: 3,                        // CLI mode only
})
```

## Error Handling

All errors extend `KraubeKonnektorError` for uniform catching:

```typescript
import {
  Claude,
  KraubeKonnektorError,
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  ParseError,
  ValidationError,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()

try {
  const result = await claude.query('Fix the bug')
} catch (err) {
  if (err instanceof CliNotFoundError) {
    // Claude Code CLI not installed or wrong path
    console.error(`CLI not found: ${err.executable}`)
  } else if (err instanceof CliExecutionError) {
    // Non-zero exit code
    console.error(`Exit ${err.exitCode}: ${err.stderr}`)
  } else if (err instanceof CliTimeoutError) {
    // Exceeded timeout
    console.error(`Timed out after ${err.timeoutMs}ms`)
  } else if (err instanceof ParseError) {
    // Unexpected CLI output
    console.error(`Parse failed: ${err.rawOutput.slice(0, 100)}`)
  } else if (err instanceof KraubeKonnektorError) {
    // Any other library error
    console.error(err.message)
  }
}
```

## Custom Executor

The `IExecutor` abstraction lets you swap the CLI backend for testing, mocking, or alternative transports:

```typescript
import {
  Claude, EVENT_TEXT, EVENT_RESULT,
  type IExecutor, type ExecuteOptions, type QueryResult, type StreamEvent,
} from '@scottwalker/kraube-konnektor'

class MockExecutor implements IExecutor {
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
  }

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
  }
}

// Use in tests or with future backends
const claude = new Claude({ model: 'opus' }, new MockExecutor())
// Only the 8 required QueryResult fields must be returned — the extended ones
// (terminalReason, modelUsage, permissionDenials, …) are optional.
```

## Architecture

```
┌──────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────────┐
│  Claude  │────>│ ArgsBuilder │────>│  IExecutor  │────>│ CLI Process   │
│ (facade) │     │             │     │ (abstract)  │     │ (claude -p)   │
└──────────┘     └─────────────┘     └─────────────┘     └───────────────┘
     │                                    ^
     v                                    |
  Session                          SdkExecutor (default, persistent session)
  Scheduler                        CliExecutor (useSdk: false, process-per-query)
```

- **Two modes** — SDK (persistent session, fast) or CLI (process-per-query, simple)
- **Executor pattern** — swap CLI for SDK/HTTP without touching consumer code
- **Immutable config** — client options frozen at construction; SDK mode applies its per-query overrides then restores them
- **One event union** — both executors map the same 43 `StreamEvent` variants, so consumers are mode-agnostic

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed design documentation.

## Examples

| Example | Description |
|---------|-------------|
| [`examples/interactive-chat`](./examples/interactive-chat) | Terminal chat — ask questions, get answers in real time |
| [`examples/integration-test`](./examples/integration-test) | Package integration test (mock executor) |

```bash
# Try the interactive chat:
cd examples/interactive-chat
npm install
npm start          # standard mode
npm run stream     # streaming mode (word by word)
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/ARCHITECTURE.md) | Design principles, SOLID breakdown, data flow diagrams |
| [API Reference](./docs/API.md) | Complete reference for all classes, methods, types, and options |
| [Streaming](./docs/STREAMING.md) | All 43 stream events, handle APIs, and integration patterns |
| [Examples](./docs/EXAMPLES.md) | Comprehensive cookbook covering every feature with code snippets |
| [Changelog](./CHANGELOG.md) | Version history |
| [Contributing](./CONTRIBUTING.md) | Development setup and guidelines |

## Development

```bash
git clone git@github.com:scott-walker/kraube-konnektor.git
cd kraube-konnektor
npm install

npm run build              # compile TypeScript
npm test                   # run unit tests
npm run test:integration   # build + run integration test
npm run typecheck           # type-check without emitting
```

## License

[MIT](./LICENSE)
