<p align="center">
  <img src="etc/logo-rounded.svg" alt="Claude Code — In Your Code" width="700" />
</p>

# claude-connector

Programmatic Node.js interface for [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) CLI.

Use Claude Code from your application code — no terminal required. Works with your existing Max/Team/Enterprise subscription.

**[Website](https://scott-walker.github.io/claude-connector/)** | **[API Reference](./docs/API.md)** | **[Architecture](./docs/ARCHITECTURE.md)**

---

## Why

Claude Code is a powerful AI coding agent, but it only runs in a terminal. **claude-connector** turns it into a programmable API — so you can embed it into CI pipelines, build custom tools, orchestrate multi-agent workflows, or integrate it with any Node.js application.

**Key design decisions:**

- **CLI wrapper, not API client** — uses your local `claude` binary and subscription, not the Anthropic HTTP API
- **Zero runtime dependencies** — only Node.js built-ins (`child_process`, `events`)
- **Executor abstraction** — swap CLI for SDK or HTTP backend without changing your code
- **Full CLI parity** — exposes all 45+ Claude Code flags through typed options

## Requirements

- **Node.js** >= 18.0.0
- **Claude Code CLI** installed and authenticated (`claude auth login`)

## Install

```bash
npm install claude-connector
```

## Quick Start

```typescript
import { Claude } from 'claude-connector'

const claude = new Claude()

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
const claude = new Claude({
  executable: '/opt/claude-code/v2/bin/claude',
  cwd: '/path/to/project',
})
```

### Streaming

Real-time output as Claude works:

```typescript
for await (const event of claude.stream('Rewrite the auth module')) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.text)
      break
    case 'tool_use':
      console.log(`[Tool] ${event.toolName}`)
      break
    case 'result':
      console.log(`\nDone in ${event.durationMs}ms`)
      break
    case 'error':
      console.error(event.message)
      break
  }
}
```

### Multi-turn Sessions

Maintain conversation context across queries:

```typescript
const session = claude.session()
await session.query('Analyze the architecture of this project')
await session.query('Now refactor the auth module based on your analysis')
// ^ Claude remembers the previous context

// Resume a session later (even across process restarts)
const s2 = claude.session({ resume: session.sessionId! })
await s2.query('Continue where we left off')

// Fork a session (branch without modifying the original)
const s3 = claude.session({ resume: session.sessionId!, fork: true })
```

### Structured Output

Get typed JSON responses via JSON Schema:

```typescript
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

Run independent queries concurrently (each spawns a separate CLI process):

```typescript
const [bugs, tests, docs] = await claude.parallel([
  { prompt: 'Find bugs in src/', options: { cwd: './src' } },
  { prompt: 'Run the test suite', options: { allowedTools: ['Bash'] } },
  { prompt: 'Review documentation', options: { permissionMode: 'plan' } },
])
```

### Recurring Tasks

Node.js-level equivalent of the `/loop` CLI command:

```typescript
const job = claude.loop('5m', 'Check CI pipeline status and report failures')

job.on('result', (result) => {
  console.log(`[${new Date().toISOString()}] ${result.text}`)
})

job.on('error', (err) => {
  console.error('Check failed:', err.message)
})

// Stop when no longer needed
job.stop()
```

Supported intervals: `'30s'`, `'5m'`, `'2h'`, `'1d'`, or raw milliseconds.

### MCP Servers

Connect Model Context Protocol servers:

```typescript
const claude = new Claude({
  // From config file
  mcpConfig: './mcp.json',

  // Or inline definitions
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
```

### Custom Subagents

Define specialized agents:

```typescript
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
      permissionMode: 'acceptEdits',
    },
  },
})
```

### Git Worktree Isolation

Run operations in an isolated copy of the repository:

```typescript
const result = await claude.query('Refactor the entire auth module', {
  worktree: 'refactor-auth',  // or `true` for auto-generated name
})
```

### Piped Input

Pass data alongside the prompt (like `echo data | claude -p "prompt"`):

```typescript
import { readFileSync } from 'node:fs'

const result = await claude.query('Analyze this error log and suggest fixes', {
  input: readFileSync('./error.log', 'utf-8'),
})
```

### Lifecycle Hooks

Attach hooks to tool execution:

```typescript
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

### Full Configuration

All Claude Code CLI capabilities in one place:

```typescript
const claude = new Claude({
  // CLI binary
  executable: '/usr/local/bin/claude',
  cwd: '/path/to/project',

  // Model
  model: 'opus',                      // 'opus' | 'sonnet' | 'haiku' | full model ID
  effortLevel: 'high',                // 'low' | 'medium' | 'high'
  fallbackModel: 'sonnet',            // auto-fallback on failure

  // Permissions
  permissionMode: 'acceptEdits',      // 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  allowedTools: ['Read', 'Edit', 'Bash(npm run *)'],
  disallowedTools: ['WebFetch'],

  // Prompts
  systemPrompt: 'You are a senior TypeScript developer',
  appendSystemPrompt: 'Always write tests for new code',

  // Limits
  maxTurns: 10,                       // max agentic turns per query
  maxBudget: 5.0,                     // max USD per query

  // Directories
  additionalDirs: ['../shared-lib', '../proto'],

  // MCP
  mcpConfig: './mcp.json',
  mcpServers: { /* ... */ },

  // Agents
  agents: { /* ... */ },

  // Hooks
  hooks: { /* ... */ },

  // Environment
  env: {
    MAX_THINKING_TOKENS: '50000',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
  },

  // Session
  noSessionPersistence: true,         // for CI/automation
})

// Override any option per query
const result = await claude.query('Analyze this module', {
  model: 'haiku',                     // cheaper model for this query
  permissionMode: 'plan',             // read-only
  maxTurns: 3,
})
```

## Error Handling

All errors extend `ClaudeConnectorError` for uniform catching:

```typescript
import {
  Claude,
  ClaudeConnectorError,
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  ParseError,
  ValidationError,
} from 'claude-connector'

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
  } else if (err instanceof ClaudeConnectorError) {
    // Any other library error
    console.error(err.message)
  }
}
```

## Custom Executor

The `IExecutor` abstraction lets you swap the CLI backend for testing, mocking, or future SDK integration:

```typescript
import { Claude, type IExecutor, type ExecuteOptions, type QueryResult, type StreamEvent } from 'claude-connector'

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
    yield { type: 'text', text: 'Mocked stream' }
    yield {
      type: 'result',
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
```

## Architecture

```
┌─────────┐     ┌─────────────┐     ┌────────────┐     ┌──────────────┐
│  Claude  │────>│ ArgsBuilder │────>│  IExecutor  │────>│ CLI Process   │
│ (facade) │     │             │     │ (abstract)  │     │ (claude -p)   │
└─────────┘     └─────────────┘     └────────────┘     └──────────────┘
     │                                    ^
     v                                    |
  Session                          CliExecutor (default)
  Scheduler                        SdkExecutor (future)
```

- **Zero dependencies** — only `child_process` and `events` from Node.js
- **Executor pattern** — swap CLI for SDK/HTTP without touching consumer code
- **Stateless queries** — each `query()` spawns an independent process
- **Immutable config** — client options frozen at construction, per-query overrides are non-destructive

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
| [Changelog](./CHANGELOG.md) | Version history |
| [Contributing](./CONTRIBUTING.md) | Development setup and guidelines |

## Development

```bash
git clone git@github.com:scott-walker/claude-connector.git
cd claude-connector
npm install

npm run build              # compile TypeScript
npm test                   # run 82 unit tests
npm run test:integration   # build + run integration test
npm run typecheck           # type-check without emitting
```

## License

[MIT](./LICENSE)
