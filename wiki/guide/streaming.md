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
} from '@scottwalker/kraube-konnektor'

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
import { Claude, EVENT_TOOL_USE } from '@scottwalker/kraube-konnektor'

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
} from '@scottwalker/kraube-konnektor'

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
import { Claude, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

const claude = new Claude()

let fullText = ''

for await (const event of claude.stream('Summarize README.md')) {
  if (event.type === EVENT_TEXT) fullText += event.text
}

console.log(fullText)
```

## Stream Events Reference

43 typed events. The table below groups the ones you are most likely to handle; the [`StreamEvent`](../api/types#streamevent) reference lists every field of every one, and the [Event Callbacks](../api/stream-handle#event-callbacks) tables list every constant `.on()` accepts.

### Always on

| Event | Constant | Callback |
|-------|----------|----------|
| `text` | `EVENT_TEXT` | `(text: string)` |
| `thinking` | `EVENT_THINKING` | `(event: { thinking, signature?, redacted })` |
| `thinking_tokens` | `EVENT_THINKING_TOKENS` | `(event: { estimatedTokens, estimatedTokensDelta? })` |
| `tool_use` | `EVENT_TOOL_USE` | `(event: { toolName, toolInput })` |
| `tool_result` | `EVENT_TOOL_RESULT` | `(event: { toolUseId, content, isError? })` |
| `tool_progress` | `EVENT_TOOL_PROGRESS` | `(event: { toolUseId, toolName, elapsedTimeSeconds })` |
| `tool_use_summary` | `EVENT_TOOL_USE_SUMMARY` | `(event: { summary, precedingToolUseIds })` |
| `result` | `EVENT_RESULT` | `(event: { text, sessionId, usage, cost, durationMs, subtype, isError?, … })` — last of the turn's own events; trailing informational frames can still follow |
| `error` | `EVENT_ERROR` | `(event: { message, code?, aborted?, requestId? })` |
| `init` | `EVENT_INIT` | `(event: { model, cwd, tools, mcpServers?, agents?, … })` |
| `system` | `EVENT_SYSTEM` | `(event: { subtype, data })` — catch-all for anything unmodelled |
| `compact_boundary` | `EVENT_COMPACT_BOUNDARY` | `(event: { trigger, preTokens, postTokens? })` |
| `context_usage` | `EVENT_CONTEXT_USAGE` | `(event: { contextUsage })` |
| `rate_limit` | `EVENT_RATE_LIMIT` | `(event: { status, rateLimitType?, utilization?, resetsAt? })` |
| `api_retry` | `EVENT_API_RETRY` | `(event: { attempt, maxRetries?, retryDelayMs? })` |
| `permission_denied` | `EVENT_PERMISSION_DENIED` | `(event: { toolName, decisionReason? })` |
| `notification` | `EVENT_NOTIFICATION` | `(event: { text, priority?, color? })` |
| `files_persisted` | `EVENT_FILES_PERSISTED` | `(event: { files, failed, processedAt })` |
| `local_command_output` | `EVENT_LOCAL_COMMAND_OUTPUT` | `(event: { content })` |
| `auth_status` | `EVENT_AUTH_STATUS` | `(event: { isAuthenticating, output?, error? })` |

### Opt-in

| Event | Constant | Requires |
|-------|----------|----------|
| `partial_message` | `EVENT_PARTIAL_MESSAGE` | `includePartialMessages: true` |
| `hook_started` / `hook_progress` / `hook_response` | `EVENT_HOOK_STARTED`, … | `includeHookEvents: true` |
| `prompt_suggestion` | `EVENT_PROMPT_SUGGESTION` | `promptSuggestions: true` — arrives after the turn's `result`, so SDK mode needs a `postResultDrainMs` window wide enough to catch it |

### Subagents, environment and lifecycle

`task_started`, `task_progress`, `task_notification`, `task_updated`, `background_tasks_changed`, `session_state_changed`, `status`, `worker_shutting_down`, `conversation_reset`, `mirror_error`, `informational`, `memory_recall`, `commands_changed`, `plugin_install`, `elicitation_complete`, `control_request_progress`, `model_refusal_fallback`, `model_refusal_no_fallback`.

::: tip Nothing is dropped
Messages the parser does not recognize are forwarded as `EVENT_SYSTEM` with the raw payload in `data`, so a newer CLI never silently loses information.
:::

## Watching the Model Think

```ts
import { Claude, EVENT_THINKING, EVENT_THINKING_TOKENS } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ thinking: { type: 'enabled', budgetTokens: 8_000 } })

await claude.stream('Design a migration plan')
  .on(EVENT_THINKING_TOKENS, (e) => process.stderr.write(`\rthinking: ${e.estimatedTokens} tokens`))
  .on(EVENT_THINKING, (e) => {
    // redacted blocks carry encrypted text that cannot be displayed
    if (!e.redacted) console.log(`\n[reasoning] ${e.thinking}`)
  })
  .done()
```

## Distinguishing Failure Modes

`result.subtype` carries the CLI's exact verdict, and `terminalReason` says why the loop stopped:

```ts
import { Claude, EVENT_RESULT, RESULT_ERROR_MAX_TURNS, RESULT_ERROR_MAX_BUDGET_USD } from '@scottwalker/kraube-konnektor'

await claude.stream('Refactor the whole module', { maxTurns: 5 })
  .on(EVENT_RESULT, (event) => {
    if (!event.isError) return
    switch (event.subtype) {
      case RESULT_ERROR_MAX_TURNS:      console.error('ran out of turns'); break
      case RESULT_ERROR_MAX_BUDGET_USD: console.error('ran out of budget'); break
      default:                          console.error(event.errors?.join('\n'))
    }
    console.error('stopped because:', event.terminalReason)
  })
  .done()
```

::: warning Changed in 0.7.0
`subtype` used to collapse every `error_*` value to `'error'`. It is now passed through verbatim.
:::

## Progress Tracking

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

## Tool Activity Logger

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

## Token Budget Monitoring

```ts
import { EVENT_TEXT, EVENT_RESULT } from '@scottwalker/kraube-konnektor'

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
import { Claude, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

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

## Task Events

Track subagent lifecycle with `task_started`, `task_progress`, and `task_notification` events:

```ts
import {
  Claude,
  EVENT_TEXT,
  EVENT_TASK_STARTED,
  EVENT_TASK_PROGRESS,
  EVENT_TASK_NOTIFICATION,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()

const result = await claude.stream('Refactor the entire src/ directory')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TASK_STARTED, (event) => {
    console.log(`\n[Task started: ${event.description}] id=${event.taskId}`)
  })
  .on(EVENT_TASK_PROGRESS, (event) => {
    console.log(`\n[Task ${event.taskId}] ${event.description}`)
    console.log(`  Tokens: ${event.usage.totalTokens}, Tools: ${event.usage.toolUses}`)
    if (event.summary) console.log(`  Summary: ${event.summary}`)
  })
  .on(EVENT_TASK_NOTIFICATION, (event) => {
    console.log(`\n[Task ${event.taskId} ${event.status}] ${event.summary}`)
  })
  .done()
```

## Per-Query Abort with `signal`

Cancel a specific stream without affecting other queries:

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const controller = new AbortController()

// Abort after 15 seconds
setTimeout(() => controller.abort(), 15_000)

try {
  const result = await claude.stream('Analyze the full codebase', {
    signal: controller.signal,
  })
    .on(EVENT_TEXT, (t) => process.stdout.write(t))
    .done()
} catch (err) {
  console.log('\nStream aborted')
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
