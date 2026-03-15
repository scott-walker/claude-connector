# ChatHandle

Bidirectional streaming handle for real-time conversation. Maintains a persistent CLI process using `--input-format stream-json` for multi-turn dialogue.

Returned from [`claude.chat()`](./#chat).

```typescript
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const claude = new Claude({ useSdk: false })
const chat = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))

const r1 = await chat.send('What files are in src?')
const r2 = await chat.send('Fix the largest one')
chat.end()
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `sessionId` | `string \| null` | Session ID (populated after the first result event) |
| `turnCount` | `number` | Number of completed turns |
| `closed` | `boolean` | Whether the chat has been closed |

```typescript
const chat = claude.chat()
console.log(chat.sessionId) // null

await chat.send('Hello')
console.log(chat.sessionId) // 'abc-123...'
console.log(chat.turnCount) // 1

await chat.send('Follow up')
console.log(chat.turnCount) // 2
console.log(chat.closed) // false

chat.end()
console.log(chat.closed) // true
```

## Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.send(prompt)` | `Promise<StreamResultEvent>` | Send prompt, await turn completion |
| `.on(type, callback)` | `this` | Register callback (same events as StreamHandle) |
| `.pipe(dest)` | `dest` | Pipe text to writable (returns dest for chaining) |
| `.toReadable()` | `Readable` | Get Node.js Readable (text mode) |
| `.toDuplex()` | `Duplex` | Get Node.js Duplex (write prompts, read text) |
| `.end()` | `void` | Close gracefully (EOF to stdin) |
| `.abort()` | `void` | Kill process immediately (SIGTERM) |

### send()

```typescript
send(prompt: string): Promise<StreamResultEvent>
```

Send a prompt and wait for the complete response for this turn. Returns the result event when the turn finishes. Registered callbacks fire as events arrive during the turn.

Throws if the chat is closed or if an error event is received.

```typescript
import { EVENT_TEXT } from '@scottwalker/claude-connector'

const chat = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))

const result = await chat.send('Find bugs in auth.ts')
console.log(`Turn took ${result.durationMs}ms`)

const result2 = await chat.send('Now fix them')
console.log(`Used ${result2.usage.outputTokens} output tokens`)
```

### on()

```typescript
on(type: typeof EVENT_TEXT, callback: (text: string) => void): this
on(type: typeof EVENT_TOOL_USE, callback: (event: StreamToolUseEvent) => void): this
on(type: typeof EVENT_RESULT, callback: (event: StreamResultEvent) => void): this
on(type: typeof EVENT_ERROR, callback: (event: StreamErrorEvent) => void): this
on(type: typeof EVENT_SYSTEM, callback: (event: StreamSystemEvent) => void): this
```

Register a callback for a specific event type. Returns `this` for chaining. Same event types as [`StreamHandle.on()`](./stream-handle#on).

Callbacks persist across all turns -- register once, receive events from every `.send()`.

```typescript
import {
  Claude, EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT,
} from '@scottwalker/claude-connector'

const chat = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TOOL_USE, (event) => console.log(`Tool: ${event.toolName}`))
  .on(EVENT_RESULT, (event) => console.log(`\nTurn done: ${event.durationMs}ms`))

await chat.send('Analyze the codebase')
await chat.send('Now refactor auth')
chat.end()
```

### pipe()

```typescript
pipe<T extends NodeJS.WritableStream>(dest: T): T
```

Pipe text output to a writable stream. Returns the destination for chaining (Node.js convention). Persists across all turns.

```typescript
import { createWriteStream } from 'node:fs'

const chat = claude.chat()
chat.pipe(process.stdout)
chat.pipe(createWriteStream('conversation.log'))

await chat.send('What is the architecture?')
await chat.send('Suggest improvements')
chat.end()
```

### toReadable()

```typescript
toReadable(): Readable
```

Get a Node.js `Readable` that emits text chunks from all turns. The readable ends when the chat process closes.

```typescript
const chat = claude.chat()
const readable = chat.toReadable()
readable.pipe(process.stdout)

await chat.send('First question')
await chat.send('Second question')
chat.end()
```

### toDuplex()

```typescript
toDuplex(): Duplex
```

Get a Node.js `Duplex` stream. Write side accepts prompts (one per write, newline-delimited). Read side emits text chunks. Ideal for piping input/output streams.

```typescript
const duplex = claude.chat().toDuplex()

// Pipe an input stream of prompts, pipe output to stdout
inputStream.pipe(duplex).pipe(process.stdout)
```

### end()

```typescript
end(): void
```

Close the chat gracefully -- signals EOF to the CLI process stdin. Idempotent (safe to call multiple times).

### abort()

```typescript
abort(): void
```

Kill the CLI process immediately with `SIGTERM`. Use when you need to cancel a running turn without waiting for completion.
