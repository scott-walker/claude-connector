# Getting Started

## Requirements

- **Node.js** >= 18.0.0
- **Claude Code CLI** installed and authenticated (`claude auth login`)

## Install

```bash
npm install @scottwalker/claude-connector
```

All examples use ESM imports:

```ts
import { Claude } from '@scottwalker/claude-connector'
```

## Quick Start

### Simple Query

```ts
import { Claude, PERMISSION_ACCEPT_EDITS } from '@scottwalker/claude-connector'

const claude = new Claude({ permissionMode: PERMISSION_ACCEPT_EDITS })

const result = await claude.query('Find and fix bugs in auth.ts')
console.log(result.text)
console.log(result.sessionId)   // resume later
console.log(result.usage)       // { inputTokens, outputTokens }
```

### Streaming

Real-time output as Claude works:

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const claude = new Claude()
const text = await claude.stream('Summarize README.md').text()
console.log(text)
```

### Multi-turn Chat

Bidirectional streaming for interactive conversations:

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const claude = new Claude()

const chat = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))

await chat.send('What files are in src?')
await chat.send('Refactor the largest one')

chat.end()
```

## Execution Modes

Claude Connector supports two execution modes.

### SDK Mode (Default)

Persistent session via Claude Agent SDK. Fast after warm-up. Enabled by default (`useSdk: true`).

```ts
const claude = new Claude({ model: 'sonnet' })

// Optional: warm up explicitly
await claude.init()

const result = await claude.query('Find bugs in src/')
console.log(result.text)

// Cleanup when done
claude.close()
```

::: tip
SDK mode keeps a session alive between queries, so subsequent calls are significantly faster than cold-starting a CLI process each time.
:::

### CLI Mode

Each query spawns a new `claude -p` process. No warm-up needed, but slower per-query.

```ts
const claude = new Claude({
  useSdk: false,
  model: 'sonnet',
})

const result = await claude.query('Find bugs in src/')
console.log(result.text)
```

### SDK Lifecycle

Track initialization progress in SDK mode:

```ts
import {
  Claude,
  INIT_EVENT_STAGE,
  INIT_EVENT_READY,
  INIT_EVENT_ERROR,
} from '@scottwalker/claude-connector'

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

Check readiness and clean up:

```ts
console.log(claude.ready) // true if SDK session is initialized (always true in CLI mode)

// Free SDK session resources
claude.close()
```

### Custom Executable

```ts
import { Claude, DEFAULT_EXECUTABLE } from '@scottwalker/claude-connector'

// Default executable is 'claude'
console.log(DEFAULT_EXECUTABLE) // 'claude'

const claude = new Claude({
  executable: '/usr/local/bin/claude-2.0',
  cwd: '/home/user/my-project',
})
```
