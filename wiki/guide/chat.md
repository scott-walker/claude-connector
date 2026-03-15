# Chat

Bidirectional streaming for multi-turn conversation over a single persistent process. `claude.chat()` returns a `ChatHandle`.

## Send and Await

`.send()` sends a prompt and returns a promise that resolves when the turn completes:

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const claude = new Claude()

const chat = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))

const r1 = await chat.send('What files are in src/?')
console.log(`\n[Turn 1: ${r1.durationMs}ms, ${r1.usage.outputTokens} tokens]`)

const r2 = await chat.send('Refactor the largest file')
console.log(`\n[Turn 2: ${r2.durationMs}ms]`)

const r3 = await chat.send('Now write tests for it')
console.log(`\n[Turn 3: ${r3.durationMs}ms]`)

console.log(`Session: ${chat.sessionId}`)
console.log(`Turns: ${chat.turnCount}`)

chat.end()
```

## Fluent Callbacks with `.on()`

Register typed callbacks just like `StreamHandle`:

```ts
import {
  Claude,
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
} from '@scottwalker/claude-connector'

const claude = new Claude()

const chat = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TOOL_USE, (event) => console.log(`[Tool: ${event.toolName}]`))
  .on(EVENT_RESULT, (event) => console.log(`\n[Turn done in ${event.durationMs}ms]`))

await chat.send('What files are in src?')
await chat.send('Refactor the largest one')

chat.end()
```

## Pipe to Writable with `.pipe()`

Pipe all text output to one or more destinations:

```ts
import { createWriteStream } from 'node:fs'

const chat = claude.chat()

// Pipe to multiple destinations simultaneously
chat.pipe(process.stdout)
chat.pipe(createWriteStream('conversation.log'))

await chat.send('Analyze the codebase')
await chat.send('Find security issues')
await chat.send('Generate a report')

chat.end()
```

## Lifecycle

```ts
const chat = claude.chat()

chat.sessionId   // null (until first result)
chat.turnCount   // 0
chat.closed      // false

await chat.send('Hello')

chat.sessionId   // "abc-123-..."
chat.turnCount   // 1
chat.closed      // false

chat.end()       // graceful close (waits for process)
chat.closed      // true

// Or:
chat.abort()     // immediate kill (SIGTERM)
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `sessionId` | `string \| null` | Session ID, available after the first result event |
| `turnCount` | `number` | Number of completed conversation turns |
| `closed` | `boolean` | Whether the chat has been closed |

## Interactive REPL Example

```ts
import * as readline from 'node:readline'
import { Claude, EVENT_TEXT } from '@scottwalker/claude-connector'

const claude = new Claude()
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const chat = claude.chat()
  .on(EVENT_TEXT, (text) => process.stdout.write(text))

const ask = () => {
  rl.question('\n> ', async (input) => {
    if (input === 'exit') {
      chat.end()
      rl.close()
      return
    }

    await chat.send(input)
    ask()
  })
}

console.log('Chat with Claude (type "exit" to quit)')
ask()
```

## Chat as a Node.js Readable

```ts
const chat = claude.chat()
const readable = chat.toReadable()

// Pipe to any writable
readable.pipe(createWriteStream('output.txt'))

await chat.send('Generate documentation for every module')

chat.end()
```

## Chat as a Node.js Duplex

`.toDuplex()` returns a full Node.js `Duplex` stream. Write side accepts prompts (one per write), read side emits text:

```ts
import { pipeline } from 'node:stream/promises'
import { createReadStream, createWriteStream } from 'node:fs'

const duplex = claude.chat().toDuplex()

// Pipe prompts in, pipe responses out
await pipeline(
  createReadStream('prompts.txt'),  // one prompt per line
  duplex,
  createWriteStream('responses.txt'),
)
```

Manual use:

```ts
const duplex = claude.chat().toDuplex()

duplex.pipe(process.stdout)

duplex.write('What does this project do?\n')
// text flows to stdout...

duplex.write('How can I improve it?\n')
// more text flows...

duplex.end()
```

::: tip
Use `ChatHandle` when you need multi-turn conversations with low latency. It keeps a single process alive, avoiding the startup cost of spawning a new process for each turn.
:::
