# Hooks

Hooks run your code at 33 points in a session's lifecycle — before a tool call, when a file changes, when the model is about to be switched, when the loop stops. They can observe, add context, rewrite a tool's input, or block an action outright.

Two mechanisms, chosen by execution mode:

- **`hookCallbacks`** — JS functions running in your process. SDK mode.
- **`hooks`** — commands, prompts, agents, HTTP endpoints or MCP tools, delivered through the settings payload. Both modes: `--settings` in CLI mode, the SDK's `settings` option in SDK mode. The one exception is a `settings` **path** — a path and an inline object cannot share the flag, so put the hooks in that file.

The full type reference lives on the [Hooks API page](../api/hooks).

## JS Callbacks (SDK Mode)

```ts
import { Claude, HOOK_PRE_TOOL_USE } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  hookCallbacks: {
    [HOOK_PRE_TOOL_USE]: [{
      matcher: 'Bash',
      hooks: [async (input) => {
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

`matcher` is a pattern matched against the tool name. Omit it for events that carry no tool name — `Stop`, `SessionStart`, `Notification`, and so on.

## Narrowing the Input

`HookInput` is a discriminated union over `hook_event_name`. Switch on it and the event-specific fields become typed:

```ts
import type { HookInput, HookJSONOutput } from '@scottwalker/kraube-konnektor'

async function audit(input: HookInput): Promise<HookJSONOutput> {
  switch (input.hook_event_name) {
    case 'PreToolUse':
      // tool_name, tool_input, tool_use_id are typed here
      console.log(`about to run ${input.tool_name}`)
      return { continue: true }

    case 'PostToolUse':
      // adds tool_response and duration_ms
      console.log(`${input.tool_name} took ${input.duration_ms}ms`)
      return {}

    case 'FileChanged':
      // adds file_path and event
      return { hookSpecificOutput: { hookEventName: 'FileChanged', watchPaths: [input.file_path] } }

    default:
      return { continue: true }
  }
}
```

::: tip snake_case in, camelCase out
Hook **inputs** come straight off the wire and keep the CLI's `snake_case` (`tool_name`, `hook_event_name`). Hook **outputs** are JSON the CLI parses back and are spelled `camelCase` (`hookEventName`, `additionalContext`, `permissionDecision`). The asymmetry is protocol, not an oversight.
:::

## Deciding a Tool Call

`PreToolUse` is the only event that can allow, deny, `ask`, `defer` or rewrite a call:

```ts
import { Claude, HOOK_PRE_TOOL_USE } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  hookCallbacks: {
    [HOOK_PRE_TOOL_USE]: [{
      matcher: 'Bash',
      hooks: [async (input) => {
        if (input.hook_event_name !== 'PreToolUse') return {}
        // `tool_input` is `unknown` — cast it to the shape this tool uses
        const toolInput = input.tool_input as Record<string, unknown>
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            // rewrite rather than reject
            updatedInput: { ...toolInput, timeout: 30_000 },
          },
        }
      }],
    }],
  },
})
```

## Injecting Context

Most events accept an `additionalContext` string, which is inserted into the conversation:

```ts
import { Claude, HOOK_SESSION_START, HOOK_USER_PROMPT_SUBMIT } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  hookCallbacks: {
    [HOOK_SESSION_START]: [{
      hooks: [async () => ({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `Deployed commit: ${process.env.GIT_SHA}`,
          sessionTitle: 'Release audit',
        },
      })],
    }],
    [HOOK_USER_PROMPT_SUBMIT]: [{
      hooks: [async () => ({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: `Current time: ${new Date().toISOString()}`,
        },
      })],
    }],
  },
})
```

## Stopping the Turn

```ts
// Block one action and explain why — the loop continues
return { decision: 'block', reason: 'Writes to /etc are not allowed' }

// End the turn entirely
return { continue: false, stopReason: 'Budget guard tripped' }

// Acknowledge now, keep working in the background
return { async: true, asyncTimeout: 30_000 }
```

## Configured Hooks (CLI Mode)

A configured hook is a process, a prompt, an agent, an HTTP call or an MCP tool. Every entry is discriminated on `type`.

```ts
const claude = new Claude({
  useSdk: false,
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: './scripts/audit.sh', timeout: 10 }],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Edit|Write',
        // exec form: no shell, so quotes and $ in paths are safe
        hooks: [{ type: 'command', command: 'npx', args: ['prettier', '--write', '.'] }],
      },
    ],
    Stop: [
      {
        hooks: [{
          type: 'agent',
          prompt: 'Verify that unit tests ran and passed. $ARGUMENTS',
          timeout: 60,
        }],
      },
    ],
  },
})
```

| `type` | Runs |
|--------|------|
| `'command'` (default) | A shell command, or an executable when `args` is present |
| `'prompt'` | A prompt evaluated by a small model; a negative verdict blocks |
| `'agent'` | An agentic verifier with tool access |
| `'http'` | A POST of the hook input JSON to a URL |
| `'mcp_tool'` | A tool on an already-configured MCP server |

Every kind accepts `if` (permission-rule syntax gating the hook, e.g. `"Bash(git *)"`), `timeout` in seconds, `statusMessage` for the spinner, and `once`.

::: warning Write `type` explicitly
The CLI settings schema requires the discriminator and silently drops entries without it. Since 0.7.0 the serializer injects `type: 'command'` for entries that omit it, so legacy `{ command, timeout }` configs run instead of being ignored — but new code should say it.
:::

## Watching Hooks on the Stream

Configured hooks report progress as stream events, but only when `includeHookEvents: true` is set. Without it the CLI never emits them.

```ts
import { Claude, EVENT_HOOK_STARTED, EVENT_HOOK_RESPONSE } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ includeHookEvents: true })

await claude.stream('Refactor the auth module')
  .on(EVENT_HOOK_STARTED, (e) => console.log(`▶ ${e.hookName} (${e.hookEvent})`))
  .on(EVENT_HOOK_RESPONSE, (e) => console.log(`  ${e.outcome}, exit ${e.exitCode}`))
  .done()
```

In CLI mode this also requires stream-json output, which `stream()` and `chat()` already use.

## Choosing Between Hooks and canUseTool

Both can veto a tool call, and they are not interchangeable:

| | `canUseTool` | `PreToolUse` hook |
|---|---|---|
| Scope | Every tool call | Calls matching `matcher` |
| Mode | SDK only | `hookCallbacks` is SDK only; `hooks` works in both modes |
| Can rewrite input | Yes, via `updatedInput` | Yes, via `hookSpecificOutput.updatedInput` |
| Can add context | No | Yes, via `additionalContext` |
| Runs for other events | No | Yes — 33 of them |

Use `canUseTool` for a single, central permission policy; use hooks when you need lifecycle coverage beyond tool approval. See [Tool Control](./tools) for `canUseTool`.
