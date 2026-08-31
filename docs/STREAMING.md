# Streaming Guide

Real-time integration of Claude Code into any Node.js application.

```ts
import { Claude } from '@scottwalker/kraube-konnektor'
```

A stream carries far more than text: **43 typed event variants** cover thinking,
tool lifecycle, subagents, hooks, permissions, rate limits, model refusals and
context pressure. Both executors produce the same union — see
[Stream Events Reference](#stream-events-reference).

---

## Table of Contents

- [StreamHandle — One-shot Streaming](#streamhandle--one-shot-streaming)
  - [Fluent Callbacks](#fluent-callbacks)
  - [Collect to String](#collect-to-string)
  - [Pipe to Writable](#pipe-to-writable)
  - [Node.js Readable](#nodejs-readable)
  - [Async Iteration](#async-iteration)
  - [Stream Events Reference](#stream-events-reference) — all 43 variants
  - [Reasoning and progress](#reasoning-and-progress)
  - [Context pressure](#context-pressure)
  - [Reliability signals](#reliability-signals)
  - [Permission denials and host notices](#permission-denials-and-host-notices)
  - [Background tasks](#background-tasks)
- [ChatHandle — Bidirectional Streaming](#chathandle--bidirectional-streaming)
  - [Send and Await](#send-and-await)
  - [Continuous Pipe](#continuous-pipe)
  - [Node.js Readable](#chathandle-readable)
  - [Node.js Duplex](#nodejs-duplex)
  - [Chat Lifecycle](#chat-lifecycle)
- [Integration Patterns](#integration-patterns)
  - [HTTP Streaming (Express)](#http-streaming-express)
  - [HTTP Streaming (Fastify)](#http-streaming-fastify)
  - [Server-Sent Events (SSE)](#server-sent-events-sse)
  - [WebSocket](#websocket)
  - [Write to File](#write-to-file)
  - [Compress with gzip/brotli](#compress-with-gzipbrotli)
  - [pipeline()](#pipeline)
  - [Transform Stream](#transform-stream)
  - [Pipe Between Processes](#pipe-between-processes)
  - [Log to Multiple Destinations](#log-to-multiple-destinations)
  - [Progress Tracking](#progress-tracking)
  - [Token Budget Monitoring](#token-budget-monitoring)
  - [Tool Activity Logger](#tool-activity-logger)
  - [Streaming in Sessions](#streaming-in-sessions)
  - [Parallel Streams](#parallel-streams)
  - [Timeout and Abort](#timeout-and-abort)
  - [Error Handling](#error-handling)
  - [Telegram Bot](#telegram-bot)
  - [Slack Bot](#slack-bot)
  - [CLI Tool with Spinner](#cli-tool-with-spinner)
  - [Interactive Chat REPL](#interactive-chat-repl)
  - [CI/CD Pipeline Reporter](#cicd-pipeline-reporter)
  - [Electron IPC](#electron-ipc)
  - [Worker Threads](#worker-threads)

---

## StreamHandle — One-shot Streaming

`claude.stream()` returns a `StreamHandle` — a one-shot streaming response with fluent API.

### Fluent Callbacks

Register typed callbacks, then consume with `.done()`:

```ts
import { Claude, EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR, EVENT_SYSTEM } from '@scottwalker/kraube-konnektor'

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

### Collect to String

One-liner to get the full text response:

```ts
const text = await claude.stream('Summarize README.md').text()
console.log(text)
```

With callbacks still firing:

```ts
import { Claude, EVENT_TOOL_USE } from '@scottwalker/kraube-konnektor'

const text = await claude.stream('Summarize README.md')
  .on(EVENT_TOOL_USE, (e) => console.log(`[${e.toolName}]`))
  .text()
```

### Pipe to Writable

Pipe text directly to any writable. Returns the result when done.

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

### Node.js Readable

`.toReadable()` returns a standard Node.js `Readable` stream in text mode. This integrates with the entire Node.js streams ecosystem.

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

### Async Iteration

`StreamHandle` implements `AsyncIterable<StreamEvent>` — use `for await` for full control:

```ts
import { Claude, EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR, EVENT_SYSTEM } from '@scottwalker/kraube-konnektor'

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

### Stream Events Reference

`StreamEvent` is a discriminated union of **43 variants**. Narrow on
`event.type`, and match against the exported `EVENT_*` constants rather than
bare strings — that is what they exist for.

**Which executor emits what.** Both do: `SdkExecutor` maps the SDK message
union, `CliExecutor` runs every NDJSON line through `parseStreamEvents()`, and
the two produce the same 43 variants — the modes are interchangeable from a
consumer's point of view. A single NDJSON line can carry several events, and the
plural reader returns all of them in wire order: an assistant turn contributes a
wrapper-level `error`, one event per content block and its `/context` report; a
user turn contributes one `tool_result` per parallel tool call. What differs
between the modes is the *precondition*:

- CLI mode only sees events on `--output-format stream-json`, i.e. through
  `stream()` / `session.stream()` / `chat()`. `query()` uses `--output-format
  json` and returns a [`QueryResult`](./API.md#queryresult) instead.
- Some events only exist when the matching option was set (the **Requires**
  column below). The args builder emits those flags for `stream()` and `chat()`
  only; SDK mode passes them at session construction.
- An event the running CLI does not produce simply never fires. Nothing is lost:
  anything this version does not model arrives as `system` with its raw payload.

`.on()` has one overload per variant, so the callback parameter is narrowed
automatically. `text` is the only event whose callback receives the payload
(the string) instead of the event object.

#### Conversation

| Event | Constant | Key fields | Requires |
|---|---|---|---|
| `text` | `EVENT_TEXT` | `text` | — |
| `thinking` | `EVENT_THINKING` | `thinking`, `signature?`, `redacted?` | `thinking` not `'disabled'` |
| `thinking_tokens` | `EVENT_THINKING_TOKENS` | `estimatedTokens`, `estimatedTokensDelta` | thinking in progress |
| `tool_use` | `EVENT_TOOL_USE` | `toolName`, `toolInput` | — |
| `tool_result` | `EVENT_TOOL_RESULT` | `toolUseId`, `content`, `isError?`, `toolUseResult?`, `parentToolUseId?`, `isReplay?`, `isSynthetic?`, `subagentType?`, `origin?` | — |
| `tool_progress` | `EVENT_TOOL_PROGRESS` | `toolUseId`, `toolName`, `parentToolUseId`, `elapsedTimeSeconds`, `taskId?`, `heartbeat?`, `subagentRetry?` | long-running tools |
| `tool_use_summary` | `EVENT_TOOL_USE_SUMMARY` | `summary`, `precedingToolUseIds` | CLI-side summarization |
| `result` | `EVENT_RESULT` | everything on [`QueryResult`](./API.md#queryresult) plus `stopReason?`, `numTurns?` | once per turn — last of the turn's own events, though trailing informational frames (`prompt_suggestion`, `task_notification`, `session_state_changed`) can follow it |
| `error` | `EVENT_ERROR` | `message`, `code?`, `aborted?`, `requestId?` | API/turn failure, or a rejected `resumeDropsTurn` |

#### Session lifecycle

| Event | Constant | Key fields | Requires |
|---|---|---|---|
| `init` | `EVENT_INIT` | `model`, `cwd`, `tools`, `skills`, `slashCommands`, `mcpServers`, `plugins`, `agents?`, `permissionMode`, `apiKeySource`, `claudeCodeVersion`, `outputStyle`, `betas?`, `effort?`, `capabilities?`, `fastModeState?` | first message of a session |
| `session_state_changed` | `EVENT_SESSION_STATE_CHANGED` | `state`: `'idle' \| 'running' \| 'requires_action'` | — |
| `status` | `EVENT_STATUS` | `status`: `'compacting' \| 'requesting' \| null`, `permissionMode?`, `compactResult?`, `compactError?` | — |
| `compact_boundary` | `EVENT_COMPACT_BOUNDARY` | `trigger`, `preTokens`, `postTokens?`, `durationMs?`, `preservedMessages?`, `preservedSegment?` | auto or `/compact` |
| `context_usage` | `EVENT_CONTEXT_USAGE` | `contextUsage: ContextUsage` | carried on assistant messages |
| `conversation_reset` | `EVENT_CONVERSATION_RESET` | `newConversationId` | transcript restarted mid-stream |
| `worker_shutting_down` | `EVENT_WORKER_SHUTTING_DOWN` | `reason` | worker is going away |

#### Subagents & background work

| Event | Constant | Key fields | Requires |
|---|---|---|---|
| `task_started` | `EVENT_TASK_STARTED` | `taskId`, `toolUseId?`, `description`, `taskType?`, `prompt?`, `subagentType?`, `isBackgrounded?`, `spawnDepth?`, `workflowName?` | a subagent runs |
| `task_progress` | `EVENT_TASK_PROGRESS` | `taskId`, `description`, `usage`, `lastToolName?`, `summary?`, `subagentType?` | `summary` needs `agentProgressSummaries` |
| `task_notification` | `EVENT_TASK_NOTIFICATION` | `taskId`, `status`, `outputFile`, `summary`, `usage?` | task finished |
| `task_updated` | `EVENT_TASK_UPDATED` | `taskId`, `patch` (`status?`, `description?`, `error?`, `endTime?`, `totalPausedMs?`, `isBackgrounded?`) — apply it over the task you hold, do not replace | task metadata changed |
| `background_tasks_changed` | `EVENT_BACKGROUND_TASKS_CHANGED` | `tasks[]` (`taskId`, `taskType`, `description`, `ambient?`) — REPLACE semantics | a task was backgrounded or completed |

#### Permissions & host UI

| Event | Constant | Key fields | Requires |
|---|---|---|---|
| `permission_denied` | `EVENT_PERMISSION_DENIED` | `toolName`, `toolUseId`, `message`, `agentId?`, `decisionReason?`, `decisionReasonType?` | a tool call was denied |
| `notification` | `EVENT_NOTIFICATION` | `key`, `text`, `priority`, `color?`, `timeoutMs?` | host-facing toast |
| `informational` | `EVENT_INFORMATIONAL` | `content`, `level`, `toolUseId?`, `preventContinuation?` | CLI notices |
| `prompt_suggestion` | `EVENT_PROMPT_SUGGESTION` | `suggestion` | `promptSuggestions: true`. Arrives *after* the turn's `result`, from a separate model call — in SDK mode raise `postResultDrainMs` so the drain window is still open when it lands |
| `local_command_output` | `EVENT_LOCAL_COMMAND_OUTPUT` | `content` | a local slash command ran |

#### Hooks

| Event | Constant | Key fields | Requires |
|---|---|---|---|
| `hook_started` | `EVENT_HOOK_STARTED` | `hookId`, `hookName`, `hookEvent` | `includeHookEvents: true` |
| `hook_progress` | `EVENT_HOOK_PROGRESS` | `hookId`, `hookName`, `hookEvent`, `stdout`, `stderr`, `output` | `includeHookEvents: true` |
| `hook_response` | `EVENT_HOOK_RESPONSE` | `hookId`, `hookName`, `hookEvent`, `output`, `stdout`, `stderr`, `exitCode?`, `outcome` | `includeHookEvents: true` |

#### Reliability

| Event | Constant | Key fields | Requires |
|---|---|---|---|
| `rate_limit` | `EVENT_RATE_LIMIT` | `status`, `rateLimitType?`, `utilization?`, `resetsAt?`, `overageStatus?`, `isUsingOverage?`, `data` | quota warning or rejection |
| `api_retry` | `EVENT_API_RETRY` | `attempt`, `maxRetries`, `retryDelayMs`, `errorStatus`, `error` | a request is being retried |
| `model_refusal_fallback` | `EVENT_MODEL_REFUSAL_FALLBACK` | `direction`, `scope?`, `originalModel`, `fallbackModel`, `requestId`, `refusalCategory?`, `retractedMessageUuids?`, `content` | model refused, a fallback exists |
| `model_refusal_no_fallback` | `EVENT_MODEL_REFUSAL_NO_FALLBACK` | `originalModel`, `requestId`, `refusalCategory?`, `refusalExplanation?`, `content` | model refused, no fallback |
| `mirror_error` | `EVENT_MIRROR_ERROR` | `error`, `key` (`projectKey`, `sessionId`, `subpath?`) | `sessionStore` mirroring failed |

#### Environment

| Event | Constant | Key fields | Requires |
|---|---|---|---|
| `auth_status` | `EVENT_AUTH_STATUS` | `isAuthenticating`, `output`, `error?` | MCP OAuth flow |
| `files_persisted` | `EVENT_FILES_PERSISTED` | `files`, `failed`, `processedAt` | file checkpointing |
| `memory_recall` | `EVENT_MEMORY_RECALL` | `mode`, `memories[]` | memory files pulled into context |
| `commands_changed` | `EVENT_COMMANDS_CHANGED` | `commands: SlashCommand[]` | commands reloaded |
| `plugin_install` | `EVENT_PLUGIN_INSTALL` | `status`, `name?`, `error?` | plugin install progress |
| `elicitation_complete` | `EVENT_ELICITATION_COMPLETE` | `mcpServerName`, `elicitationId` | URL-mode elicitation finished |
| `control_request_progress` | `EVENT_CONTROL_REQUEST_PROGRESS` | `requestId`, `status`, `attempt?`, `maxRetries?`, `retryDelayMs?` | long-running control request |

#### Escape hatches

| Event | Constant | Key fields | Requires |
|---|---|---|---|
| `partial_message` | `EVENT_PARTIAL_MESSAGE` | `event` (raw provider delta), `parentToolUseId`, `ttftMs?`, `userMessageUuid?` | `includePartialMessages: true` |
| `system` | `EVENT_SYSTEM` | `subtype`, `data` | anything this version does not model |

### Reasoning and progress

Thinking arrives as full blocks (`thinking`) with a running token estimate
between them (`thinking_tokens`) — useful for a "still thinking…" indicator that
does not leak the reasoning itself.

```ts
import { Claude, EVENT_THINKING, EVENT_THINKING_TOKENS, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ thinking: { type: 'enabled', budgetTokens: 20_000 } })

await claude.stream('Design a migration plan')
  .on(EVENT_THINKING_TOKENS, (event) => process.stderr.write(`\rthinking… ${event.estimatedTokens} tokens`))
  .on(EVENT_THINKING, (event) => {
    if (event.redacted) console.error('\n[redacted reasoning]')
    else console.error(`\n[thinking] ${event.thinking.slice(0, 120)}…`)
  })
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .done()
```

### Context pressure

```ts
import { Claude, EVENT_CONTEXT_USAGE, EVENT_COMPACT_BOUNDARY } from '@scottwalker/kraube-konnektor'

await claude.stream('Refactor the whole package')
  .on(EVENT_CONTEXT_USAGE, ({ contextUsage }) => {
    if (contextUsage.percentage > 80) {
      console.warn(`context ${contextUsage.percentage}% of ${contextUsage.rawMaxTokens}`)
    }
  })
  .on(EVENT_COMPACT_BOUNDARY, (event) => {
    console.warn(`compacted (${event.trigger}): ${event.preTokens} → ${event.postTokens ?? '?'}`)
  })
  .done()
```

### Reliability signals

Rate limits, retries and model refusals all arrive as events instead of
exceptions, so a long-running turn can be observed rather than guessed at.

```ts
import {
  Claude,
  EVENT_RATE_LIMIT, EVENT_API_RETRY,
  EVENT_MODEL_REFUSAL_FALLBACK, EVENT_MODEL_REFUSAL_NO_FALLBACK,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({ model: 'opus', fallbackModel: ['sonnet', 'haiku'] })

await claude.stream('Summarize the incident report')
  .on(EVENT_RATE_LIMIT, (event) => {
    if (event.status === 'rejected') console.error(`quota exhausted (${event.rateLimitType})`)
    else if (event.status === 'allowed_warning') console.warn(`quota ${event.utilization ?? 0}% used`)
  })
  .on(EVENT_API_RETRY, (event) => {
    console.warn(`retry ${event.attempt}/${event.maxRetries} in ${event.retryDelayMs}ms (${event.errorStatus})`)
  })
  .on(EVENT_MODEL_REFUSAL_FALLBACK, (event) => {
    console.warn(`${event.originalModel} refused → ${event.fallbackModel} (${event.direction})`)
    // `retractedMessageUuids` names content the CLI withdrew — drop it from your own transcript
    for (const uuid of event.retractedMessageUuids ?? []) console.warn(`  retracted ${uuid}`)
  })
  .on(EVENT_MODEL_REFUSAL_NO_FALLBACK, (event) => {
    console.error(`${event.originalModel} refused with no fallback: ${event.refusalExplanation ?? ''}`)
  })
  .done()
```

### Permission denials and host notices

```ts
import {
  Claude, EVENT_PERMISSION_DENIED, EVENT_NOTIFICATION, EVENT_INFORMATIONAL,
} from '@scottwalker/kraube-konnektor'

await claude.stream('Deploy to staging')
  .on(EVENT_PERMISSION_DENIED, (event) => {
    console.warn(`denied ${event.toolName}: ${event.message} (${event.decisionReasonType ?? 'rule'})`)
  })
  .on(EVENT_NOTIFICATION, (event) => {
    if (event.priority === 'immediate' || event.priority === 'high') console.error(event.text)
  })
  .on(EVENT_INFORMATIONAL, (event) => console.log(`[${event.level}] ${event.content}`))
  .done()
```

The same denials are aggregated on the result event as `permissionDenials`, so a
batch job can report them once instead of subscribing.

### Background tasks

`backgroundTasks()` is the Ctrl+B affordance: it pushes the running tool call
into the background so the turn can continue.

```ts
import { Claude, EVENT_TOOL_PROGRESS, EVENT_BACKGROUND_TASKS_CHANGED } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ perTaskStopAffordance: true })

await claude.stream('Run the full test suite, then summarize failures')
  .on(EVENT_TOOL_PROGRESS, async (event) => {
    if (event.elapsedTimeSeconds > 120) await claude.backgroundTasks(event.toolUseId)
  })
  .on(EVENT_BACKGROUND_TASKS_CHANGED, (event) => {
    // level signal: swap your whole cached set for `event.tasks`
    for (const task of event.tasks) console.log(`[bg] ${task.taskId}: ${task.description}`)
  })
  .done()
```

---

## ChatHandle — Bidirectional Streaming

`claude.chat()` returns a `ChatHandle` — a persistent CLI process
(`--input-format stream-json`) for multi-turn real-time conversation.

`chat()` never goes through the executor: it owns its own process and carries
each turn's prompt on `send()`, so it behaves identically whether or not the
client was built with `useSdk: false`. It exposes the same `.on()` overloads as
`StreamHandle` — all 43 events — and reads its process output through the same
`parseStreamEvents()` reader `CliExecutor` uses, so a line carrying several
events (a `/context` turn's rendered table *and* its structured report, an
assistant line with both a thinking and a text block) dispatches all of them.

### Send and Await

`.send()` sends a prompt and returns a promise that resolves when the turn completes:

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

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

### Continuous Pipe

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

### ChatHandle Readable

```ts
const chat = claude.chat()
const readable = chat.toReadable()

// Pipe to any writable
readable.pipe(createWriteStream('output.txt'))

await chat.send('Generate documentation for every module')

chat.end()
```

### Node.js Duplex

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

### Chat Lifecycle

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

---

## Integration Patterns

### HTTP Streaming (Express)

Stream Claude's response directly to the HTTP client:

```ts
import express from 'express'

const app = express()
const claude = new Claude({ useSdk: false })

app.get('/ai/stream', (req, res) => {
  const prompt = req.query.prompt as string

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
  })

  claude.stream(prompt).toReadable().pipe(res)
})

app.get('/ai/query', async (req, res) => {
  const text = await claude.stream(req.query.prompt as string).text()
  res.json({ text })
})
```

### HTTP Streaming (Fastify)

```ts
import Fastify from 'fastify'

const app = Fastify()
const claude = new Claude({ useSdk: false })

app.get('/ai/stream', async (req, reply) => {
  const prompt = req.query.prompt as string

  reply.raw.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  })

  await claude.stream(prompt).pipe(reply.raw)
})
```

### Server-Sent Events (SSE)

Stream structured events to the browser:

```ts
import { EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR } from '@scottwalker/kraube-konnektor'

app.get('/ai/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  claude.stream(req.query.prompt as string)
    .on(EVENT_TEXT, (text) => {
      res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
    })
    .on(EVENT_TOOL_USE, (event) => {
      res.write(`data: ${JSON.stringify({ type: 'tool', tool: event.toolName })}\n\n`)
    })
    .on(EVENT_RESULT, (event) => {
      res.write(`data: ${JSON.stringify({ type: 'done', usage: event.usage })}\n\n`)
      res.end()
    })
    .on(EVENT_ERROR, (event) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: event.message })}\n\n`)
      res.end()
    })
    .done()
})
```

Browser consumer:

```js
const source = new EventSource('/ai/sse?prompt=Explain%20auth')

source.onmessage = (e) => {
  const data = JSON.parse(e.data)

  if (data.type === 'text') {
    document.getElementById('output').textContent += data.text
  } else if (data.type === 'done') {
    source.close()
  }
}
```

### WebSocket

Real-time bidirectional communication over WebSocket:

```ts
import { WebSocketServer } from 'ws'
import { Claude, EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT } from '@scottwalker/kraube-konnektor'

const wss = new WebSocketServer({ port: 8080 })
const claude = new Claude({ useSdk: false })

wss.on('connection', (ws) => {
  const chat = claude.chat()
    .on(EVENT_TEXT, (text) => {
      ws.send(JSON.stringify({ type: 'text', text }))
    })
    .on(EVENT_TOOL_USE, (event) => {
      ws.send(JSON.stringify({ type: 'tool', name: event.toolName }))
    })
    .on(EVENT_RESULT, (event) => {
      ws.send(JSON.stringify({ type: 'result', usage: event.usage }))
    })

  ws.on('message', async (data) => {
    const { prompt } = JSON.parse(data.toString())
    await chat.send(prompt)
  })

  ws.on('close', () => chat.end())
})
```

Browser consumer:

```js
const ws = new WebSocket('ws://localhost:8080')

ws.send(JSON.stringify({ prompt: 'What does this project do?' }))

ws.onmessage = (e) => {
  const data = JSON.parse(e.data)
  if (data.type === 'text') {
    document.getElementById('output').textContent += data.text
  }
}
```

### Write to File

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

### Compress with gzip/brotli

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

### pipeline()

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

### Transform Stream

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

```ts
// Markdown → HTML transform
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

### Pipe Between Processes

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

### Log to Multiple Destinations

```ts
import { createWriteStream } from 'node:fs'
import { EVENT_TEXT, EVENT_TOOL_USE } from '@scottwalker/kraube-konnektor'

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

### Progress Tracking

```ts
import { EVENT_TEXT, EVENT_TOOL_USE } from '@scottwalker/kraube-konnektor'

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

### Token Budget Monitoring

```ts
import { EVENT_TEXT, EVENT_RESULT } from '@scottwalker/kraube-konnektor'

const MAX_COST = 1.00 // $1 limit

const result = await claude.stream('Analyze the entire repo', { maxBudget: MAX_COST })
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_RESULT, (event) => {
    const pct = ((event.cost ?? 0) / MAX_COST * 100).toFixed(1)
    console.log(`\nBudget: $${event.cost} / $${MAX_COST} (${pct}%)`)

    // Did it finish, or did it run out?
    if (event.terminalReason === 'budget_exhausted') console.warn('budget exhausted')

    // Per-model breakdown, including the cache tokens that dominate long runs
    for (const [model, usage] of Object.entries(event.modelUsage ?? {})) {
      console.log(`  ${model}: $${usage.costUsd.toFixed(4)} (cache ${usage.cacheReadInputTokens}r)`)
    }
  })
  .done()
```

`maxBudget` is a hard stop in USD. `taskBudgetTokens` is the softer sibling: the
model is *told* how many tokens it has left, so it can pace its tool use.

### Tool Activity Logger

```ts
import { EVENT_TEXT, EVENT_TOOL_USE } from '@scottwalker/kraube-konnektor'

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

### Streaming in Sessions

Multi-turn streaming with context persistence:

```ts
import { EVENT_TEXT } from '@scottwalker/kraube-konnektor'

const session = claude.session()

// Turn 1 — stream
const text1 = await session.stream('Analyze the architecture')
  .on(EVENT_TEXT, (t) => process.stdout.write(t))
  .text()

console.log('\n---')

// Turn 2 — stream (Claude remembers turn 1)
const result = await session.stream('Now write tests for the weakest module')
  .on(EVENT_TEXT, (t) => process.stdout.write(t))
  .done()

console.log(`\nSession: ${session.sessionId}`)
```

### Parallel Streams

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

### Timeout and Abort

Prefer a per-query `AbortSignal` over `claude.abort()`: the signal cancels one
turn, while `abort()` tears the whole session down (SDK mode) or kills the
process (CLI mode).

```ts
import { Claude, EVENT_TEXT, EVENT_RESULT } from '@scottwalker/kraube-konnektor'

const claude = new Claude()

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 30_000)

try {
  const result = await claude.stream('Analyze everything', { signal: controller.signal })
    .on(EVENT_TEXT, (t) => process.stdout.write(t))
    // `stream()` does not throw on abort — the aborted result still arrives
    .on(EVENT_RESULT, (e) => console.log(`\n${e.terminalReason ?? 'done'}`))
    .done()

  clearTimeout(timer)
  console.log(`\nCompleted in ${result.durationMs}ms`)
} catch (err) {
  clearTimeout(timer)
  console.log('\nFailed:', (err as Error).message)
}
```

On abort, SDK mode interrupts the turn and keeps reading to the result, so the
session is ready for the next query; `terminalReason` is then
`'aborted_streaming'` or `'aborted_tools'`.

### Error Handling

```ts
import { CliNotFoundError, CliExecutionError, CliTimeoutError, EVENT_TEXT, EVENT_ERROR, EVENT_RESULT } from '@scottwalker/kraube-konnektor'

try {
  await claude.stream('Do something')
    .on(EVENT_TEXT, (t) => process.stdout.write(t))
    .on(EVENT_ERROR, (event) => {
      // Stream-level errors (Claude reports an issue)
      console.error(`\nStream error: ${event.message}`, event.code ?? '')
    })
    .on(EVENT_RESULT, (event) => {
      // Not every unhappy ending is an error — `terminalReason` says which it was
      if (event.terminalReason !== 'completed') console.warn(event.terminalReason)
    })
    .done()
} catch (err) {
  // Process-level errors
  if (err instanceof CliNotFoundError) {
    console.error('Claude CLI not installed')
  } else if (err instanceof CliTimeoutError) {
    console.error(`Timed out after ${err.timeoutMs}ms`)
  } else if (err instanceof CliExecutionError) {
    console.error(`CLI exit code ${err.exitCode}: ${err.stderr}`)
  }
}
```

### Telegram Bot

```ts
import TelegramBot from 'node-telegram-bot-api'
import { Claude, EVENT_TEXT, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN!, { polling: true })
const claude = new Claude({ useSdk: false, permissionMode: PERMISSION_PLAN })

bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const prompt = msg.text ?? ''

  // Send "thinking..." then edit with streamed response
  const sent = await bot.sendMessage(chatId, '...')
  let buffer = ''

  await claude.stream(prompt)
    .on(EVENT_TEXT, async (text) => {
      buffer += text
      // Throttle edits to avoid rate limits
      if (buffer.length % 200 < text.length) {
        await bot.editMessageText(buffer, { chat_id: chatId, message_id: sent.message_id })
      }
    })
    .done()

  // Final edit with complete text
  await bot.editMessageText(buffer, { chat_id: chatId, message_id: sent.message_id })
})
```

### Slack Bot

```ts
import { App } from '@slack/bolt'
import { Claude, EVENT_TEXT, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

const app = new App({ token: process.env.SLACK_TOKEN!, signingSecret: process.env.SLACK_SECRET! })
const claude = new Claude({ useSdk: false, permissionMode: PERMISSION_PLAN })

app.message(async ({ message, say }) => {
  const text = await claude.stream((message as any).text)
    .text()

  await say(text)
})

// Streaming variant — update message progressively
app.message('stream', async ({ message, client }) => {
  const result = await client.chat.postMessage({
    channel: (message as any).channel,
    text: '...',
  })

  let buffer = ''
  await claude.stream((message as any).text)
    .on(EVENT_TEXT, async (text) => {
      buffer += text
      if (buffer.length % 300 < text.length) {
        await client.chat.update({
          channel: (message as any).channel,
          ts: result.ts!,
          text: buffer,
        })
      }
    })
    .done()

  await client.chat.update({
    channel: (message as any).channel,
    ts: result.ts!,
    text: buffer,
  })
})
```

### CLI Tool with Spinner

```ts
import ora from 'ora'
import { EVENT_TEXT, EVENT_TOOL_USE } from '@scottwalker/kraube-konnektor'

const spinner = ora('Thinking...').start()
let hasText = false

const result = await claude.stream('Find and fix all bugs')
  .on(EVENT_TEXT, (text) => {
    if (!hasText) {
      spinner.stop()
      hasText = true
    }
    process.stdout.write(text)
  })
  .on(EVENT_TOOL_USE, (event) => {
    spinner.text = `Using ${event.toolName}...`
    if (!spinner.isSpinning) spinner.start()
    hasText = false
  })
  .done()

if (spinner.isSpinning) spinner.stop()
console.log(`\n✓ Done in ${result.durationMs}ms`)
```

### Interactive Chat REPL

```ts
import * as readline from 'node:readline'
import { EVENT_TEXT } from '@scottwalker/kraube-konnektor'

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

### CI/CD Pipeline Reporter

```ts
import { EVENT_TEXT, EVENT_TOOL_USE, PERMISSION_ACCEPT_EDITS } from '@scottwalker/kraube-konnektor'

const reportStream = createWriteStream('ci-report.txt')

const result = await claude.stream('Run all tests and report failures', {
  permissionMode: PERMISSION_ACCEPT_EDITS,
  allowedTools: ['Bash', 'Read', 'Glob', 'Grep'],
})
  .on(EVENT_TEXT, (text) => {
    process.stdout.write(text)
    reportStream.write(text)
  })
  .on(EVENT_TOOL_USE, (event) => {
    if (event.toolName === 'Bash') {
      const cmd = (event.toolInput as any).command ?? ''
      reportStream.write(`\n[CMD] ${cmd}\n`)
    }
  })
  .done()

reportStream.write(`\n\nExit: ${result.durationMs}ms, $${result.cost}\n`)
reportStream.end()

// Set CI exit code based on result
if (result.text.includes('FAIL')) process.exit(1)
```

### Electron IPC

Main process → renderer streaming via IPC:

```ts
// main.ts (Electron main process)
import { ipcMain } from 'electron'
import { EVENT_TEXT, EVENT_RESULT } from '@scottwalker/kraube-konnektor'

ipcMain.handle('ai:stream', async (event, prompt: string) => {
  await claude.stream(prompt)
    .on(EVENT_TEXT, (text) => {
      event.sender.send('ai:chunk', text)
    })
    .on(EVENT_RESULT, (result) => {
      event.sender.send('ai:done', {
        usage: result.usage,
        cost: result.cost,
      })
    })
    .done()
})
```

```ts
// renderer.ts (Electron renderer)
const { ipcRenderer } = require('electron')

ipcRenderer.on('ai:chunk', (_, text) => {
  document.getElementById('output')!.textContent += text
})

ipcRenderer.on('ai:done', (_, result) => {
  console.log('Done:', result)
})

ipcRenderer.invoke('ai:stream', 'Explain this code')
```

### Worker Threads

Offload streaming to a worker to keep the main thread free:

```ts
// worker.ts
import { parentPort, workerData } from 'node:worker_threads'
import { Claude, EVENT_TEXT, EVENT_RESULT } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ useSdk: false })

await claude.stream(workerData.prompt)
  .on(EVENT_TEXT, (text) => {
    parentPort!.postMessage({ type: 'text', text })
  })
  .on(EVENT_RESULT, (event) => {
    parentPort!.postMessage({ type: 'result', usage: event.usage, cost: event.cost })
  })
  .done()
```

```ts
// main.ts
import { Worker } from 'node:worker_threads'

const worker = new Worker('./worker.ts', {
  workerData: { prompt: 'Analyze the codebase' },
})

worker.on('message', (msg) => {
  if (msg.type === 'text') process.stdout.write(msg.text)
  if (msg.type === 'result') console.log('\nDone:', msg.usage)
})
```
