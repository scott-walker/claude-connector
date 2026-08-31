# Hooks

Hooks let you observe and steer a run at 33 lifecycle points — before a tool call, after a compaction, when a file changes, when the model is about to be switched.

There are two ways to attach one, and they are different mechanisms rather than two spellings of the same thing:

| | [`hookCallbacks`](#hookcallback) | [`hooks`](#hooksconfig) |
|---|---|---|
| What runs | A JS function, in your process | A command, prompt, agent, HTTP endpoint or MCP tool |
| Mode | SDK | CLI |
| Configured with | [`HookCallbackMatcher`](#hookcallbackmatcher) | [`HookMatcher`](#hookmatcher) + [`HookEntry`](#hookentry) |
| Delivered as | Direct call | The `--settings` payload |

```typescript
import { Claude, HOOK_PRE_TOOL_USE } from '@scottwalker/kraube-konnektor'
import type { HookInput, HookJSONOutput } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  hookCallbacks: {
    [HOOK_PRE_TOOL_USE]: [{
      matcher: 'Bash',
      hooks: [async (input): Promise<HookJSONOutput> => {
        if (input.hook_event_name !== 'PreToolUse') return {}
        const cmd = String((input.tool_input as { command?: string }).command ?? '')
        return cmd.includes('rm -rf')
          ? { decision: 'block', reason: 'Destructive command blocked' }
          : { continue: true }
      }],
    }],
  },
})
```

## Naming conventions

Three vocabularies live here and they do not share a convention. This is protocol, not an oversight — do not "fix" one side to match the other.

| | Case | Example |
|---|---|---|
| Hook **inputs** — what the CLI sends to a hook | `snake_case` | `tool_name`, `hook_event_name`, `old_cwd` |
| Hook **outputs** — what a hook returns | `camelCase` | `hookEventName`, `additionalContext`, `permissionDecision` |
| Shell-command hook **config** | `camelCase` | `statusMessage`, `asyncRewake`, `allowedEnvVars` |

## HookEvent

The 33 lifecycle events the CLI can dispatch. Every name has a `HOOK_*` constant, and `VALID_HOOK_EVENTS` is the runtime array.

```typescript
type HookEvent = (typeof VALID_HOOK_EVENTS)[number]
```

### Tools

| Event | Constant | Fires |
|-------|----------|-------|
| `PreToolUse` | `HOOK_PRE_TOOL_USE` | Before a tool call. The only event that can allow, deny, `ask`, `defer` or rewrite the call |
| `PostToolUse` | `HOOK_POST_TOOL_USE` | After a tool call succeeds |
| `PostToolUseFailure` | `HOOK_POST_TOOL_USE_FAILURE` | After a tool call fails or is interrupted |
| `PostToolBatch` | `HOOK_POST_TOOL_BATCH` | After a batch of parallel tool calls |
| `PermissionRequest` | `HOOK_PERMISSION_REQUEST` | When a tool call needs approval |
| `PermissionDenied` | `HOOK_PERMISSION_DENIED` | After a tool call was denied; may request a retry |

### Conversation

| Event | Constant | Fires |
|-------|----------|-------|
| `UserPromptSubmit` | `HOOK_USER_PROMPT_SUBMIT` | When a user prompt is submitted |
| `UserPromptExpansion` | `HOOK_USER_PROMPT_EXPANSION` | When a slash command or alias is expanded into a prompt |
| `Stop` | `HOOK_STOP` | When the main loop stops |
| `StopFailure` | `HOOK_STOP_FAILURE` | When the loop stops because of an error |
| `SubagentStart` | `HOOK_SUBAGENT_START` | When a subagent starts |
| `SubagentStop` | `HOOK_SUBAGENT_STOP` | When a subagent stops |
| `MessageDisplay` | `HOOK_MESSAGE_DISPLAY` | Before an assistant message is displayed; can rewrite the rendered text |
| `Notification` | `HOOK_NOTIFICATION` | When the CLI raises a notification |

### Session and context

| Event | Constant | Fires |
|-------|----------|-------|
| `SessionStart` | `HOOK_SESSION_START` | When a session starts or resumes |
| `SessionEnd` | `HOOK_SESSION_END` | When a session ends |
| `Setup` | `HOOK_SETUP` | On first-run setup |
| `PreCompact` | `HOOK_PRE_COMPACT` | Before context compaction |
| `PostCompact` | `HOOK_POST_COMPACT` | After context compaction |
| `PreModelSwitch` | `HOOK_PRE_MODEL_SWITCH` | Before the model changes; can veto the switch |
| `PostModelSwitch` | `HOOK_POST_MODEL_SWITCH` | After the model changed |
| `ConfigChange` | `HOOK_CONFIG_CHANGE` | When a settings file changes |
| `InstructionsLoaded` | `HOOK_INSTRUCTIONS_LOADED` | When a CLAUDE.md / memory file is loaded |

### Environment

| Event | Constant | Fires |
|-------|----------|-------|
| `CwdChanged` | `HOOK_CWD_CHANGED` | When the working directory changes |
| `FileChanged` | `HOOK_FILE_CHANGED` | When a watched file changes |
| `DirectoryAdded` | `HOOK_DIRECTORY_ADDED` | When a directory joins the workspace |
| `WorktreeCreate` | `HOOK_WORKTREE_CREATE` | When a git worktree is created |
| `WorktreeRemove` | `HOOK_WORKTREE_REMOVE` | When a git worktree is removed |

### Teams, tasks and MCP

| Event | Constant | Fires |
|-------|----------|-------|
| `TeammateIdle` | `HOOK_TEAMMATE_IDLE` | When a teammate goes idle |
| `TaskCreated` | `HOOK_TASK_CREATED` | When a task is created |
| `TaskCompleted` | `HOOK_TASK_COMPLETED` | When a task completes |
| `Elicitation` | `HOOK_ELICITATION` | When an MCP server asks the user for input |
| `ElicitationResult` | `HOOK_ELICITATION_RESULT` | When that request is answered |

## HookInput

A discriminated union of 33 per-event interfaces. Switch on `hook_event_name` and the event-specific fields narrow.

```typescript
import type { HookInput, HookJSONOutput } from '@scottwalker/kraube-konnektor'

async function audit(input: HookInput): Promise<HookJSONOutput> {
  switch (input.hook_event_name) {
    case 'PreToolUse':
      // narrowed: tool_name / tool_input / tool_use_id are typed here
      return input.tool_name === 'Bash'
        ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' } }
        : { continue: true }
    case 'FileChanged':
      // narrowed: file_path / event
      return { hookSpecificOutput: { hookEventName: 'FileChanged', watchPaths: [input.file_path] } }
    default:
      return { continue: true }
  }
}
```

### BaseHookInput

Every input carries these, in `snake_case` straight off the wire.

```typescript
interface BaseHookInput {
  readonly session_id: string
  readonly transcript_path: string
  readonly cwd: string
  readonly prompt_id?: string
  readonly permission_mode?: string
  readonly agent_id?: string
  readonly agent_type?: string
  readonly effort?: string
}
```

### Per-event fields

| Event | Adds |
|-------|------|
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, `duration_ms` |
| `PostToolUseFailure` | `tool_name`, `tool_input`, `tool_use_id`, `error`, `is_interrupt`, `duration_ms` |
| `PostToolBatch` | `tool_calls` |
| `PermissionRequest` | `tool_name`, `tool_input`, `permission_suggestions` |
| `PermissionDenied` | `tool_name`, `tool_input`, `tool_use_id`, `reason` |
| `Notification` | `message`, `title`, `notification_type` |
| `UserPromptSubmit` | `prompt`, `source`, `session_title` |
| `UserPromptExpansion` | `expansion_type`, `command_name`, `command_args`, `command_source`, `prompt` |
| `SessionStart` | `source`, `agent_type`, `model`, `session_title`, `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd` |
| `SessionEnd` | `reason` |
| `Stop` | `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons` |
| `StopFailure` | `error`, `error_details`, `last_assistant_message` |
| `SubagentStart` | `agent_id`, `agent_type` |
| `SubagentStop` | `stop_hook_active`, `agent_id`, `agent_transcript_path`, `agent_type`, `last_assistant_message`, `background_tasks`, `session_crons` |
| `PreCompact` | `trigger`, `custom_instructions` |
| `PostCompact` | `trigger`, `compact_summary` |
| `PreModelSwitch` / `PostModelSwitch` | `from_model`, `to_model`, `requested_model`, `source`, `context_tokens`, `prompt_cache_warm`, `cache_ttl`, `estimated_cache_write_usd`, `pricing` |
| `Setup` | `trigger` |
| `TeammateIdle` | `teammate_name`, `team_name` |
| `TaskCreated` / `TaskCompleted` | `task_id`, `task_subject`, `task_description`, `teammate_name`, `team_name` |
| `Elicitation` | `mcp_server_name`, `message`, `mode`, `url`, `elicitation_id`, `requested_schema` |
| `ElicitationResult` | `mcp_server_name`, `elicitation_id`, `mode`, `action`, `content` |
| `ConfigChange` | `source`, `file_path` |
| `InstructionsLoaded` | `file_path`, `memory_type`, `load_reason`, `globs`, `trigger_file_path`, `parent_file_path` |
| `WorktreeCreate` | `name` |
| `WorktreeRemove` | `worktree_path` |
| `CwdChanged` | `old_cwd`, `new_cwd` |
| `FileChanged` | `file_path`, `event` |
| `DirectoryAdded` | `directory`, `source` |
| `MessageDisplay` | `turn_id`, `message_id`, `index`, `final`, `delta` |

### UnknownHookInput

Escape hatch for payloads this version does not model. Deliberately **not** a member of `HookInput` — an index signature there would defeat `switch` narrowing.

```typescript
type UnknownHookInput = BaseHookInput & {
  readonly hook_event_name: string
  readonly [key: string]: unknown
}

const raw = input as unknown as UnknownHookInput
const extra = raw['some_future_field']
```

## HookJSONOutput

What a hook returns — either an immediate result or an acknowledgement that the work continues in the background.

```typescript
type HookJSONOutput = SyncHookJSONOutput | AsyncHookJSONOutput
```

### SyncHookJSONOutput

Every field is optional; returning `{}` means "no opinion, carry on".

```typescript
type SyncHookJSONOutput = {
  continue?: boolean
  suppressOutput?: boolean
  stopReason?: string
  decision?: 'approve' | 'block'
  systemMessage?: string
  terminalSequence?: string
  reason?: string
  hookSpecificOutput?: HookSpecificOutput
  [key: string]: unknown
}
```

| Field | Description |
|-------|-------------|
| `continue` | `false` stops the turn after this hook |
| `suppressOutput` | Hide this hook's stdout from the transcript |
| `stopReason` | Reason surfaced to the user when `continue` is `false` |
| `decision` | Coarse verdict — `'block'` rejects the action |
| `reason` | Explanation that accompanies `decision` |
| `systemMessage` | Injected into the conversation as a system note |
| `terminalSequence` | A terminal escape (OSC 0/1/2/9/99/777 or BEL) for the CLI to emit. Anything else is dropped |
| `hookSpecificOutput` | The event-specific half of the result |

### AsyncHookJSONOutput

Acknowledge now, keep working in the background. The turn continues immediately.

```typescript
type AsyncHookJSONOutput = {
  async: true
  asyncTimeout?: number
}
```

## HookSpecificOutput

The event-specific half of a result, discriminated by `hookEventName`. 22 events accept one.

| Event | Fields |
|-------|--------|
| `PreToolUse` | `permissionDecision`, `permissionDecisionReason`, `updatedInput`, `additionalContext` |
| `PostToolUse` | `additionalContext`, `classifierContext`, `updatedToolOutput`, `updatedMCPToolOutput` |
| `PostToolUseFailure` | `additionalContext` |
| `PostToolBatch` | `additionalContext` |
| `PermissionRequest` | `decision` |
| `PermissionDenied` | `retry` |
| `Notification` | `additionalContext` |
| `UserPromptSubmit` | `additionalContext`, `sessionTitle`, `suppressOriginalPrompt` |
| `UserPromptExpansion` | `additionalContext`, `suppressOriginalPrompt` |
| `SessionStart` | `additionalContext`, `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills` |
| `Setup` | `additionalContext` |
| `Stop` | `additionalContext` |
| `SubagentStart` / `SubagentStop` | `additionalContext` |
| `PreModelSwitch` | `permissionDecision`, `permissionDecisionReason` |
| `PostModelSwitch` | `additionalContext` |
| `Elicitation` / `ElicitationResult` | `action`, `content` |
| `CwdChanged` / `FileChanged` | `watchPaths` |
| `WorktreeCreate` | `worktreePath` |
| `MessageDisplay` | `displayContent` |

### HookPermissionDecision

```typescript
type HookPermissionDecision = 'allow' | 'deny' | 'ask' | 'defer'
```

## HookCallback

An in-process JS callback. SDK mode.

```typescript
type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<HookJSONOutput>
```

## HookCallbackMatcher

```typescript
interface HookCallbackMatcher {
  readonly matcher?: string
  readonly hooks: readonly HookCallback[]
  readonly timeout?: number
}
```

| Field | Description |
|-------|-------------|
| `matcher` | Pattern matched against the tool name. Omit for events with no tool name (`Stop`, `SessionStart`, `Notification`, …) |
| `hooks` | Callbacks to run when the matcher matches |
| `timeout` | Timeout in **seconds** for every hook in this matcher |

## HookEntry

A configured hook, discriminated on `type`. CLI mode. An entry without `type` is a `CommandHookEntry`, which keeps older `{ command, timeout }` configs valid.

```typescript
type HookEntry =
  | CommandHookEntry
  | PromptHookEntry
  | AgentHookEntry
  | HttpHookEntry
  | McpToolHookEntry
```

Shared by every kind: `if` (permission-rule syntax gating the hook, e.g. `"Bash(git *)"`), `timeout` (seconds), `statusMessage` (spinner text) and `once` (run, then remove).

### CommandHookEntry

Runs a shell command or an executable.

```typescript
interface CommandHookEntry {
  readonly type?: 'command'
  readonly command: string
  readonly args?: readonly string[]
  readonly if?: string
  readonly shell?: 'bash' | 'powershell'
  readonly timeout?: number
  readonly statusMessage?: string
  readonly once?: boolean
  readonly async?: boolean
  readonly asyncRewake?: boolean
}
```

`command` goes through a shell unless `args` is present, in which case it is spawned directly with no shell — so paths containing quotes, `$` or backticks never reach a parser. `async` runs it in the background; `asyncRewake` additionally wakes the model on exit code 2.

### PromptHookEntry

Evaluates a prompt with a small model and blocks on the verdict.

```typescript
interface PromptHookEntry {
  readonly type: 'prompt'
  readonly prompt: string          // $ARGUMENTS is the hook input JSON
  readonly model?: string          // defaults to the small fast model
  readonly continueOnBlock?: boolean
  readonly if?: string
  readonly timeout?: number
  readonly statusMessage?: string
  readonly once?: boolean
}
```

### AgentHookEntry

Runs an agentic verifier with tool access.

```typescript
interface AgentHookEntry {
  readonly type: 'agent'
  readonly prompt: string          // e.g. "Verify that unit tests ran and passed."
  readonly model?: string          // defaults to Haiku
  readonly if?: string
  readonly timeout?: number        // defaults to 60
  readonly statusMessage?: string
  readonly once?: boolean
}
```

### HttpHookEntry

POSTs the hook input JSON to an endpoint.

```typescript
interface HttpHookEntry {
  readonly type: 'http'
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly allowedEnvVars?: readonly string[]
  readonly if?: string
  readonly timeout?: number
  readonly statusMessage?: string
  readonly once?: boolean
}
```

Header values may reference environment variables as `$VAR` or `${VAR}`, but only names listed in `allowedEnvVars` are interpolated — every other reference resolves to an empty string.

### McpToolHookEntry

Calls a tool on an already-configured MCP server.

```typescript
interface McpToolHookEntry {
  readonly type: 'mcp_tool'
  readonly server: string
  readonly tool: string
  readonly input?: Readonly<Record<string, unknown>>
  readonly if?: string
  readonly timeout?: number
  readonly statusMessage?: string
  readonly once?: boolean
}
```

String values in `input` support `${path}` interpolation from the hook input JSON, e.g. `"${tool_input.file_path}"`.

## HookMatcher

```typescript
interface HookMatcher {
  readonly matcher?: string
  readonly hooks: readonly HookEntry[]
}
```

`matcher` is optional — non-tool events such as `Stop`, `SessionStart` and `Notification` have no tool name to match against.

## HooksConfig

Configured hooks keyed by event. All 33 event names are completed and typo-checked; the index signature keeps events newer than this library usable.

```typescript
type HooksConfig =
  Readonly<Partial<Record<HookEvent, readonly HookMatcher[]>>>
  & { readonly [key: string]: readonly HookMatcher[] | undefined }
```

```typescript
const claude = new Claude({
  useSdk: false,
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: './scripts/audit.sh' }] },
    ],
    PostToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [{ type: 'command', command: 'npx', args: ['prettier', '--write', '.'], timeout: 30 }],
      },
    ],
    Stop: [
      { hooks: [{ type: 'command', command: 'notify-send "Claude finished"' }] },
    ],
  },
})
```

::: warning `type: 'command'` is required by the CLI
The settings schema requires the discriminator on every entry and silently drops entries that omit it. Since 0.7.0 the serializer injects `type: 'command'` for entries that leave it out, so legacy `{ command, timeout }` configs are executed rather than ignored — write it explicitly in new code.
:::

## Hook lifecycle stream events

Configured hooks report their progress on the stream, but only when `includeHookEvents: true` is set (in CLI mode this also requires stream-json output).

```typescript
import { Claude, EVENT_HOOK_STARTED, EVENT_HOOK_RESPONSE } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ includeHookEvents: true })

await claude.stream('Refactor the auth module')
  .on(EVENT_HOOK_STARTED, (e) => console.log(`hook ${e.hookName} (${e.hookEvent})`))
  .on(EVENT_HOOK_RESPONSE, (e) => console.log(`  → ${e.outcome} (exit ${e.exitCode})`))
  .done()
```

See [`StreamEvent`](./types#permissions-hooks-and-notices) for the full field lists.
