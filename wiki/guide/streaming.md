# Streaming

Real-time response as events arrive. The `stream()` method returns a `StreamHandle`.

## Fluent Callbacks with `.on()` and `.done()`

Register typed callbacks, then consume with `.done()`:

```ts
import {
  Claude,
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
  EVENT_ERROR,
  EVENT_SYSTEM,
} from '@scottwalker/claude-connector'

const claude = new Claude()

const result = await claude.stream('Refactor the auth module')
  .on(EVENT_TEXT, (text) => {
    process.stdout.write(text)
  })
  .on(EVENT_TOOL_USE, (event) => {
    console.log(`\n[Tool: ${event.toolName}]`)
    console.log(JSON.stringify(event.toolInput, null, 2))
  })
  .on(EVENT_RESULT, (event) => {
    console.log(`\nDone in ${event.durationMs}ms`)
    console.log(`Tokens: ${event.usage.inputTokens}→${event.usage.outputTokens}`)
  })
  .on(EVENT_ERROR, (event) => {
    console.error(`Error: ${event.message}`)
  })
  .on(EVENT_SYSTEM, (event) => {
    console.log(`[System/${event.subtype}]`, event.data)
  })
  .done()

// result is StreamResultEvent — available after stream completes
console.log(`Session: ${result.sessionId}`)
console.log(`Cost: $${result.cost}`)
```

## Collect All Text with `.text()`

One-liner to get the full text response:

```ts
const text = await claude.stream('Summarize README.md').text()
console.log(text)
```

With callbacks still firing:

```ts
import { Claude, EVENT_TOOL_USE } from '@scottwalker/claude-connector'

const text = await claude.stream('Summarize README.md')
  .on(EVENT_TOOL_USE, (e) => console.log(`[${e.toolName}]`))
  .text()
```

## Pipe to stdout with `.pipe()`

Pipe text directly to any writable. Returns the result when done:

```ts
// Pipe to stdout
const result = await claude.stream('Explain the auth flow').pipe(process.stdout)
console.log(`\nCost: $${result.cost}`)

// Pipe to stderr
await claude.stream('Find bugs').pipe(process.stderr)

// Pipe to any object with .write()
const chunks: string[] = []
await claude.stream('Analyze').pipe({
  write(chunk: string) { chunks.push(chunk) },
})
```

## Async Iteration (`for await`)

`StreamHandle` implements `AsyncIterable<StreamEvent>` — use `for await` for full control:

```ts
import {
  Claude,
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
  EVENT_ERROR,
  EVENT_SYSTEM,
} from '@scottwalker/claude-connector'

const claude = new Claude()

for await (const event of claude.stream('Analyze the codebase')) {
  switch (event.type) {
    case EVENT_TEXT:
      process.stdout.write(event.text)
      break
    case EVENT_TOOL_USE:
      console.log(`[${event.toolName}]`, event.toolInput)
      break
    case EVENT_RESULT:
      console.log(`\nTokens: ${event.usage.inputTokens}→${event.usage.outputTokens}`)
      break
    case EVENT_ERROR:
      console.error(event.message)
      break
    case EVENT_SYSTEM:
      // system events (init, stderr, etc.)
      break
  }
}
```

### Collect Stream into a String

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const claude = new Claude()

let fullText = ''

for await (const event of claude.stream('Summarize README.md')) {
  if (event.type === EVENT_TEXT) fullText += event.text
}

console.log(fullText)
```

## Stream Events Reference

| Event | Constant | Callback Signature | Description |
|-------|----------|-------------------|-------------|
| `text` | `EVENT_TEXT` | `(text: string)` | Incremental text chunk |
| `tool_use` | `EVENT_TOOL_USE` | `(event: { toolName, toolInput })` | Tool invocation |
| `result` | `EVENT_RESULT` | `(event: { text, sessionId, usage, cost, durationMs })` | Final result (always last) |
| `error` | `EVENT_ERROR` | `(event: { message, code? })` | Error during execution |
| `system` | `EVENT_SYSTEM` | `(event: { subtype, data })` | System/internal event |

## Progress Tracking

```ts
import { EVENT_TEXT, EVENT_TOOL_USE } from '@scottwalker/claude-connector'

let charCount = 0
let toolCount = 0

const result = await claude.stream('Rewrite the test suite')
  .on(EVENT_TEXT, (text) => {
    charCount += text.length
    process.stdout.write(text)
  })
  .on(EVENT_TOOL_USE, (event) => {
    toolCount++
    process.stderr.write(`\r[Tools used: ${toolCount}] ${event.toolName}`)
  })
  .done()

console.log(`\nOutput: ${charCount} chars, ${toolCount} tools, ${result.durationMs}ms`)
```

## Tool Activity Logger

```ts
import { EVENT_TEXT, EVENT_TOOL_USE } from '@scottwalker/claude-connector'

const tools: Array<{ name: string; timestamp: number }> = []
const startTime = Date.now()

const result = await claude.stream('Fix all TypeScript errors in src/')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TOOL_USE, (event) => {
    tools.push({ name: event.toolName, timestamp: Date.now() - startTime })
  })
  .done()

console.log('\n\nTool timeline:')
for (const t of tools) {
  console.log(`  +${t.timestamp}ms  ${t.name}`)
}
```

## Token Budget Monitoring

```ts
import { EVENT_TEXT, EVENT_RESULT } from '@scottwalker/claude-connector'

const MAX_COST = 1.00 // $1 limit

const result = await claude.stream('Analyze the entire repo', { maxBudget: MAX_COST })
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_RESULT, (event) => {
    const pct = ((event.cost ?? 0) / MAX_COST * 100).toFixed(1)
    console.log(`\nBudget: $${event.cost} / $${MAX_COST} (${pct}%)`)
  })
  .done()
```

## Timeout and Abort

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const claude = new Claude({ useSdk: false })

// Abort after 30 seconds
const timer = setTimeout(() => claude.abort(), 30_000)

try {
  const result = await claude.stream('Analyze everything')
    .on(EVENT_TEXT, (t) => process.stdout.write(t))
    .done()

  clearTimeout(timer)
  console.log(`\nCompleted in ${result.durationMs}ms`)
} catch (err) {
  console.log('\nAborted or failed:', (err as Error).message)
}
```

## Parallel Streams

Run multiple streams simultaneously:

```ts
const claude = new Claude({ useSdk: false })

const streams = [
  claude.stream('Review src/auth.ts').text(),
  claude.stream('Review src/db.ts').text(),
  claude.stream('Review src/api.ts').text(),
]

const [auth, db, api] = await Promise.all(streams)

console.log('Auth review:', auth.slice(0, 100))
console.log('DB review:', db.slice(0, 100))
console.log('API review:', api.slice(0, 100))
```
