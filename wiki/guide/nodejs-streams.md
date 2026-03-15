# Node.js Streams

Both `StreamHandle` and `ChatHandle` integrate with the Node.js streams ecosystem via `.toReadable()` and `.toDuplex()`.

## `.toReadable()`

Returns a standard Node.js `Readable` stream in text mode:

```ts
import { createWriteStream } from 'node:fs'

// Pipe to file
claude.stream('Generate a report').toReadable()
  .pipe(createWriteStream('report.txt'))

// Pipe to HTTP response
claude.stream('Explain this').toReadable()
  .pipe(res)

// Read chunks manually
const readable = claude.stream('Analyze code').toReadable()
readable.on('data', (chunk) => {
  process.stdout.write(chunk)
})
readable.on('end', () => {
  console.log('\nStream ended')
})
```

## `.toDuplex()`

Available on `ChatHandle`. Write side accepts prompts (one per write), read side emits text:

```ts
const duplex = claude.chat().toDuplex()
inputStream.pipe(duplex).pipe(process.stdout)
```

## `pipeline()`

Node.js `pipeline()` handles error propagation and cleanup automatically:

```ts
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

// Simple pipeline
await pipeline(
  claude.stream('Generate CSV data').toReadable(),
  createWriteStream('data.csv'),
)

// Pipeline with transform
const uppercase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase())
  },
})

await pipeline(
  claude.stream('Generate text').toReadable(),
  uppercase,
  createWriteStream('UPPER.txt'),
)
```

## Compress with gzip/brotli

```ts
import { pipeline } from 'node:stream/promises'
import { createGzip, createBrotliCompress } from 'node:zlib'
import { createWriteStream } from 'node:fs'

// gzip
await pipeline(
  claude.stream('Generate a full project report').toReadable(),
  createGzip(),
  createWriteStream('report.txt.gz'),
)

// brotli
await pipeline(
  claude.stream('Generate documentation').toReadable(),
  createBrotliCompress(),
  createWriteStream('docs.txt.br'),
)
```

## Pipe to File

```ts
import { createWriteStream } from 'node:fs'

// Simple — pipe Readable to file
claude.stream('Generate a migration plan')
  .toReadable()
  .pipe(createWriteStream('migration-plan.txt'))

// With result tracking
const result = await claude.stream('Generate API docs')
  .pipe(createWriteStream('api-docs.txt'))

console.log(`Wrote docs (${result.usage.outputTokens} tokens)`)
```

## Pipe Between Processes

```ts
import { spawn } from 'node:child_process'

// Pipe Claude's output to another process
const less = spawn('less', [], { stdio: ['pipe', 'inherit', 'inherit'] })
claude.stream('Explain the entire codebase in detail').toReadable()
  .pipe(less.stdin)

// Pipe through grep
const grep = spawn('grep', ['-i', 'error'], { stdio: ['pipe', 'inherit', 'inherit'] })
claude.stream('Analyze the logs').toReadable()
  .pipe(grep.stdin)

// Pipe to clipboard (macOS)
const pbcopy = spawn('pbcopy', [], { stdio: ['pipe', 'inherit', 'inherit'] })
claude.stream('Write a commit message for the staged changes').toReadable()
  .pipe(pbcopy.stdin)
```

## Transform Streams

Custom Transform to process Claude's output in real time:

```ts
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

// Line numbering transform
let lineNum = 0
const lineNumberer = new Transform({
  transform(chunk, encoding, callback) {
    const lines = chunk.toString().split('\n')
    const numbered = lines.map((line: string) =>
      line ? `${++lineNum}: ${line}` : ''
    ).join('\n')
    callback(null, numbered)
  },
})

await pipeline(
  claude.stream('List all functions in src/').toReadable(),
  lineNumberer,
  process.stdout,
)
```

### Markdown to HTML Transform

```ts
import { marked } from 'marked'

const markdownToHtml = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, marked.parse(chunk.toString()))
  },
})

await pipeline(
  claude.stream('Write API docs in markdown').toReadable(),
  markdownToHtml,
  createWriteStream('docs.html'),
)
```

## Log to Multiple Destinations

```ts
import { createWriteStream } from 'node:fs'
import { EVENT_TEXT, EVENT_TOOL_USE } from '@scottwalker/claude-connector'

const fileLog = createWriteStream('session.log', { flags: 'a' })

const result = await claude.stream('Deploy to staging')
  .on(EVENT_TEXT, (text) => {
    // Simultaneously: stdout + file + buffer
    process.stdout.write(text)
    fileLog.write(text)
  })
  .on(EVENT_TOOL_USE, (event) => {
    const line = `[TOOL] ${event.toolName}: ${JSON.stringify(event.toolInput)}\n`
    process.stderr.write(line)
    fileLog.write(line)
  })
  .done()

fileLog.write(`\n--- ${result.durationMs}ms, $${result.cost} ---\n`)
fileLog.end()
```

::: tip
Use `pipeline()` instead of `.pipe()` when you need proper error handling and automatic cleanup. `pipeline()` destroys all streams in the chain if any one of them errors.
:::
