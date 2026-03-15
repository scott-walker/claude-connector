# StreamHandle

A streaming response handle with fluent callback API and Node.js stream support. Returned from [`claude.stream()`](./#stream) and [`session.stream()`](./session#methods).

```typescript
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const handle = claude.stream('Explain this code')
```

`StreamHandle` implements `AsyncIterable<StreamEvent>`, so it can be consumed four different ways:

1. **Fluent callbacks** -- `.on().done()`
2. **Convenience methods** -- `.text()`, `.pipe()`
3. **Node.js Readable** -- `.toReadable()`
4. **Async iteration** -- `for await...of`

## Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.on(type, callback)` | `this` | Register typed callback. Chainable. |
| `.done()` | `Promise<StreamResultEvent>` | Consume stream, fire callbacks, return result. |
| `.text()` | `Promise<string>` | Collect all text chunks into a string. |
| `.pipe(writable)` | `Promise<StreamResultEvent>` | Pipe text to writable, return result. |
| `.toReadable()` | `Readable` | Get Node.js Readable (text mode). |
| `[Symbol.asyncIterator]` | `AsyncIterator<StreamEvent>` | Raw async iteration over all events. |

### on()

```typescript
on(type: typeof EVENT_TEXT, callback: (text: string) => void): this
on(type: typeof EVENT_TOOL_USE, callback: (event: StreamToolUseEvent) => void): this
on(type: typeof EVENT_RESULT, callback: (event: StreamResultEvent) => void): this
on(type: typeof EVENT_ERROR, callback: (event: StreamErrorEvent) => void): this
on(type: typeof EVENT_SYSTEM, callback: (event: StreamSystemEvent) => void): this
```

Register a callback for a specific event type. Returns `this` for chaining. Multiple callbacks per event type are supported.

::: tip
The `EVENT_TEXT` callback receives just the text string for convenience. All other callbacks receive the full event object.
:::

```typescript
import {
  Claude, EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR, EVENT_SYSTEM,
} from '@scottwalker/claude-connector'

const claude = new Claude()
const result = await claude.stream('Refactor auth module')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TOOL_USE, (event) => {
    console.log(`Tool: ${event.toolName}`)
    console.log(`Input: ${JSON.stringify(event.toolInput)}`)
  })
  .on(EVENT_RESULT, (event) => {
    console.log(`Session: ${event.sessionId}`)
    console.log(`Cost: $${event.cost}`)
    console.log(`Duration: ${event.durationMs}ms`)
  })
  .on(EVENT_ERROR, (event) => {
    console.error(`Error: ${event.message}`)
    if (event.code) console.error(`Code: ${event.code}`)
  })
  .on(EVENT_SYSTEM, (event) => {
    console.log(`System [${event.subtype}]:`, event.data)
  })
  .done()
```

## Event Callbacks

| Event | Constant | Callback Signature | Description |
|-------|----------|--------------------|-------------|
| `'text'` | `EVENT_TEXT` | `(text: string) => void` | Incremental text chunk |
| `'tool_use'` | `EVENT_TOOL_USE` | `(event: StreamToolUseEvent) => void` | Tool invocation with name and input |
| `'result'` | `EVENT_RESULT` | `(event: StreamResultEvent) => void` | Final result with usage, cost, duration |
| `'error'` | `EVENT_ERROR` | `(event: StreamErrorEvent) => void` | Error with message and optional code |
| `'system'` | `EVENT_SYSTEM` | `(event: StreamSystemEvent) => void` | System event with subtype and data |

See [StreamEvent types](./types#streamevent) for full event type definitions.

### done()

```typescript
done(): Promise<StreamResultEvent>
```

Consume the entire stream, fire all registered callbacks as events arrive, and return the final result event. Throws if the stream ends without a result event.

```typescript
const result = await claude.stream('Generate code')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .done()

console.log(result.sessionId)
console.log(result.usage) // { inputTokens, outputTokens }
```

### text()

```typescript
text(): Promise<string>
```

Collect all text chunks into a single string. Registered callbacks still fire during consumption.

```typescript
const summary = await claude.stream('Summarize this file').text()
console.log(summary)
```

### pipe()

```typescript
pipe(writable: { write(chunk: string): unknown }): Promise<StreamResultEvent>
```

Pipe text chunks to any writable target. Returns the final result event after the stream completes. Accepts anything with a `.write()` method (Node.js streams, `process.stdout`, response objects).

```typescript
import { EVENT_RESULT } from '@scottwalker/claude-connector'

const result = await claude.stream('Explain the architecture').pipe(process.stdout)
console.log(`\nDone in ${result.durationMs}ms`)
```

### toReadable()

```typescript
toReadable(): Readable
```

Get a Node.js `Readable` stream that emits text chunks. Ideal for `pipeline()`, `.pipe()` chaining, HTTP responses, and compression.

```typescript
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { createWriteStream } from 'node:fs'

// Pipe to file
claude.stream('Generate report').toReadable().pipe(createWriteStream('report.txt'))

// Pipeline with compression
await pipeline(
  claude.stream('Generate large report').toReadable(),
  createGzip(),
  createWriteStream('report.gz'),
)

// HTTP response
app.get('/stream', (req, res) => {
  claude.stream('Generate response').toReadable().pipe(res)
})
```

### \[Symbol.asyncIterator\]

```typescript
[Symbol.asyncIterator](): AsyncIterator<StreamEvent>
```

Raw async iteration over all stream events. This is the backward-compatible API -- use fluent callbacks for new code.

```typescript
import { EVENT_TEXT, EVENT_TOOL_USE } from '@scottwalker/claude-connector'

for await (const event of claude.stream('Analyze codebase')) {
  switch (event.type) {
    case EVENT_TEXT:
      process.stdout.write(event.text)
      break
    case EVENT_TOOL_USE:
      console.log(`Using tool: ${event.toolName}`)
      break
  }
}
```
