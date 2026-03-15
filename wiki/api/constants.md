# Constants

All string literals are exported as named constants. Use them instead of raw strings to prevent typos and enable IDE autocompletion.

```typescript
import {
  EVENT_TEXT,
  PERMISSION_PLAN,
  EFFORT_HIGH,
  SCHED_RESULT,
} from '@scottwalker/claude-connector'
```

## Event Types

Constants for stream event discrimination. Used with [`StreamHandle.on()`](./stream-handle#on) and [`ChatHandle.on()`](./chat-handle#on).

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_TEXT` | `'text'` | Incremental text chunk |
| `EVENT_TOOL_USE` | `'tool_use'` | Tool invocation |
| `EVENT_RESULT` | `'result'` | Final result |
| `EVENT_ERROR` | `'error'` | Error event |
| `EVENT_SYSTEM` | `'system'` | System/internal event |

```typescript
import { EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR, EVENT_SYSTEM } from '@scottwalker/claude-connector'

claude.stream('Analyze code')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TOOL_USE, (event) => console.log(event.toolName))
  .on(EVENT_RESULT, (event) => console.log(event.durationMs))
  .on(EVENT_ERROR, (event) => console.error(event.message))
  .on(EVENT_SYSTEM, (event) => console.log(event.subtype))
  .done()
```

## Permission Modes

Control how Claude handles tool approval. Used in [`ClientOptions.permissionMode`](./types#clientoptions) and [`QueryOptions.permissionMode`](./types#queryoptions).

| Constant | Value | Description |
|----------|-------|-------------|
| `PERMISSION_DEFAULT` | `'default'` | Prompt on first use of each tool |
| `PERMISSION_ACCEPT_EDITS` | `'acceptEdits'` | Auto-accept file edits |
| `PERMISSION_PLAN` | `'plan'` | Read-only, no modifications allowed |
| `PERMISSION_DONT_ASK` | `'dontAsk'` | Skip permission prompts |
| `PERMISSION_BYPASS` | `'bypassPermissions'` | Skip all permission checks (dangerous) |
| `PERMISSION_AUTO` | `'auto'` | Automatically approve tools |

```typescript
import { Claude, PERMISSION_PLAN, PERMISSION_AUTO } from '@scottwalker/claude-connector'

// Read-only analysis
const analyst = new Claude({ permissionMode: PERMISSION_PLAN })

// Fully autonomous
const worker = new Claude({ permissionMode: PERMISSION_AUTO })
```

### Validation array

```typescript
import { VALID_PERMISSION_MODES } from '@scottwalker/claude-connector'
// ['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions', 'auto']
```

## Effort Levels

Control thinking depth. Used in [`ClientOptions.effortLevel`](./types#clientoptions) and [`QueryOptions.effortLevel`](./types#queryoptions).

| Constant | Value | Description |
|----------|-------|-------------|
| `EFFORT_LOW` | `'low'` | Quick, minimal thinking |
| `EFFORT_MEDIUM` | `'medium'` | Balanced (default) |
| `EFFORT_HIGH` | `'high'` | Deep analysis |
| `EFFORT_MAX` | `'max'` | Maximum depth |

```typescript
import { Claude, EFFORT_HIGH, EFFORT_LOW } from '@scottwalker/claude-connector'

// Deep analysis
const result = await claude.query('Find security vulnerabilities', {
  effortLevel: EFFORT_HIGH,
})

// Quick check
const quick = await claude.query('Is this file valid JSON?', {
  effortLevel: EFFORT_LOW,
})
```

### Validation array

```typescript
import { VALID_EFFORT_LEVELS } from '@scottwalker/claude-connector'
// ['low', 'medium', 'high', 'max']
```

## Scheduler Events

Event constants for [`ScheduledJob`](./scheduled-job). Used with `job.on()`.

| Constant | Value | Description |
|----------|-------|-------------|
| `SCHED_RESULT` | `'result'` | After each successful query |
| `SCHED_ERROR` | `'error'` | On query failure |
| `SCHED_TICK` | `'tick'` | Before each execution |
| `SCHED_STOP` | `'stop'` | When job is stopped |

```typescript
import { SCHED_RESULT, SCHED_ERROR, SCHED_TICK, SCHED_STOP } from '@scottwalker/claude-connector'

const job = claude.loop('5m', 'Check status')
job.on(SCHED_TICK, (n) => console.log(`Tick ${n}`))
job.on(SCHED_RESULT, (r) => console.log(r.text))
job.on(SCHED_ERROR, (e) => console.error(e))
job.on(SCHED_STOP, () => console.log('Done'))
```

## Init Events

Initialization lifecycle events for SDK mode. Used with [`claude.on()`](./#events-on).

| Constant | Value | Description |
|----------|-------|-------------|
| `INIT_EVENT_STAGE` | `'init:stage'` | Initialization progress update |
| `INIT_EVENT_READY` | `'init:ready'` | SDK session is ready |
| `INIT_EVENT_ERROR` | `'init:error'` | Initialization failed |

### Init Stages

Stage values emitted by `INIT_EVENT_STAGE`:

| Constant | Value | Description |
|----------|-------|-------------|
| `INIT_IMPORTING` | `'importing'` | Importing SDK module |
| `INIT_CREATING` | `'creating'` | Creating SDK session |
| `INIT_CONNECTING` | `'connecting'` | Connecting to Claude |
| `INIT_READY` | `'ready'` | Session is ready |

```typescript
import { Claude, INIT_EVENT_STAGE, INIT_EVENT_READY, INIT_EVENT_ERROR } from '@scottwalker/claude-connector'

const claude = new Claude()
claude.on(INIT_EVENT_STAGE, (stage, msg) => console.log(`[${stage}] ${msg}`))
claude.on(INIT_EVENT_READY, () => console.log('Ready!'))
claude.on(INIT_EVENT_ERROR, (err) => console.error(err))
await claude.init()
```

## Content Block Types

Discriminators for message content blocks in [`Message.content`](./types#message).

| Constant | Value | Description |
|----------|-------|-------------|
| `BLOCK_TEXT` | `'text'` | Text content block |
| `BLOCK_TOOL_USE` | `'tool_use'` | Tool invocation block |
| `BLOCK_TOOL_RESULT` | `'tool_result'` | Tool result block |

```typescript
import { BLOCK_TEXT, BLOCK_TOOL_USE, BLOCK_TOOL_RESULT } from '@scottwalker/claude-connector'

for (const msg of result.messages) {
  if (typeof msg.content === 'string') continue
  for (const block of msg.content) {
    switch (block.type) {
      case BLOCK_TEXT: console.log(block.text); break
      case BLOCK_TOOL_USE: console.log(block.name, block.input); break
      case BLOCK_TOOL_RESULT: console.log(block.content); break
    }
  }
}
```

## Output / Input Formats

Internal protocol format constants.

| Constant | Value | Description |
|----------|-------|-------------|
| `FORMAT_JSON` | `'json'` | Single JSON response (`query()`) |
| `FORMAT_STREAM_JSON` | `'stream-json'` | NDJSON streaming (`stream()`, `chat()`) |

## Message Roles

| Constant | Value | Description |
|----------|-------|-------------|
| `ROLE_USER` | `'user'` | User message |
| `ROLE_ASSISTANT` | `'assistant'` | Assistant message |

## MCP Transport Types

| Constant | Value | Description |
|----------|-------|-------------|
| `MCP_STDIO` | `'stdio'` | Standard I/O transport |
| `MCP_HTTP` | `'http'` | HTTP transport |
| `MCP_SSE` | `'sse'` | Server-Sent Events transport |

## System Event Subtypes

| Constant | Value | Description |
|----------|-------|-------------|
| `SYSTEM_STDERR` | `'stderr'` | Stderr output |
| `SYSTEM_INIT` | `'init'` | Initialization event |
| `SYSTEM_UNKNOWN` | `'unknown'` | Unrecognized event |

## Interval Units

| Constant | Value | Multiplier |
|----------|-------|------------|
| `UNIT_SECONDS` | `'s'` | 1,000 ms |
| `UNIT_MINUTES` | `'m'` | 60,000 ms |
| `UNIT_HOURS` | `'h'` | 3,600,000 ms |
| `UNIT_DAYS` | `'d'` | 86,400,000 ms |

The `INTERVAL_MULTIPLIERS` record maps unit strings to their millisecond values.

## Default Values

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_EXECUTABLE` | `'claude'` | Default CLI binary name |
| `DEFAULT_MODEL` | `'sonnet'` | Default model |
| `DEFAULT_TIMEOUT_MS` | `600000` | Default timeout (10 minutes) |

```typescript
import { DEFAULT_EXECUTABLE, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from '@scottwalker/claude-connector'
```
