# StreamHandle

A streaming response handle with fluent callback API and Node.js stream support. Returned from [`claude.stream()`](./#stream) and [`session.stream()`](./session#methods).

```typescript
import { Claude, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

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
on(type: EventName, callback: (event: MatchingStreamEvent) => void): this
```

Register a callback for one event type. Returns `this` for chaining; multiple callbacks per type are supported.

There is one overload per member of the [`StreamEvent`](./types#streamevent) union — 43 in total — so the callback parameter is narrowed to exactly that event. Passing an `EVENT_*` constant is enough for TypeScript to infer it.

::: tip
The `EVENT_TEXT` callback receives just the text string, for convenience. Every other callback receives the full event object.
:::

::: warning Callback errors are contained
A throwing callback does not break the stream for the other callbacks — dispatch is guarded per callback.
:::

```typescript
import {
  Claude, EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR, EVENT_SYSTEM,
} from '@scottwalker/kraube-konnektor'

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
    if (event.isError) console.error(`Failed: ${event.subtype} (${event.terminalReason})`)
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

Every constant below is a valid first argument to `.on()`. Grouped the same way as the [`StreamEvent`](./types#streamevent) reference, which carries each event's full field list.

### Content and results

| Event | Constant | Callback |
|-------|----------|----------|
| `'text'` | `EVENT_TEXT` | `(text: string) => void` |
| `'thinking'` | `EVENT_THINKING` | `(event: StreamThinkingEvent) => void` |
| `'thinking_tokens'` | `EVENT_THINKING_TOKENS` | `(event: StreamThinkingTokensEvent) => void` |
| `'tool_use'` | `EVENT_TOOL_USE` | `(event: StreamToolUseEvent) => void` |
| `'tool_result'` | `EVENT_TOOL_RESULT` | `(event: StreamToolResultEvent) => void` |
| `'tool_progress'` | `EVENT_TOOL_PROGRESS` | `(event: StreamToolProgressEvent) => void` |
| `'tool_use_summary'` | `EVENT_TOOL_USE_SUMMARY` | `(event: StreamToolUseSummaryEvent) => void` |
| `'result'` | `EVENT_RESULT` | `(event: StreamResultEvent) => void` |
| `'error'` | `EVENT_ERROR` | `(event: StreamErrorEvent) => void` |
| `'partial_message'` | `EVENT_PARTIAL_MESSAGE` | `(event: StreamPartialMessageEvent) => void` |
| `'local_command_output'` | `EVENT_LOCAL_COMMAND_OUTPUT` | `(event: StreamLocalCommandOutputEvent) => void` |

### Tasks and subagents

| Event | Constant | Callback |
|-------|----------|----------|
| `'task_started'` | `EVENT_TASK_STARTED` | `(event: StreamTaskStartedEvent) => void` |
| `'task_progress'` | `EVENT_TASK_PROGRESS` | `(event: StreamTaskProgressEvent) => void` |
| `'task_notification'` | `EVENT_TASK_NOTIFICATION` | `(event: StreamTaskNotificationEvent) => void` |
| `'task_updated'` | `EVENT_TASK_UPDATED` | `(event: StreamTaskUpdatedEvent) => void` |
| `'background_tasks_changed'` | `EVENT_BACKGROUND_TASKS_CHANGED` | `(event: StreamBackgroundTasksChangedEvent) => void` |

### Session and runtime

| Event | Constant | Callback |
|-------|----------|----------|
| `'init'` | `EVENT_INIT` | `(event: StreamInitEvent) => void` |
| `'system'` | `EVENT_SYSTEM` | `(event: StreamSystemEvent) => void` |
| `'session_state_changed'` | `EVENT_SESSION_STATE_CHANGED` | `(event: StreamSessionStateChangedEvent) => void` |
| `'status'` | `EVENT_STATUS` | `(event: StreamStatusEvent) => void` |
| `'worker_shutting_down'` | `EVENT_WORKER_SHUTTING_DOWN` | `(event: StreamWorkerShuttingDownEvent) => void` |
| `'conversation_reset'` | `EVENT_CONVERSATION_RESET` | `(event: StreamConversationResetEvent) => void` |
| `'mirror_error'` | `EVENT_MIRROR_ERROR` | `(event: StreamMirrorErrorEvent) => void` |
| `'compact_boundary'` | `EVENT_COMPACT_BOUNDARY` | `(event: StreamCompactBoundaryEvent) => void` |
| `'context_usage'` | `EVENT_CONTEXT_USAGE` | `(event: StreamContextUsageEvent) => void` |
| `'files_persisted'` | `EVENT_FILES_PERSISTED` | `(event: StreamFilesPersistedEvent) => void` |

### Resilience and quotas

| Event | Constant | Callback |
|-------|----------|----------|
| `'rate_limit'` | `EVENT_RATE_LIMIT` | `(event: StreamRateLimitEvent) => void` |
| `'api_retry'` | `EVENT_API_RETRY` | `(event: StreamApiRetryEvent) => void` |
| `'model_refusal_fallback'` | `EVENT_MODEL_REFUSAL_FALLBACK` | `(event: StreamModelRefusalFallbackEvent) => void` |
| `'model_refusal_no_fallback'` | `EVENT_MODEL_REFUSAL_NO_FALLBACK` | `(event: StreamModelRefusalNoFallbackEvent) => void` |
| `'control_request_progress'` | `EVENT_CONTROL_REQUEST_PROGRESS` | `(event: StreamControlRequestProgressEvent) => void` |

### Permissions, hooks and notices

| Event | Constant | Callback |
|-------|----------|----------|
| `'permission_denied'` | `EVENT_PERMISSION_DENIED` | `(event: StreamPermissionDeniedEvent) => void` |
| `'hook_started'` | `EVENT_HOOK_STARTED` | `(event: StreamHookStartedEvent) => void` |
| `'hook_progress'` | `EVENT_HOOK_PROGRESS` | `(event: StreamHookProgressEvent) => void` |
| `'hook_response'` | `EVENT_HOOK_RESPONSE` | `(event: StreamHookResponseEvent) => void` |
| `'notification'` | `EVENT_NOTIFICATION` | `(event: StreamNotificationEvent) => void` |
| `'informational'` | `EVENT_INFORMATIONAL` | `(event: StreamInformationalEvent) => void` |
| `'prompt_suggestion'` | `EVENT_PROMPT_SUGGESTION` | `(event: StreamPromptSuggestionEvent) => void` |
| `'auth_status'` | `EVENT_AUTH_STATUS` | `(event: StreamAuthStatusEvent) => void` |

### Environment changes

| Event | Constant | Callback |
|-------|----------|----------|
| `'memory_recall'` | `EVENT_MEMORY_RECALL` | `(event: StreamMemoryRecallEvent) => void` |
| `'commands_changed'` | `EVENT_COMMANDS_CHANGED` | `(event: StreamCommandsChangedEvent) => void` |
| `'plugin_install'` | `EVENT_PLUGIN_INSTALL` | `(event: StreamPluginInstallEvent) => void` |
| `'elicitation_complete'` | `EVENT_ELICITATION_COMPLETE` | `(event: StreamElicitationCompleteEvent) => void` |

See [StreamEvent types](./types#streamevent) for the full field list of each event.

#### Task Event Example

```typescript
import {
  Claude,
  EVENT_TASK_STARTED, EVENT_TASK_PROGRESS, EVENT_TASK_NOTIFICATION,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const result = await claude.stream('Run all agents on this codebase')
  .on(EVENT_TASK_STARTED, (event) => {
    console.log(`Task ${event.taskId} started: ${event.description}`)
  })
  .on(EVENT_TASK_PROGRESS, (event) => {
    console.log(`Task ${event.taskId}: ${event.description}`)
  })
  .on(EVENT_TASK_NOTIFICATION, (event) => {
    console.log(`Task ${event.taskId} [${event.status}]: ${event.summary}`)
  })
  .done()
```

#### Reasoning Example

```typescript
import { Claude, EVENT_THINKING, EVENT_THINKING_TOKENS } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ thinking: { type: 'enabled', budgetTokens: 8000 } })

await claude.stream('Design a migration plan')
  .on(EVENT_THINKING_TOKENS, (e) => process.stderr.write(`\rthinking: ${e.estimatedTokens}`))
  .on(EVENT_THINKING, (e) => {
    if (!e.redacted) console.log(`\n[reasoning] ${e.thinking}`)
  })
  .done()
```

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
import { EVENT_RESULT } from '@scottwalker/kraube-konnektor'

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
import { EVENT_TEXT, EVENT_TOOL_USE } from '@scottwalker/kraube-konnektor'

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
