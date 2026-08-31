# Constants

Every string literal used as a discriminator, event name, CLI flag or protocol key is exported as a named constant. Use them instead of raw strings to prevent typos and enable IDE autocompletion.

```typescript
import {
  EVENT_TEXT,
  PERMISSION_PLAN,
  EFFORT_HIGH,
  HOOK_PRE_TOOL_USE,
  SCHED_RESULT,
} from '@scottwalker/kraube-konnektor'
```

## Event Types

The 43 stream event discriminators, used with [`StreamHandle.on()`](./stream-handle#on) and [`ChatHandle.on()`](./chat-handle#on). Each one is the `type` of the matching [`StreamEvent`](./types#streamevent) member.

### Content and results

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_TEXT` | `'text'` | Incremental text chunk |
| `EVENT_THINKING` | `'thinking'` | Extended-thinking block (plain or redacted) |
| `EVENT_THINKING_TOKENS` | `'thinking_tokens'` | Running token estimate while the model thinks |
| `EVENT_TOOL_USE` | `'tool_use'` | Tool invocation |
| `EVENT_TOOL_RESULT` | `'tool_result'` | Result of a tool invocation |
| `EVENT_TOOL_PROGRESS` | `'tool_progress'` | Tool still running |
| `EVENT_TOOL_USE_SUMMARY` | `'tool_use_summary'` | AI-generated summary of tool usage |
| `EVENT_RESULT` | `'result'` | Final result of the turn. Trailing informational frames (`prompt_suggestion`, `task_notification`, `session_state_changed`) can follow it |
| `EVENT_ERROR` | `'error'` | Error during execution |
| `EVENT_PARTIAL_MESSAGE` | `'partial_message'` | Token-level delta. Requires `includePartialMessages` |
| `EVENT_LOCAL_COMMAND_OUTPUT` | `'local_command_output'` | Output of a local slash command |

### Tasks

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_TASK_STARTED` | `'task_started'` | Subagent task created and started |
| `EVENT_TASK_PROGRESS` | `'task_progress'` | Progress update from a running task |
| `EVENT_TASK_NOTIFICATION` | `'task_notification'` | Task completed, failed or stopped |
| `EVENT_TASK_UPDATED` | `'task_updated'` | Patch applied to a task's state |
| `EVENT_BACKGROUND_TASKS_CHANGED` | `'background_tasks_changed'` | The background task list changed |

### Session and runtime

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_INIT` | `'init'` | Typed form of the init handshake |
| `EVENT_SYSTEM` | `'system'` | Catch-all for messages this version does not model |
| `EVENT_SESSION_STATE_CHANGED` | `'session_state_changed'` | Session state transition |
| `EVENT_STATUS` | `'status'` | Status change (including compaction results) |
| `EVENT_WORKER_SHUTTING_DOWN` | `'worker_shutting_down'` | The worker is going away |
| `EVENT_CONVERSATION_RESET` | `'conversation_reset'` | The conversation restarted under a new ID |
| `EVENT_MIRROR_ERROR` | `'mirror_error'` | A `sessionStore` mirror write failed |
| `EVENT_COMPACT_BOUNDARY` | `'compact_boundary'` | Context was compacted |
| `EVENT_CONTEXT_USAGE` | `'context_usage'` | Structured `/context` report |
| `EVENT_FILES_PERSISTED` | `'files_persisted'` | File checkpoint written |

### Resilience and quotas

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_RATE_LIMIT` | `'rate_limit'` | Quota window status |
| `EVENT_API_RETRY` | `'api_retry'` | An API call is being retried |
| `EVENT_MODEL_REFUSAL_FALLBACK` | `'model_refusal_fallback'` | The model refused; falling back |
| `EVENT_MODEL_REFUSAL_NO_FALLBACK` | `'model_refusal_no_fallback'` | The model refused with no fallback available |
| `EVENT_CONTROL_REQUEST_PROGRESS` | `'control_request_progress'` | A control request is retrying |

### Permissions, hooks and notices

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_PERMISSION_DENIED` | `'permission_denied'` | A tool call was denied |
| `EVENT_HOOK_STARTED` | `'hook_started'` | A hook started. Requires `includeHookEvents` |
| `EVENT_HOOK_PROGRESS` | `'hook_progress'` | Hook stdout/stderr. Requires `includeHookEvents` |
| `EVENT_HOOK_RESPONSE` | `'hook_response'` | Hook finished. Requires `includeHookEvents` |
| `EVENT_NOTIFICATION` | `'notification'` | Host-facing toast notification |
| `EVENT_INFORMATIONAL` | `'informational'` | Informational notice |
| `EVENT_PROMPT_SUGGESTION` | `'prompt_suggestion'` | Suggested follow-up. Requires `promptSuggestions` |
| `EVENT_AUTH_STATUS` | `'auth_status'` | MCP authentication status |

### Environment changes

| Constant | Value | Description |
|----------|-------|-------------|
| `EVENT_MEMORY_RECALL` | `'memory_recall'` | Memory files were recalled |
| `EVENT_COMMANDS_CHANGED` | `'commands_changed'` | The slash command list changed |
| `EVENT_PLUGIN_INSTALL` | `'plugin_install'` | A plugin install progressed |
| `EVENT_ELICITATION_COMPLETE` | `'elicitation_complete'` | An MCP elicitation was answered |

```typescript
import { EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT, EVENT_ERROR, EVENT_SYSTEM } from '@scottwalker/kraube-konnektor'

claude.stream('Analyze code')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TOOL_USE, (event) => console.log(event.toolName))
  .on(EVENT_RESULT, (event) => console.log(event.durationMs))
  .on(EVENT_ERROR, (event) => console.error(event.message))
  .on(EVENT_SYSTEM, (event) => console.log(event.subtype))
  .done()
```

## Hook Events

The 33 lifecycle events — see [Hooks](./hooks#hookevent) for what each one carries.

| Constant | Value | | Constant | Value |
|----------|-------|-|----------|-------|
| `HOOK_PRE_TOOL_USE` | `'PreToolUse'` | | `HOOK_SETUP` | `'Setup'` |
| `HOOK_POST_TOOL_USE` | `'PostToolUse'` | | `HOOK_TEAMMATE_IDLE` | `'TeammateIdle'` |
| `HOOK_POST_TOOL_USE_FAILURE` | `'PostToolUseFailure'` | | `HOOK_TASK_CREATED` | `'TaskCreated'` |
| `HOOK_POST_TOOL_BATCH` | `'PostToolBatch'` | | `HOOK_TASK_COMPLETED` | `'TaskCompleted'` |
| `HOOK_NOTIFICATION` | `'Notification'` | | `HOOK_ELICITATION` | `'Elicitation'` |
| `HOOK_USER_PROMPT_SUBMIT` | `'UserPromptSubmit'` | | `HOOK_ELICITATION_RESULT` | `'ElicitationResult'` |
| `HOOK_USER_PROMPT_EXPANSION` | `'UserPromptExpansion'` | | `HOOK_CONFIG_CHANGE` | `'ConfigChange'` |
| `HOOK_SESSION_START` | `'SessionStart'` | | `HOOK_WORKTREE_CREATE` | `'WorktreeCreate'` |
| `HOOK_SESSION_END` | `'SessionEnd'` | | `HOOK_WORKTREE_REMOVE` | `'WorktreeRemove'` |
| `HOOK_STOP` | `'Stop'` | | `HOOK_INSTRUCTIONS_LOADED` | `'InstructionsLoaded'` |
| `HOOK_STOP_FAILURE` | `'StopFailure'` | | `HOOK_CWD_CHANGED` | `'CwdChanged'` |
| `HOOK_SUBAGENT_START` | `'SubagentStart'` | | `HOOK_FILE_CHANGED` | `'FileChanged'` |
| `HOOK_SUBAGENT_STOP` | `'SubagentStop'` | | `HOOK_DIRECTORY_ADDED` | `'DirectoryAdded'` |
| `HOOK_PRE_COMPACT` | `'PreCompact'` | | `HOOK_MESSAGE_DISPLAY` | `'MessageDisplay'` |
| `HOOK_POST_COMPACT` | `'PostCompact'` | | `HOOK_PERMISSION_REQUEST` | `'PermissionRequest'` |
| `HOOK_PRE_MODEL_SWITCH` | `'PreModelSwitch'` | | `HOOK_PERMISSION_DENIED` | `'PermissionDenied'` |
| `HOOK_POST_MODEL_SWITCH` | `'PostModelSwitch'` | | | |

### Validation array

```typescript
import { VALID_HOOK_EVENTS } from '@scottwalker/kraube-konnektor'
// all 33 names, in SDK declaration order
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
| `PERMISSION_MANUAL` | `'manual'` | The CLI's own spelling of `'default'`; normalized to it before reaching the SDK |

```typescript
import { Claude, PERMISSION_PLAN, PERMISSION_AUTO } from '@scottwalker/kraube-konnektor'

// Read-only analysis
const analyst = new Claude({ permissionMode: PERMISSION_PLAN })

// Fully autonomous
const worker = new Claude({ permissionMode: PERMISSION_AUTO })
```

### Validation array

```typescript
import { VALID_PERMISSION_MODES } from '@scottwalker/kraube-konnektor'
// ['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions', 'auto', 'manual']
```

## Effort Levels

Control thinking depth. Used in [`ClientOptions.effortLevel`](./types#clientoptions) and [`QueryOptions.effortLevel`](./types#queryoptions).

| Constant | Value | Description |
|----------|-------|-------------|
| `EFFORT_LOW` | `'low'` | Quick, minimal thinking |
| `EFFORT_MEDIUM` | `'medium'` | Balanced (default) |
| `EFFORT_HIGH` | `'high'` | Deep analysis |
| `EFFORT_XHIGH` | `'xhigh'` | Above `high`. Added in 0.7.0 |
| `EFFORT_MAX` | `'max'` | Maximum depth |

```typescript
import { Claude, EFFORT_HIGH, EFFORT_LOW } from '@scottwalker/kraube-konnektor'

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
import { VALID_EFFORT_LEVELS } from '@scottwalker/kraube-konnektor'
// ['low', 'medium', 'high', 'xhigh', 'max']
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
import { SCHED_RESULT, SCHED_ERROR, SCHED_TICK, SCHED_STOP } from '@scottwalker/kraube-konnektor'

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

Stage values emitted by `INIT_EVENT_STAGE`, typed as `InitStage`. These are plain values, not exported constants.

| Value | Description |
|-------|-------------|
| `'importing'` | Importing SDK module |
| `'creating'` | Creating SDK session |
| `'connecting'` | Connecting to Claude |
| `'ready'` | Session is ready |

```typescript
import { Claude, INIT_EVENT_STAGE, INIT_EVENT_READY, INIT_EVENT_ERROR } from '@scottwalker/kraube-konnektor'

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
| `BLOCK_THINKING` | `'thinking'` | Extended-thinking block |
| `BLOCK_REDACTED_THINKING` | `'redacted_thinking'` | Encrypted thinking block that cannot be displayed |

```typescript
import { BLOCK_TEXT, BLOCK_TOOL_USE, BLOCK_TOOL_RESULT } from '@scottwalker/kraube-konnektor'

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
| `FORMAT_TEXT` | `'text'` | Plain text |
| `FORMAT_JSON` | `'json'` | Single JSON response (`query()`) |
| `FORMAT_STREAM_JSON` | `'stream-json'` | NDJSON streaming (`stream()`, `chat()`) |

## Message Roles

Values of [`Message.role`](./types#message). Plain values, not exported constants.

| Value | Description |
|-------|-------------|
| `'user'` | User message |
| `'assistant'` | Assistant message |

## MCP Transport Types

| Constant | Value | Description |
|----------|-------|-------------|
| `MCP_STDIO` | `'stdio'` | Standard I/O transport |
| `MCP_HTTP` | `'http'` | HTTP transport |
| `MCP_SSE` | `'sse'` | Server-Sent Events transport |
| `MCP_SDK` | `'sdk'` | In-process server created with `createSdkMcpServer()` |
| `MCP_CLAUDEAI_PROXY` | `'claudeai-proxy'` | Connector proxied through claude.ai. Reported by [`mcpServerStatus()`](./#mcpserverstatus), never configured directly |

### Validation array

```typescript
import { VALID_MCP_TRANSPORTS } from '@scottwalker/kraube-konnektor'
// ['stdio', 'http', 'sse', 'sdk', 'claudeai-proxy']
```

## System Event Subtypes

Values of `StreamSystemEvent.subtype` produced by this library itself, as opposed to the CLI's own subtypes which are passed through verbatim.

| Value | Description |
|-------|-------------|
| `'stderr'` | Stderr output from the subprocess |
| `'init'` | Initialization message not modelled as [`EVENT_INIT`](#session-and-runtime) |
| `'unknown'` | Message with no recognizable discriminator |

## Result Subtypes

Values of [`QueryResult.subtype`](./types#resultsubtype) and `StreamResultEvent.subtype`.

| Constant | Value |
|----------|-------|
| `RESULT_SUCCESS` | `'success'` |
| `RESULT_ERROR_DURING_EXECUTION` | `'error_during_execution'` |
| `RESULT_ERROR_MAX_TURNS` | `'error_max_turns'` |
| `RESULT_ERROR_MAX_BUDGET_USD` | `'error_max_budget_usd'` |
| `RESULT_ERROR_MAX_STRUCTURED_OUTPUT_RETRIES` | `'error_max_structured_output_retries'` |

### Validation arrays

```typescript
import {
  VALID_RESULT_SUBTYPES,   // the five values above
  VALID_TERMINAL_REASONS,  // 19 reasons the agent loop can stop
  VALID_RATE_LIMIT_TYPES,  // 6 quota windows: five_hour, seven_day, overage, ...
} from '@scottwalker/kraube-konnektor'
```

## SDK-mirrored Literals

Literals the SDK defines and this library re-exports so you never have to type them.

| Constant | Value | Use |
|----------|-------|-----|
| `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` | `'__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'` | Marker element in the array form of `systemPrompt`. Everything before it is a cacheable prefix, everything after is per-run context |
| `RESUME_REJECTED_PREFIX` | `'Resume rejected by --resume-drops-turn:'` | Prefix of the CLI's refusal when `resumeDropsTurn` does not match. Deterministic — route to a rewind path, never retry |
| `BETA_CONTEXT_1M` | `'context-1m-2025-08-07'` | 1M-token context beta, for `betas` |

```typescript
import { Claude, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, BETA_CONTEXT_1M } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  betas: [BETA_CONTEXT_1M],
  systemPrompt: ['You are a reviewer.', SYSTEM_PROMPT_DYNAMIC_BOUNDARY, `Repo: ${repo}`],
})
```

## Interval Units

Suffixes accepted by [`claude.loop()`](./#loop) — `'30s'`, `'5m'`, `'2h'`, `'1d'`.

| Value | Multiplier |
|-------|------------|
| `'s'` | 1,000 ms |
| `'m'` | 60,000 ms |
| `'h'` | 3,600,000 ms |
| `'d'` | 86,400,000 ms |

## Default Values

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_EXECUTABLE` | `'claude'` | Default CLI binary name |
| `DEFAULT_MODEL` | `'sonnet'` | Model used when `model` is omitted |
| `DEFAULT_TIMEOUT_MS` | `600000` | CLI-mode process timeout (10 minutes) |
| `DEFAULT_INIT_TIMEOUT_MS` | `120000` | SDK warm-up timeout (2 minutes), overridable with `initTimeoutMs` |
| `DEFAULT_MAX_BUFFER_BYTES` | `104857600` | stdout buffer cap for a spawned CLI process (100 MB) |

## Rate-limit message prefixes

The SDK's four prefix tables are **runtime** values, not literals, so they are
not constants on this page — they are fetched through one lazy accessor rather
than being copied into this package and going stale:

```typescript
import { getUsageLimitPrefixes } from '@scottwalker/kraube-konnektor'

const {
  USAGE_LIMIT_ERROR_PREFIXES,   // hard stop — the account is out of usage
  USAGE_WARNING_PREFIXES,       // a limit is approaching; the run continues
  USAGE_TRANSITION_PREFIXES,    // switched to a different allocation, e.g. extra usage
  ORG_POLICY_LIMIT_PREFIXES,    // an org policy block, not an exhausted budget
} = await getUsageLimitPrefixes()

const isHardStop = USAGE_LIMIT_ERROR_PREFIXES.some((p) => message.startsWith(p))
```

The return type is [`UsageLimitPrefixes`](./types).
