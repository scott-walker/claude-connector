# API Reference

Complete reference for `@scottwalker/kraube-konnektor` as of the
`@anthropic-ai/claude-agent-sdk` **^0.3.251** upgrade.

Numbers you may have read elsewhere and that changed: **33** hook events (was 21),
**60** CLI flags emitted by the args builder (was "45+"), **43** `StreamEvent`
variants, **26** SDK control methods (was 13), **82** `ClientOptions` and **27**
`QueryOptions` fields.

- [Claude](#claude)
- [ClientOptions](#clientoptions)
- [QueryOptions](#queryoptions)
- [StreamHandle](#streamhandle)
- [ChatHandle](#chathandle)
- [QueryResult](#queryresult)
- [StreamEvent](#streamevent)
- [Result Types](#result-types)
- [Session](#session)
- [ScheduledJob](#scheduledjob)
- [Standalone Functions](#standalone-functions)
- [Constants](#constants)
- [Type Exports](#type-exports)
- [Errors](#errors)
- [IExecutor](#iexecutor)

---

## Claude

Main client class. Entry point for all interactions with Claude Code.

### Constructor

```typescript
new Claude(options?: ClientOptions, executor?: IExecutor)
```

| Parameter  | Type            | Description                                      |
|-----------|-----------------|--------------------------------------------------|
| `options`  | `ClientOptions` | Client-level defaults (frozen after construction) |
| `executor` | `IExecutor`     | Custom executor (default: `SdkExecutor`, or `CliExecutor` when `useSdk: false`) |

Options are validated eagerly — see [Errors](#errors).

### Methods

#### `query(prompt, options?): Promise<QueryResult>`

Execute a one-shot query and wait for the complete result.

```typescript
import { Claude, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const result = await claude.query('Find bugs in auth.ts', {
  model: 'opus',
  maxTurns: 5,
  permissionMode: PERMISSION_PLAN,
})
console.log(result.text, result.usage, result.terminalReason)
```

#### `stream(prompt, options?): StreamHandle`

Execute a query with real-time streaming output. Returns a [`StreamHandle`](#streamhandle).

```typescript
import { Claude, EVENT_TEXT, EVENT_TOOL_USE, EVENT_RESULT } from '@scottwalker/kraube-konnektor'

const result = await claude.stream('Rewrite the module')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_TOOL_USE, (event) => console.log(`Tool: ${event.toolName}`))
  .on(EVENT_RESULT, (event) => console.log(`Done in ${event.durationMs}ms`))
  .done()
```

#### `chat(options?): ChatHandle`

Open a bidirectional streaming channel — a persistent CLI process for multi-turn
conversation via `--input-format stream-json`. `chat()` never goes through the
executor; it owns its own process, so it behaves the same whether or not
`useSdk` is set.

```typescript
const chat = claude.chat().on(EVENT_TEXT, (text) => process.stdout.write(text))
await chat.send('What files are in src?')
await chat.send('Fix the largest file')
chat.end()
```

#### `session(options?): Session`

Create a multi-turn conversation session. See [Session](#session).

#### `loop(interval, prompt, options?): ScheduledJob`

Schedule a recurring query (equivalent of CLI `/loop`). See [ScheduledJob](#scheduledjob).

#### `parallel(queries): Promise<QueryResult[]>`

Run multiple independent queries concurrently.

```typescript
const [bugs, docs] = await claude.parallel([
  { prompt: 'Find bugs', options: { cwd: './src' } },
  { prompt: 'Check docs', options: { permissionMode: PERMISSION_PLAN } },
])
```

> In CLI mode each query gets its own process. In SDK mode they all run against
> the one persistent session and interleave on a single message stream — use
> `useSdk: false`, or one `Claude` instance per branch, for genuinely parallel
> work. The same applies to `Session`, which is not safe for concurrent queries.

#### `init(): Promise<void>`

Warm up the SDK session (import the SDK, create the persistent query, run the
`initialize` handshake). Optional — the first `query()` does it lazily. No-op in
CLI mode.

#### `ready: boolean`

Whether the SDK session is warm. Always `true` in CLI mode.

#### `on(event, listener): this`

Subscribe to warm-up progress. Only fires in SDK mode.

| Event | Constant | Listener |
|---|---|---|
| `'init:stage'` | `INIT_EVENT_STAGE` | `(stage: InitStage, message: string) => void` |
| `'init:ready'` | `INIT_EVENT_READY` | `() => void` |
| `'init:error'` | `INIT_EVENT_ERROR` | `(error: Error) => void` |

`InitStage` is `'importing' | 'creating' | 'connecting' | 'ready'`.

```typescript
import { Claude, INIT_EVENT_STAGE, INIT_EVENT_READY } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
claude.on(INIT_EVENT_STAGE, (stage, message) => console.log(`[${stage}] ${message}`))
claude.on(INIT_EVENT_READY, () => console.log('warm'))
await claude.init()
```

#### `abort(): void`

Abort the running execution on the underlying executor. In SDK mode this closes
the session (the next query re-initializes); for one query only, prefer
[`QueryOptions.signal`](#queryoptions).

#### `close(): void`

Close the SDK session and free resources.

#### `getExecutor(): IExecutor`

The underlying executor — for advanced use and testing.

---

### Control methods (SDK mode only)

26 methods that drive the live session over the SDK control protocol. All of
them throw in CLI mode with a message naming the method.

| Method | Returns | What it does |
|---|---|---|
| `setModel(model?)` | `void` | Change the model for subsequent turns; no argument restores the default |
| `setPermissionMode(mode)` | `void` | Change the permission mode |
| `setMaxThinkingTokens(tokens, display?)` | `void` | Change the thinking budget mid-session: `0` disables thinking, `null` clears the budget so the model's default maximum applies again. **Deprecated** — prefer `thinking` |
| `applyFlagSettings(settings)` | `void` | Shallow-merge settings into the flag layer; `null` clears a key |
| `rewindFiles(userMessageId, { dryRun? })` | `RewindFilesResult` | Restore files to their state at a message. Needs `enableFileCheckpointing` |
| `seedReadState(path, mtime)` | `void` | Declare a file as already read, so Edit passes the read-before-edit guard |
| `readFile(path, { maxBytes?, encoding? })` | `ReadFileResult \| null` | Read a file through the session's permission rules; `null` on denial/missing/transport error |
| `stopTask(taskId)` | `void` | Stop one running subagent task |
| `backgroundTasks(toolUseId?)` | `boolean` | Send the running tool call to the background (the Ctrl+B affordance) |
| `setMcpServers(servers)` | `McpSetServersResult` | Replace the session's MCP servers |
| `reconnectMcpServer(name)` | `void` | Reconnect a failed server |
| `toggleMcpServer(name, enabled)` | `void` | Enable/disable a server without removing it |
| `setMcpPermissionModeOverride(name, mode)` | `McpPermissionModeOverrideResult` | Pin one server's permission mode (`'auto'`, `'default'`, or `null` to clear) |
| `accountInfo()` | `AccountInfo` | Signed-in account, org, subscription, API provider |
| `supportedModels()` | `ModelInfo[]` | Available models and their capabilities |
| `supportedCommands()` | `SlashCommand[]` | Available slash commands |
| `supportedAgents()` | `AgentInfo[]` | Available subagents |
| `mcpServerStatus()` | `McpServerStatus[]` | Per-server connection status and tools |
| `initializationResult()` | `InitializationResult` | What the session loaded at start-up (cached from warm-up — no round trip) |
| `reinitialize()` | `InitializationResult` | Re-send `initialize`; redelivers pending `canUseTool` / `onUserDialog` requests |
| `reloadPlugins()` | `ReloadPluginsResult` | Reload plugins from disk |
| `reloadSkills()` | `ReloadSkillsResult` | Reload skills from disk |
| `getContextUsage()` | `ContextUsage` | Structured `/context` report |
| `usage()` | `UsageReport` | Session cost totals plus plan rate-limit windows (`/usage`). **Experimental** |
| `streamInput(stream)` | `void` | Attach a second input stream of pre-built SDK user messages |
| `interrupt()` | `InterruptResult \| undefined` | Interrupt the current turn; `undefined` on a CLI without the receipt protocol |

#### Examples

```typescript
import { Claude, PERMISSION_ACCEPT_EDITS, EFFORT_HIGH } from '@scottwalker/kraube-konnektor'

const claude = new Claude({ model: 'sonnet', enableFileCheckpointing: true })
await claude.init()

// Model / permissions / settings
await claude.setModel('opus')
await claude.setPermissionMode(PERMISSION_ACCEPT_EDITS)
await claude.applyFlagSettings({ effortLevel: EFFORT_HIGH })
await claude.applyFlagSettings({ effortLevel: null })   // back to the settings cascade

// What is filling the context window
const context = await claude.getContextUsage()
console.log(`${context.percentage}% of ${context.rawMaxTokens} (${context.model})`)
for (const category of context.categories) {
  console.log(`  ${category.name}: ${category.tokens}`)
}

// Plan utilization
const report = await claude.usage()
console.log(report.session.totalCostUsd, report.rateLimits?.fiveHour?.utilization)

// Read a file through the session's permission rules
const file = await claude.readFile('src/index.ts', { maxBytes: 64_000 })
if (file) console.log(file.absPath, file.truncated ?? false)

// Let an out-of-band edit pass the read-before-edit guard
await claude.seedReadState('src/index.ts', Date.now())

// Interrupt and see what is still queued
const receipt = await claude.interrupt()
console.log(receipt?.stillQueued ?? 'no receipt from this CLI')
```

```typescript
// What the session actually loaded
const init = await claude.initializationResult()
console.log(init.commands.length, init.agents.length, init.outputStyle)
console.log(init.account.email, init.account.apiProvider)
console.log(init.models.map((m) => m.value))

// Reload from disk after editing a plugin or skill
const plugins = await claude.reloadPlugins()
console.log(`${plugins.plugins.length} plugins, ${plugins.errorCount} errors`)
const skills = await claude.reloadSkills()
console.log(skills.skills.map((s) => s.name))
```

---

## ClientOptions

82 options set at client construction. They act as defaults for every query on
that client.

The **Mode** column is the ground truth for where an option has an effect:

- **both** — becomes a CLI flag in CLI mode *and* is forwarded to the SDK session
- **SDK** — only reaches the persistent SDK session; ignored in CLI mode
- **CLI** — only becomes a CLI flag; the SDK has no equivalent, so it is dropped in SDK mode

### Process & workspace

| Option | Type | Mode | Description |
|---|---|---|---|
| `useSdk` | `boolean` | — | Executor choice: persistent SDK session (default `true`) or one CLI process per query |
| `executable` | `string` | both | Path to the `claude` binary (default: resolved from `PATH`) |
| `runtime` | `'bun' \| 'deno' \| 'node'` | SDK | JS runtime used to run Claude Code — *not* the CLI path |
| `runtimeArgs` | `string[]` | SDK | Extra argv for that runtime (e.g. `--max-old-space-size`) |
| `cwd` | `string` | both | Working directory (default `process.cwd()`) |
| `env` | `Record<string, string>` | both | Extra environment variables |
| `additionalDirs` | `string[]` | both | Extra readable directories (`--add-dir`) |
| `spawnClaudeCodeProcess` | `(o: SpawnOptions) => SpawnedProcess` | SDK | Custom process spawn — VMs, containers, remote hosts |
| `abortController` | `AbortController` | SDK | Tears down the whole session when aborted |
| `initTimeoutMs` | `number` | SDK | Warm-up timeout (default `120000`) |
| `postResultDrainMs` | `number` | SDK | How long to keep reading after a turn's `result`, in ms (default `0` — one event-loop turn). `result` is not the last frame: `prompt_suggestion`, a trailing `task_notification` and `session_state_changed` follow it. `session_state_changed: 'idle'` closes the window early |
| `extraArgs` | `Record<string, string \| null>` | both | Raw flags this wrapper does not model; `null` emits a boolean flag. CLI mode appends them to argv, SDK mode forwards them to the same binary — so it also reaches a CLI-only flag from SDK mode |

### Model & limits

| Option | Type | Mode | Description |
|---|---|---|---|
| `model` | `string` | both | `'opus'`, `'sonnet'`, `'haiku'`, or a full model ID |
| `effortLevel` | `EffortLevel` | both | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'` |
| `fallbackModel` | `string \| string[]` | both | Fallback model(s), tried in order. An array is joined into one comma-separated `--fallback-model` in both modes |
| `thinking` | `ThinkingConfig` | both | `{ type: 'adaptive' \| 'enabled' \| 'disabled' }` (+ `budgetTokens`, `display`) |
| `maxThinkingTokens` | `number` | both | Fixed thinking budget. **Deprecated** — `thinking` wins when both are set |
| `maxTurns` | `number` | both | Maximum agentic turns per query |
| `maxBudget` | `number` | both | Maximum spend in USD per query (`--max-budget-usd`) |
| `taskBudgetTokens` | `number` | both | Token allowance the model is *told about*, so it can pace itself (`--task-budget`) |
| `autocompact` | `'auto' \| number \| string` | CLI | Compaction threshold, e.g. `'auto'`, `200000`, `'500k'` (100k–1M) |
| `betas` | `SdkBeta[]` | both | Beta features; currently `BETA_CONTEXT_1M` |
| `schema` | `object` | both | JSON Schema for structured output (`--json-schema` / SDK `outputFormat`) |

### System prompt

| Option | Type | Mode | Description |
|---|---|---|---|
| `systemPrompt` | `string \| string[]` | both | Replace the system prompt. The array form is a block list — include `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` to split the cacheable prefix (SDK); CLI joins the blocks with a blank line |
| `appendSystemPrompt` | `string` | both | Append to the default system prompt |
| `systemPromptFile` | `string` | CLI | Read the system prompt from a file instead of argv |
| `appendSystemPromptFile` | `string` | CLI | Read the appended suffix from a file |
| `appendSubagentSystemPrompt` | `string` | CLI | One instruction appended to every subagent's system prompt |
| `excludeDynamicSystemPromptSections` | `boolean` | both | Move cwd/env/memory/git-status into the first user message so the prefix stays cacheable. Ignored when `systemPrompt` replaces the preset |

### Permissions & isolation

| Option | Type | Mode | Description |
|---|---|---|---|
| `permissionMode` | `PermissionMode` | both | `'default' \| 'manual' \| 'acceptEdits' \| 'plan' \| 'dontAsk' \| 'auto' \| 'bypassPermissions'` |
| `planModeInstructions` | `string` | both | Replace the body of the built-in plan-mode workflow (`--plan-mode-instructions`) |
| `allowedTools` | `string[]` | both | Auto-approved tools (glob patterns allowed) |
| `disallowedTools` | `string[]` | both | Always-denied tools |
| `canUseTool` | `CanUseTool` | SDK | Programmatic per-call permission callback |
| `permissionPromptToolName` | `string` | both | MCP tool that answers permission prompts — the CLI-mode counterpart of `canUseTool` |
| `allowDangerouslySkipPermissions` | `boolean` | both | Required alongside `permissionMode: 'bypassPermissions'` |
| `dangerouslySkipPermissions` | `boolean` | CLI | Skip every permission check for the whole run |
| `sandbox` | `SandboxConfig` | SDK | OS sandbox: egress allowlist, filesystem rules, credential masking |
| `safeMode` | `boolean` | CLI | Ignore CLAUDE.md, skills, plugins, hooks, MCP servers and custom agents |
| `bare` | `boolean` | CLI | Embedded mode: no hooks, LSP, plugin sync, auto-memory or CLAUDE.md discovery |

### Tools, skills & agents

| Option | Type | Mode | Description |
|---|---|---|---|
| `tools` | `string[] \| ToolsPresetConfig` | both | Which built-in tools *exist*. `[]` disables all; `{ type: 'preset', preset: 'claude_code' }` is every default tool |
| `toolAliases` | `Record<string, string>` | SDK | Redirect a built-in tool to an MCP tool, e.g. `{ Bash: 'mcp__workspace__bash' }`. Single-hop |
| `toolConfig` | `ToolConfig` | SDK | Per-tool behaviour, e.g. `{ askUserQuestion: { previewFormat: 'html' } }` |
| `skills` | `string[] \| 'all'` | SDK | Skills to load by name. The only supported way to enable skills |
| `disableSlashCommands` | `boolean` | CLI | Disable every slash command (and therefore every skill) |
| `agents` | `Record<string, AgentConfig>` | both | Inline subagent definitions |
| `agent` | `string` | both | Select one preconfigured agent for the session |
| `agentProgressSummaries` | `boolean` | SDK | AI-generated progress summaries on `task_progress` events |
| `forwardSubagentText` | `boolean` | both | Forward subagent text/thinking as messages carrying `parentToolUseId` |
| `perTaskStopAffordance` | `boolean` | SDK | Declare that the host wires a per-task stop control to `stopTask()` |
| `enableFileCheckpointing` | `boolean` | SDK | Track file changes so `rewindFiles()` can restore them |
| `brief` | `boolean` | CLI | Enable the `SendUserMessage` tool so the agent can push messages mid-run |

### MCP

| Option | Type | Mode | Description |
|---|---|---|---|
| `mcpServers` | `Record<string, McpServerConfig \| McpSdkServerConfig>` | both | Inline server definitions, including in-process SDK servers |
| `mcpConfig` | `string \| string[]` | CLI | Path(s) to MCP config JSON. **Rejected at construction in SDK mode** — use `mcpServers` |
| `strictMcpConfig` | `boolean` | both | Ignore MCP servers that are not in `mcpConfig` |

### Hooks & host callbacks

| Option | Type | Mode | Description |
|---|---|---|---|
| `hooks` | `HooksConfig` | both | Shell/prompt/agent/HTTP/MCP hook entries. Hooks live in the CLI's settings schema, so they are folded into the settings payload either way — `--settings` in CLI mode, the SDK's `settings` option in SDK mode. Exception: when `settings` is a **path**, put the hooks in that file instead |
| `hookCallbacks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | SDK | In-process JS hooks for all **33** hook events |
| `includeHookEvents` | `boolean` | both | Emit `hook_started` / `hook_progress` / `hook_response` stream events |
| `onElicitation` | `OnElicitation` | SDK | Answer MCP elicitation requests |
| `onUserDialog` | `OnUserDialog` | SDK | Render blocking host dialogs (e.g. a refusal fallback prompt) |
| `supportedDialogKinds` | `string[]` | SDK | Dialog kinds this host can render. Requires `onUserDialog` |
| `stderr` | `(data: string) => void` | SDK | Raw stderr from the Claude Code process |

### Session identity & persistence

| Option | Type | Mode | Description |
|---|---|---|---|
| `name` | `string` | both | Display title for the session |
| `resume` | `string` | both | Resume an existing session ID |
| `sessionId` | `string` | both | Pin the UUID of a *new* session |
| `continueSession` | `boolean` | both | Continue the most recent session in `cwd` |
| `forkSession` | `boolean` | both | Branch the resumed session instead of appending to it |
| `resumeSessionAt` | `string` | both | Resume only up to this message uuid |
| `resumeDropsTurn` | `string` | both | Prompt uuid of the turn a truncating resume discards |
| `noSessionPersistence` | `boolean` | both | Do not write the session to disk |
| `sessionStore` | `SessionStore` | SDK | Mirror the transcript into a custom store. `@alpha` |
| `sessionStoreFlush` | `'batched' \| 'eager'` | SDK | Mirror cadence (default `'batched'`). `@alpha` |
| `sessionStoreLoadTimeoutMs` | `number` | SDK | Timeout for the initial `store.load()` (default `60000`). `@alpha` |

### Settings & plugins

| Option | Type | Mode | Description |
|---|---|---|---|
| `settingSources` | `SettingSource[]` | both | Which settings tiers to load: `'user'`, `'project'`, `'local'` (`--setting-sources`). **Omitting it means isolation in SDK mode — CLAUDE.md is not read**; CLI mode keeps its own default of all three tiers until this names them. An empty array requests full isolation in both modes |
| `settings` | `string \| Settings \| Record<string, unknown>` | both | Settings file path, or an inline object loaded into the flag layer |
| `managedSettings` | `Settings \| Record<string, unknown>` | SDK | Policy-tier settings; filtered restrictive-only |
| `plugins` | `PluginConfig[]` | both | `{ type: 'local', path }` (both modes; `skipMcpDiscovery` emits `--plugin-dir-no-mcp`) or `{ type: 'url', url }` (CLI — **rejected at construction in SDK mode**) |

### Stream shape & diagnostics

| Option | Type | Mode | Description |
|---|---|---|---|
| `includePartialMessages` | `boolean` | both | Emit raw provider deltas as `partial_message` events |
| `promptSuggestions` | `boolean` | both | Emit a `prompt_suggestion` event after each turn |
| `replayUserMessages` | `boolean` | CLI | Echo accepted user messages back on the stream (needs stream-json on both sides) |
| `debug` | `boolean \| string` | both | Debug logging; a string filters categories (`'api,hooks'`, `'!1p'`). SDK mode treats any non-`false` value as `true` |
| `debugFile` | `string` | both | Write the debug log to this path |

> **CLI-mode stream flags.** `includeHookEvents`, `includePartialMessages`,
> `forwardSubagentText`, `replayUserMessages` and `promptSuggestions` are only
> emitted with `--output-format stream-json` — i.e. by `stream()` and `chat()`,
> not by `query()`.

### Rejected combinations

`validateClientOptions()` throws a `ValidationError` at construction for:

| Combination | Why |
|---|---|
| `maxTurns` / `taskBudgetTokens` not a positive integer, `maxBudget <= 0` | Out of range |
| unknown `permissionMode` / `effortLevel` | Not in `VALID_PERMISSION_MODES` / `VALID_EFFORT_LEVELS` |
| `mcpConfig` in SDK mode | The SDK has no config-file channel — use `mcpServers` or `useSdk: false` |
| `sessionId` + `resume` / `continueSession` without `forkSession` | Both name a conversation |
| `supportedDialogKinds` without `onUserDialog` | The CLI fails closed on an undeclared handler |
| `sessionStore` + `noSessionPersistence` | The mirror only runs after a successful local write |
| `plugins: [{ type: 'url' }]` in SDK mode | The SDK's own arg builder knows only `type: 'local'` and throws from inside the module |
| in-process (`type: 'sdk'`) `mcpServers` in CLI mode | The live instance cannot be serialized into `--mcp-config` |
| an `extraArgs` key that is empty, starts with `-`, or contains whitespace | Both modes build the flag as `--` + key, so such a key can only produce argv the CLI silently misreads |

### Selected options in detail

#### `canUseTool` (SDK)

```typescript
const claude = new Claude({
  canUseTool: async (toolName, input, { signal, suggestions }) => {
    if (toolName === 'Bash' && String(input.command).includes('rm -rf'))
      return { behavior: 'deny', message: 'Dangerous command blocked' }
    return { behavior: 'allow', updatedPermissions: suggestions }
  },
})
```

Return `{ behavior: 'allow', updatedInput? , updatedPermissions? }`,
`{ behavior: 'deny', message, interrupt? }`, or `{ behavior: 'ask', message? }`.

#### `hookCallbacks` (SDK)

All 33 events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
`PostToolBatch`, `Notification`, `UserPromptSubmit`, `UserPromptExpansion`,
`SessionStart`, `SessionEnd`, `Stop`, `StopFailure`, `SubagentStart`,
`SubagentStop`, `PreCompact`, `PostCompact`, `PreModelSwitch`,
`PostModelSwitch`, `PermissionRequest`, `PermissionDenied`, `Setup`,
`TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Elicitation`,
`ElicitationResult`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`,
`InstructionsLoaded`, `CwdChanged`, `FileChanged`, `DirectoryAdded`,
`MessageDisplay` — exported individually as `HOOK_*` constants and as
`VALID_HOOK_EVENTS`.

```typescript
import { Claude, HOOK_PRE_TOOL_USE, HOOK_FILE_CHANGED } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  hookCallbacks: {
    [HOOK_PRE_TOOL_USE]: [{
      matcher: 'Bash',
      hooks: [async (input) => {
        if (input.hook_event_name !== 'PreToolUse') return { continue: true }
        // `tool_input` is `unknown` — it is shaped by the tool's own schema
        const { command = '' } = input.tool_input as { command?: string }
        return command.includes('sudo')
          ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } }
          : { continue: true }
      }],
    }],
    [HOOK_FILE_CHANGED]: [{
      hooks: [async () => ({ continue: true })],
    }],
  },
})
```

Hook **inputs** are `snake_case` (straight off the wire); hook **outputs** are
`camelCase` (the protocol spells them that way). Narrow on
`input.hook_event_name` to get the typed payload.

#### `sandbox` (SDK)

```typescript
const claude = new Claude({
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true,
    network: { allowedDomains: ['registry.npmjs.org'], strictAllowlist: true },
    filesystem: { allowWrite: ['./build'], denyRead: ['~/.ssh'] },
    credentials: {
      envVars: [{ name: 'GITHUB_TOKEN', mode: 'mask', injectHosts: ['api.github.com'] }],
    },
  },
})
```

#### `skills` / `toolAliases` / `toolConfig` (SDK)

```typescript
const claude = new Claude({
  skills: ['pdf', 'docx'],                        // or 'all'
  toolAliases: { Bash: 'mcp__workspace__bash' },  // run Bash in your own sandbox
  toolConfig: { askUserQuestion: { previewFormat: 'html' } },
})
```

#### `onUserDialog` + `supportedDialogKinds` (SDK)

```typescript
const claude = new Claude({
  supportedDialogKinds: ['refusal_fallback_prompt'],
  onUserDialog: async (request, { signal }) => {
    if (request.dialogKind !== 'refusal_fallback_prompt') return { behavior: 'cancelled' }
    return { behavior: 'completed', result: { choice: 'retry_with_fallback' } }
  },
})
```

`dialogKind` is an open union — answer anything you do not recognise with
`{ behavior: 'cancelled' }` and the CLI applies the dialog's default.

#### `sessionStore` (SDK, `@alpha`)

```typescript
import { Claude, createInMemorySessionStore } from '@scottwalker/kraube-konnektor'

const store = await createInMemorySessionStore()
const claude = new Claude({ sessionStore: store, sessionStoreFlush: 'eager' })
await claude.query('Audit the repo')
console.log(store.size)
```

A store mirrors what the subprocess already wrote locally, so it cannot be
combined with `noSessionPersistence`. Mirror failures surface as `mirror_error`
stream events rather than throwing.

---

## QueryOptions

27 per-query overrides. **The two modes honour different subsets**, because the
SDK session is created once and its flags are fixed at construction:

- **CLI mode** re-builds argv per query, so every option below is applied.
- **SDK mode** bridges eight overrides through the control protocol —
  `model`, `permissionMode` and `thinking` as their own control requests,
  and `effortLevel`, `fallbackModel`, `allowedTools`, `disallowedTools`,
  `additionalDirs` through `applyFlagSettings()` — applying them before the
  turn and restoring the previous value afterwards. `systemPrompt` is prepended
  to the prompt text (`[System instruction: …]`). `signal` is bridged to an
  interrupt. Everything else is construction-time only.

| Option | Type | CLI | SDK | Description |
|---|---|:--:|:--:|---|
| `cwd` | `string` | ✅ | — | Working directory for the spawned process |
| `model` | `string` | ✅ | ✅ | Model for this query |
| `fallbackModel` | `string \| string[]` | ✅ | ✅ | Fallback model(s). SDK: via `applyFlagSettings({ fallbackModel })` |
| `effortLevel` | `EffortLevel` | ✅ | ✅ | Effort level. SDK: via `applyFlagSettings({ effortLevel })` |
| `permissionMode` | `PermissionMode` | ✅ | ✅ | Permission mode |
| `planModeInstructions` | `string` | ✅ | — | CLI: `--plan-mode-instructions`. SDK has no mid-session control request for it — set it on the client |
| `allowedTools` | `string[]` | ✅ | ✅ | Auto-approved tools. SDK: via `applyFlagSettings({ permissions.allow })` |
| `disallowedTools` | `string[]` | ✅ | ✅ | Denied tools. SDK: via `applyFlagSettings({ permissions.deny })` |
| `systemPrompt` | `string` | ✅ | ⚠️ | CLI: `--system-prompt`. SDK: prepended to the prompt text |
| `appendSystemPrompt` | `string` | ✅ | — | Appended system prompt |
| `systemPromptFile` | `string` | ✅ | — | System prompt read from a file |
| `appendSystemPromptFile` | `string` | ✅ | — | Suffix read from a file |
| `maxTurns` | `number` | ✅ | — | Turn cap |
| `maxBudget` | `number` | ✅ | — | USD cap |
| `taskBudgetTokens` | `number` | ✅ | — | Token allowance the model is told about |
| `input` | `string` | ✅ | — | Piped stdin data (`echo data \| claude -p …`) |
| `schema` | `object` | ✅ | — | JSON Schema for this query's structured output |
| `worktree` | `boolean \| string` | ✅ | — | Run in an isolated git worktree |
| `additionalDirs` | `string[]` | ✅ | ✅ | Extra readable directories. SDK: via `applyFlagSettings({ permissions.additionalDirectories })` |
| `env` | `Record<string, string>` | ✅ | — | Extra environment variables |
| `agent` | `string` | ✅ | — | Subagent to answer this query |
| `tools` | `string[] \| ToolsPresetConfig` | ✅ | — | Built-in tool set (the preset form has no CLI spelling) |
| `skills` | `string[] \| 'all'` | — | — | **Inert in both modes** (`@deprecated`): the binary has no `--skills` flag and the SDK fixes the skill set at session open — set it on the client |
| `files` | `string[]` | ✅ | — | Files-API resources as `file_id:relative_path` |
| `background` | `boolean` | — | — | **Inert in both modes** (`@deprecated`): the binary rejects `--bg` together with `--print`, so it is never emitted. Use `AgentConfig.background` instead |
| `signal` | `AbortSignal` | ✅ | ✅ | CLI: SIGTERM to the process. SDK: interrupts the turn and drains to the result |
| `thinking` | `ThinkingConfig` | ✅ | ✅ | Thinking config for this query |

```typescript
// Works in both modes
const result = await claude.query('Deep analysis', {
  model: 'opus',
  permissionMode: PERMISSION_PLAN,
  thinking: { type: 'enabled', budgetTokens: 50_000 },
})

// CLI-only overrides — build the client for them, or use useSdk: false
const cli = new Claude({ useSdk: false })
await cli.query('Summarize the diff', {
  input: diffText,
  worktree: 'review',
  maxTurns: 3,
  files: ['file_abc:doc.txt'],
})
```

### Per-query cancellation

```typescript
const controller = new AbortController()
setTimeout(() => controller.abort(), 30_000)

try {
  await claude.query('Long analysis…', { signal: controller.signal })
} catch (error) {
  // Both modes reject with the message 'Query aborted' — SDK mode as a
  // CliExecutionError, CLI mode as a plain Error after SIGTERM
}
```

`stream()` does not throw on abort in either mode. CLI mode kills the process and
the iteration ends; SDK mode interrupts the turn, still yields the remaining
events (including the aborted `result`), and leaves the session usable for the
next turn — which is why a per-query `signal` is preferable to `claude.abort()`,
which tears the session down.

---

## StreamHandle

Returned from `claude.stream()` and `session.stream()`. Four ways to consume the
same stream.

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.on(type, callback)` | `this` | Register a typed callback. Chainable. One overload per `StreamEvent` variant |
| `.done()` | `Promise<StreamResultEvent>` | Consume the stream, fire callbacks, return the result event |
| `.text()` | `Promise<string>` | Collect all text chunks into a string |
| `.pipe(writable)` | `Promise<StreamResultEvent>` | Pipe text to anything with `write(chunk: string)` |
| `.toReadable()` | `Readable` | Node.js Readable of text chunks |
| `[Symbol.asyncIterator]` | `AsyncIterator<StreamEvent>` | Raw `for await` iteration |

`.done()` throws if the stream ends without a `result` event. Callback errors are
swallowed so one bad listener cannot break the stream.

All **43** event names are valid in `.on()`; the callback parameter is narrowed
to that variant. `text` is the one event whose callback receives the string
rather than the event object.

```typescript
await claude.stream('Audit deps')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .on(EVENT_THINKING, (event) => log(event.thinking))
  .on(EVENT_CONTEXT_USAGE, (event) => meter(event.contextUsage.percentage))
  .on(EVENT_API_RETRY, (event) => warn(`retry ${event.attempt}/${event.maxRetries}`))
  .done()
```

See [docs/STREAMING.md](./STREAMING.md) for the full event table.

---

## ChatHandle

Returned from `claude.chat()`. Bidirectional streaming over a persistent CLI
process.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `sessionId` | `string \| null` | Session ID (after the first result) |
| `turnCount` | `number` | Completed turns |
| `closed` | `boolean` | Whether the chat is closed |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.send(prompt)` | `Promise<StreamResultEvent>` | Send a prompt, await turn completion |
| `.on(type, callback)` | `this` | Same 43 overloads as `StreamHandle` |
| `.pipe(dest)` | `dest` | Pipe text to a writable (returns `dest` for chaining) |
| `.toReadable()` | `Readable` | Node.js Readable (text mode) |
| `.toDuplex()` | `Duplex` | Node.js Duplex (write prompts, read text) |
| `.end()` | `void` | Close gracefully (EOF on stdin) |
| `.abort()` | `void` | Kill the process immediately (SIGTERM) |

---

## QueryResult

Returned from `query()`. The first eight fields are always present; the rest are
populated by **SDK mode** only, because CLI mode's `--output-format json` parser
keeps the extra keys in `raw`.

| Field | Type | Description |
|---|---|---|
| `text` | `string` | Text response |
| `sessionId` | `string` | Session ID for resuming |
| `usage` | `TokenUsage` | Tokens for the turn, including cache-token fields in SDK mode |
| `cost` | `number \| null` | Cost in USD |
| `durationMs` | `number` | Wall-clock duration |
| `messages` | `Message[]` | Conversation history. Populated in CLI mode; always `[]` in SDK mode — stream the turn if you need the blocks |
| `structured` | `unknown \| null` | Structured output when a schema was used |
| `raw` | `Record<string, unknown>` | The raw result message |
| `subtype` | `ResultSubtype?` | `'success'`, `'error_during_execution'`, `'error_max_turns'`, `'error_max_budget_usd'`, `'error_max_structured_output_retries'` |
| `isError` | `boolean?` | Whether the turn ended in an error |
| `errors` | `string[]?` | Error strings carried on the result |
| `terminalReason` | `TerminalReason?` | Why the turn stopped — see below |
| `modelUsage` | `Record<string, ModelUsageEntry>?` | Per-model tokens, cost, context window |
| `permissionDenials` | `PermissionDenial[]?` | Tool calls denied during the turn |
| `deferredToolUse` | `DeferredToolUse \| null?` | Tool call handed back to the caller to run |
| `durationApiMs` | `number?` | Time spent in API calls |
| `queuedTurnCount` | `number?` | Turns still queued behind this one |
| `ttftMs` | `number?` | Time to first token |
| `apiErrorStatus` | `number \| null?` | HTTP status of a failing API call |
| `fastModeState` | `'off' \| 'cooldown' \| 'on'?` | Fast-mode state at the end of the turn |
| `origin` | `MessageOrigin?` | What originated the turn (human, channel, hook, coordinator, observer, …) |

`TerminalReason` is an open union over `VALID_TERMINAL_REASONS`: `'completed'`,
`'max_turns'`, `'budget_exhausted'`, `'aborted_streaming'`, `'aborted_tools'`,
`'prompt_too_long'`, `'model_error'`, `'api_error'`, `'blocking_limit'`,
`'rapid_refill_breaker'`, `'image_error'`, `'malformed_tool_use_exhausted'`,
`'stop_hook_prevented'`, `'hook_stopped'`, `'tool_deferred'`,
`'tool_deferred_unavailable'`, `'background_requested'`,
`'structured_output_retry_exhausted'`, `'turn_setup_failed'`.

```typescript
const result = await claude.query('Refactor the parser')

if (result.terminalReason === 'budget_exhausted') retryWithMoreBudget()

for (const [model, usage] of Object.entries(result.modelUsage ?? {})) {
  console.log(model, usage.costUsd, usage.cacheReadInputTokens, usage.contextWindow)
}
for (const denial of result.permissionDenials ?? []) {
  console.warn(`denied ${denial.toolName} (${denial.toolUseId})`)
}
console.log(result.usage.cacheReadInputTokens, result.usage.serviceTier)
```

---

## StreamEvent

Discriminated union yielded by `stream()` — **43 variants**. Narrow on
`event.type`, and match against the exported `EVENT_*` constants rather than bare
strings.

Both executors map the full union: `SdkExecutor` from the SDK message stream,
`CliExecutor` through `parseStreamEvents()` on `--output-format stream-json`.
One stream-json line can carry several events (an assistant turn with a thinking
block and a text block, a user turn answering parallel tool calls), which is why
the plural reader is the one the executor uses; `parseStreamLine()` returns only
the line's last event and is kept for backward compatibility.
Whether a given variant *fires* depends on the flags and on the CLI's behaviour
for the run, not on the executor — see
[docs/STREAMING.md](./STREAMING.md#stream-events-reference) for the full table
with the gating option for each event.

| Group | Events |
|---|---|
| Conversation | `text`, `thinking`, `thinking_tokens`, `tool_use`, `tool_result`, `tool_progress`, `tool_use_summary`, `result`, `error` |
| Session lifecycle | `init`, `session_state_changed`, `status`, `conversation_reset`, `worker_shutting_down`, `compact_boundary`, `context_usage` |
| Subagents & background | `task_started`, `task_progress`, `task_notification`, `task_updated`, `background_tasks_changed` |
| Permissions & host UI | `permission_denied`, `notification`, `informational`, `prompt_suggestion`, `local_command_output` |
| Hooks | `hook_started`, `hook_progress`, `hook_response` |
| Reliability | `rate_limit`, `api_retry`, `model_refusal_fallback`, `model_refusal_no_fallback`, `mirror_error` |
| Environment | `auth_status`, `files_persisted`, `memory_recall`, `commands_changed`, `plugin_install`, `elicitation_complete`, `control_request_progress` |
| Escape hatches | `partial_message`, `system` |

`system` is the catch-all: an SDK message or CLI line this version does not model
is forwarded as `{ type: 'system', subtype, data }` rather than dropped, so a
newer CLI never breaks a consumer.

---

## Result Types

Shapes returned by the control methods (SDK mode). Every field is `readonly`.

### `AccountInfo`

| Field | Type |
|---|---|
| `email`, `organization`, `subscriptionType`, `tokenSource`, `apiKeySource` | `string?` |
| `apiProvider` | `'firstParty' \| 'bedrock' \| 'vertex' \| 'foundry' \| 'anthropicAws' \| 'anthropicGoogleCloud' \| 'mantle' \| 'gateway'` |

### `ModelInfo`

`value`, `resolvedModel?`, `displayName`, `description`, `supportsEffort?`,
`supportedEffortLevels?`, `supportsAdaptiveThinking?`, `supportsFastMode?`,
`supportsAutoMode?`.

### `SlashCommand`

`name`, `description`, `argumentHint`, `aliases?`. Skills are reported through
this shape too (`reloadSkills()`).

### `AgentInfo`

`name`, `description`, `model?`.

### `McpServerStatus`

`name`, `status` (`'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'`),
`serverInfo?`, `error?`, `config?`, `scope?`, `tools?`.

### `McpSetServersResult`

`added: string[]`, `removed: string[]`, `errors: Record<string, string>`.

### `McpPermissionModeOverrideResult`

`warning?: string` — set when the CLI accepted the override but flagged it.

### `RewindFilesResult`

`canRewind`, `error?`, `filesChanged?`, `insertions?`, `deletions?`,
`skippedLinks?` (tracked files left alone because of a symlink/hard link/unsafe
parent — only on a real, non-`dryRun` rewind).

### `ReadFileResult`

`contents`, `absPath`, `truncated?`, `encoding?` (`'base64'` for binary reads).

### `InterruptResult`

`stillQueued: string[]`, `cancelled?: string[]`. An empty `stillQueued` does not
mean nothing will run — messages sent without a uuid are never listed.

### `InitializationResult`

`commands`, `agents`, `outputStyle`, `availableOutputStyles`, `models`,
`account`, `hooksApplied?`, `fastModeState?`, `fastModeDisabledReason?`.

### `ReloadPluginsResult`

`commands`, `agents`, `plugins`, `mcpServers`, `errorCount`.

### `ReloadSkillsResult`

`skills: SlashCommand[]`.

### `ContextUsage`

`model`, `totalTokens`, `rawMaxTokens`, `maxTokens?`, `percentage`,
`overLimit?`, `categories`, plus optional breakdowns: `mcpTools`,
`memoryFiles`, `agents`, `skills`, `slashCommands`, `deferredBuiltinTools`,
`systemTools`, `systemPromptSections`, `gridRows`, `messageBreakdown`,
`autoCompactThreshold`, `isAutoCompactEnabled`, `apiUsage`.

### `UsageReport`

`session` (cost and token totals), `subscriptionType`, `rateLimitsAvailable`,
`rateLimits` (`fiveHour`, `sevenDay`, `sevenDayOpus`, `sevenDaySonnet`,
`sevenDayOauthApps`, `modelScoped`, `extraUsage`), `behaviors` (`day` / `week`
request and session counts with agent/skill/plugin/MCP attribution).

### `TokenUsage` / `ModelUsageEntry`

`TokenUsage`: `inputTokens`, `outputTokens`, `cacheCreationInputTokens?`,
`cacheReadInputTokens?`, `serverToolUse?` (`webSearchRequests`,
`webFetchRequests`), `serviceTier?`.

`ModelUsageEntry`: `inputTokens`, `outputTokens`, `cacheReadInputTokens`,
`cacheCreationInputTokens`, `webSearchRequests`, `costUsd`, `contextWindow`,
`maxOutputTokens`, `canonicalModel?`, `provider?`, `costBasis?`.

---

## Session

Multi-turn conversation wrapper. Created via `claude.session()`.

### Properties

| Property | Type | Description |
|---|---|---|
| `sessionId` | `string \| null` | Current session ID — non-null from the start when created with `resume` or `sessionId` |
| `queryCount` | `number` | Queries executed so far |

### Turn methods

| Method | Returns | Description |
|---|---|---|
| `query(prompt, options?)` | `Promise<QueryResult>` | Run a turn; the first creates the session, later ones resume it |
| `stream(prompt, options?)` | `StreamHandle` | Same, streaming |
| `abort()` | `void` | Abort the running query |

### Stored-session methods

These read and write the transcript (on disk, or in the configured
`sessionStore`) instead of talking to a running process, so they work in **both**
modes. All of them need an id — after the first query, or from
`{ resume }` / `{ sessionId }`; otherwise they throw a `ValidationError`. The
project directory defaults to the client's `cwd`.

| Method | Returns | Description |
|---|---|---|
| `rename(title, options?)` | `void` | Set the display title (`SessionInfo.customTitle`) |
| `tag(tag \| null, options?)` | `void` | Set or clear the tag |
| `delete(options?)` | `void` | Delete the transcript and subagent transcripts; resets this instance's id and count |
| `fork(options?)` | `Promise<Session>` | Copy the transcript into a new session and return a `Session` resuming it |
| `info(options?)` | `SessionInfo \| undefined` | Stored metadata: title, tag, git branch, timestamps |
| `messages(options?)` | `SessionMessage[]` | The transcript (`limit`, `offset`, `includeSystemMessages`) |
| `subagents(options?)` | `string[]` | `agentId`s of subagents spawned by this session |
| `subagentMessages(agentId, options?)` | `SessionMessage[]` | One subagent's transcript |

```typescript
const session = claude.session()
await session.query('Audit src/')
await session.rename('src audit')
await session.tag('release-blockers')

const branch = await session.fork({ title: 'alternative plan' })
await branch.query('Try the other approach instead')

for (const agentId of await session.subagents()) {
  const transcript = await session.subagentMessages(agentId, { limit: 20 })
  console.log(agentId, transcript.length)
}
```

### SessionOptions

| Option | Type | Description |
|---|---|---|
| `resume` | `string` | Resume an existing session by ID |
| `fork` | `boolean` | Apply `--fork-session` on the next turn (**not** the same as `session.fork()`, which copies the transcript now) |
| `continue` | `boolean` | Continue the most recent session in `cwd` |
| `sessionId` | `string` | Pin the UUID of the session about to be created, so it is usable before the first query returns |

> **SDK mode:** the persistent session is opened when the `Claude` client is
> constructed, so per-session `resume` / `continue` / `sessionId` cannot take
> effect. `claude.session({ resume })` warns and runs against the client's
> session; pass those to `new Claude({ … })`, or use `useSdk: false` for one
> session per query.

---

## ScheduledJob

Recurring query job. Created via `claude.loop()`.

### Properties

| Property | Type | Description |
|---|---|---|
| `intervalMs` | `number` | Interval in milliseconds |
| `prompt` | `string` | Query to execute |
| `tickCount` | `number` | Number of executions |
| `running` | `boolean` | Whether a query is currently active |
| `stopped` | `boolean` | Whether the job has been stopped |

### Methods

- `stop()` — stop the scheduled job

### Events

| Event | Constant | Callback |
|---|---|---|
| `'result'` | `SCHED_RESULT` | `(result: QueryResult) => void` |
| `'error'` | `SCHED_ERROR` | `(error: Error) => void` |
| `'tick'` | `SCHED_TICK` | `(count: number) => void` |
| `'stop'` | `SCHED_STOP` | `() => void` |

### Interval format

`'30s'`, `'5m'`, `'2h'`, `'1d'`, or raw milliseconds (`60000`).

---

## Standalone Functions

Thin wrappers over the Agent SDK's top-level helpers. The SDK is reached through
a lazy `import()`, so CLI-mode consumers never pay its load cost — a broken
install surfaces at call time, not import time.

### In-process MCP tools

#### `createSdkMcpServer(options): Promise<McpSdkServerConfig>`

#### `sdkTool(name, description, inputSchema, handler, extras?): Promise<unknown>`

```typescript
import { Claude, createSdkMcpServer, sdkTool } from '@scottwalker/kraube-konnektor'
import { z } from 'zod/v4'

const server = await createSdkMcpServer({
  name: 'my-tools',
  tools: [
    await sdkTool('getPrice', 'Get stock price', { ticker: z.string() },
      // `args` is `unknown` — the schema is enforced at runtime, not in the type
      async (args) => {
        const { ticker } = args as { ticker: string }
        return { content: [{ type: 'text', text: `${ticker}: 142.50` }] }
      },
      { annotations: { readOnly: true } },
    ),
  ],
})

const claude = new Claude({ mcpServers: { prices: server } })
```

### Session management

Work on stored transcripts, independent of any running client.

| Function | Returns | Description |
|---|---|---|
| `listSessions(options?)` | `SessionInfo[]` | Stored sessions, newest first |
| `getSessionInfo(sessionId, options?)` | `SessionInfo \| undefined` | One session's metadata; never throws |
| `getSessionMessages(sessionId, options?)` | `SessionMessage[]` | A session's transcript |
| `listSubagents(sessionId, options?)` | `string[]` | `agentId`s of spawned subagents |
| `getSubagentMessages(sessionId, agentId, options?)` | `SessionMessage[]` | One subagent's transcript |
| `forkSession(sessionId, options?)` | `ForkSessionResult` | Copy a transcript into a brand-new session |
| `renameSession(sessionId, title, options?)` | `void` | Set the custom title |
| `tagSession(sessionId, tag \| null, options?)` | `void` | Set or clear the tag |
| `deleteSession(sessionId, options?)` | `void` | Delete the transcript (throws when missing, on local storage) |
| `importSessionToStore(sessionId, store, options?)` | `void` | Copy a local JSONL session into a `SessionStore`. `@alpha` |
| `createInMemorySessionStore()` | `InMemorySessionStoreHandle` | The SDK's in-memory store — tests only. `@alpha` |
| `loadSessionStoreHelpers()` | `SessionStoreHelpers` | Resolves `foldSessionSummary` (synchronous, for use inside `append()`). `@alpha` |

Options: `dir` scopes the search to one project directory (omitting it searches
every project — location-independent but slower), `limit` / `offset` paginate,
`includeWorktrees` and `includeProgrammatic` filter `listSessions`,
`includeSystemMessages` widens `getSessionMessages`, and `sessionStore` reads
through a store instead of the filesystem.

```typescript
import {
  listSessions, getSessionInfo, getSessionMessages,
  listSubagents, getSubagentMessages,
  forkSession, renameSession, tagSession, deleteSession,
} from '@scottwalker/kraube-konnektor'

const recent = await listSessions({ dir: process.cwd(), limit: 10, includeProgrammatic: false })
for (const session of recent) {
  console.log(session.sessionId, session.customTitle ?? session.summary, session.gitBranch)
}

const first = recent[0]
if (first) {
  const info = await getSessionInfo(first.sessionId, { dir: process.cwd() })
  const messages = await getSessionMessages(first.sessionId, { limit: 50, includeSystemMessages: true })

  for (const agentId of await listSubagents(first.sessionId)) {
    console.log(agentId, (await getSubagentMessages(first.sessionId, agentId)).length)
  }

  const { sessionId } = await forkSession(first.sessionId, { title: 'What-if branch' })
  await renameSession(sessionId, 'Auth refactor')
  await tagSession(sessionId, 'release-audit')
  await tagSession(sessionId, null)             // clear
  await deleteSession(sessionId)
}
```

Use `parent_agent_id` on the returned messages to rebuild the subagent tree from
the flat list.

### Pre-warmed sessions

#### `startup(params?): Promise<WarmQuery>`

Pre-warm a CLI subprocess so the first prompt hits a ready process, and the
escape hatch for driving a raw SDK `Query` outside the `Claude` facade. Most
consumers want `claude.init()` / `claude.ready` instead, which warm the same
subprocess through this library's own lifecycle events. `params.options` is the
**SDK's own** `Options` object, not `ClientOptions` — nothing about the handle
goes through this library's option mapping; `initializeTimeoutMs` caps the
handshake. The handle is single-use: call `query()` once, and release a handle
you decide not to use with `close()` or the subprocess outlives the caller.

```typescript
import { startup } from '@scottwalker/kraube-konnektor'

const warm = await startup({ options: { model: 'sonnet' } })
// ... later, with no start-up latency:
for await (const message of warm.query('Find bugs in auth.ts')) {
  // `result` lives on the success half of the SDK's result union
  if (message.type === 'result' && message.subtype === 'success') console.log(message.result)
}
```

### Rate-limit message buckets

#### `getUsageLimitPrefixes(): Promise<UsageLimitPrefixes>`

Resolves the SDK's four message-prefix tables — `USAGE_LIMIT_ERROR_PREFIXES`,
`USAGE_WARNING_PREFIXES`, `USAGE_TRANSITION_PREFIXES` and
`ORG_POLICY_LIMIT_PREFIXES` — so a rate-limit message can be bucketed instead of
pattern-matched by hand. They are SDK *runtime* values rather than literals, so
they arrive through the same lazy `import()` as the rest of this section; that is
why this is an `async` accessor and not four re-exported constants.

```typescript
import { EVENT_RATE_LIMIT, getUsageLimitPrefixes } from '@scottwalker/kraube-konnektor'

const { USAGE_LIMIT_ERROR_PREFIXES, USAGE_WARNING_PREFIXES } = await getUsageLimitPrefixes()

await claude.stream('Long job')
  .on(EVENT_RATE_LIMIT, (event) => {
    // The human-readable text lives on the raw payload; `data` is the SDK's
    // own rate-limit object, forwarded untouched
    const message = String(event.data['message'] ?? '')
    if (USAGE_LIMIT_ERROR_PREFIXES.some((p) => message.startsWith(p))) throw new Error(message)
    if (USAGE_WARNING_PREFIXES.some((p) => message.startsWith(p))) console.warn(message)
  })
  .done()
```

### Low-level parsers

Exported for custom executors and for consumers that read `claude` output
themselves. Both executors use them internally.

| Function | Returns | Description |
|---|---|---|
| `parseJsonResult(stdout)` | `QueryResult` | Parse one `--output-format json` payload. Shares `parseResultEvent()` with the stream, so it fills the same 21 fields |
| `parseStreamEvents(line)` | `readonly StreamEvent[]` | Every event one `--output-format stream-json` line carries, in wire order |
| `parseStreamLine(line)` | `StreamEvent \| null` | The line's *last* event only — the original single-event shape, kept for backward compatibility |

### Settings resolution (`@alpha`)

#### `resolveSettings(options?): Promise<ResolvedSettings>`

#### `loadSettingsHelpers(): Promise<SettingsHelpers>`

```typescript
import { resolveSettings, loadSettingsHelpers } from '@scottwalker/kraube-konnektor'

const resolved = await resolveSettings({ cwd: process.cwd() })
console.log(resolved.provenance.model?.source)   // 'project' | 'managed' | …

const { filterEscalatingDefaultMode } = await loadSettingsHelpers()
const trusted = filterEscalatingDefaultMode(resolved)
console.log(trusted.permissions?.defaultMode)
```

`resolveSettings()` reports the **raw cascade**, including escalating
`permissions.defaultMode` values from repo-committed tiers that the CLI would
refuse to honour. Always pass the result through
`filterEscalatingDefaultMode()` before acting on `defaultMode`.

---

## Constants

Every discriminator, event name, CLI flag and protocol key is exported as a
constant. Match on these instead of raw strings.

```typescript
import {
  // Stream events (43 — one EVENT_* per StreamEvent variant)
  EVENT_TEXT, EVENT_THINKING, EVENT_THINKING_TOKENS, EVENT_TOOL_USE,
  EVENT_TOOL_RESULT, EVENT_TOOL_PROGRESS, EVENT_TOOL_USE_SUMMARY,
  EVENT_RESULT, EVENT_ERROR, EVENT_SYSTEM, EVENT_INIT,
  EVENT_TASK_STARTED, EVENT_TASK_PROGRESS, EVENT_TASK_NOTIFICATION,
  EVENT_TASK_UPDATED, EVENT_BACKGROUND_TASKS_CHANGED,
  EVENT_RATE_LIMIT, EVENT_API_RETRY,
  EVENT_MODEL_REFUSAL_FALLBACK, EVENT_MODEL_REFUSAL_NO_FALLBACK,
  EVENT_HOOK_STARTED, EVENT_HOOK_PROGRESS, EVENT_HOOK_RESPONSE,
  EVENT_PERMISSION_DENIED, EVENT_NOTIFICATION, EVENT_INFORMATIONAL,
  EVENT_PROMPT_SUGGESTION, EVENT_LOCAL_COMMAND_OUTPUT,
  EVENT_COMPACT_BOUNDARY, EVENT_CONTEXT_USAGE, EVENT_SESSION_STATE_CHANGED,
  EVENT_STATUS, EVENT_WORKER_SHUTTING_DOWN, EVENT_CONVERSATION_RESET,
  EVENT_MIRROR_ERROR, EVENT_AUTH_STATUS, EVENT_FILES_PERSISTED,
  EVENT_MEMORY_RECALL, EVENT_COMMANDS_CHANGED, EVENT_PLUGIN_INSTALL,
  EVENT_ELICITATION_COMPLETE, EVENT_CONTROL_REQUEST_PROGRESS,
  EVENT_PARTIAL_MESSAGE,

  // Hook events (33) — plus VALID_HOOK_EVENTS
  HOOK_PRE_TOOL_USE, HOOK_POST_TOOL_USE, HOOK_FILE_CHANGED, VALID_HOOK_EVENTS,

  // Permission modes, effort levels, MCP transports
  PERMISSION_DEFAULT, PERMISSION_ACCEPT_EDITS, PERMISSION_PLAN,
  PERMISSION_DONT_ASK, PERMISSION_AUTO, PERMISSION_BYPASS, PERMISSION_MANUAL,
  VALID_PERMISSION_MODES,
  EFFORT_LOW, EFFORT_MEDIUM, EFFORT_HIGH, EFFORT_XHIGH, EFFORT_MAX,
  VALID_EFFORT_LEVELS,
  MCP_STDIO, MCP_HTTP, MCP_SSE, MCP_SDK, MCP_CLAUDEAI_PROXY, VALID_MCP_TRANSPORTS,

  // Result subtypes, terminal reasons, rate-limit windows
  RESULT_SUCCESS, RESULT_ERROR_DURING_EXECUTION, RESULT_ERROR_MAX_TURNS,
  RESULT_ERROR_MAX_BUDGET_USD, RESULT_ERROR_MAX_STRUCTURED_OUTPUT_RETRIES,
  VALID_RESULT_SUBTYPES, VALID_TERMINAL_REASONS, VALID_RATE_LIMIT_TYPES,

  // Content blocks, output formats, lifecycle
  BLOCK_TEXT, BLOCK_TOOL_USE, BLOCK_TOOL_RESULT,
  BLOCK_THINKING, BLOCK_REDACTED_THINKING,
  FORMAT_TEXT, FORMAT_JSON, FORMAT_STREAM_JSON,
  INIT_EVENT_STAGE, INIT_EVENT_READY, INIT_EVENT_ERROR,
  SCHED_RESULT, SCHED_ERROR, SCHED_TICK, SCHED_STOP,

  // SDK-mirrored literals & defaults
  DEFAULT_EXECUTABLE, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS,
  DEFAULT_INIT_TIMEOUT_MS, DEFAULT_MAX_BUFFER_BYTES,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  RESUME_REJECTED_PREFIX, BETA_CONTEXT_1M,
} from '@scottwalker/kraube-konnektor'
```

The SDK's four rate-limit message-prefix tables are *runtime* values rather than
literals, so they are not in this list — reach them through
[`getUsageLimitPrefixes()`](#getusagelimitprefixes-promiseusagelimitprefixes).

---

## Type Exports

Everything in the public surface is exported as a type. The full list lives in
`src/index.ts`; the groups are:

```typescript
import type {
  // Client & query configuration
  ClientOptions, QueryOptions, PermissionMode, EffortLevel, SdkBeta,
  ThinkingConfig, ThinkingAdaptive, ThinkingEnabled, ThinkingDisabled, ThinkingDisplay,
  ToolsPresetConfig, ToolConfig, AgentConfig, AgentMcpServerSpec,
  SettingSource, FlagSettings, Settings, PluginConfig, LocalPluginConfig, UrlPluginConfig,
  SpawnOptions, SpawnedProcess,

  // Permissions, sandbox, dialogs
  CanUseTool, PermissionResult, PermissionBehavior, PermissionUpdate,
  PermissionRuleValue, PermissionUpdateDestination, PermissionDecisionClassification,
  SandboxConfig, SandboxNetworkConfig, SandboxFilesystemConfig, SandboxCredentialsConfig,
  ElicitationRequest, ElicitationResult, OnElicitation,
  UserDialogRequest, UserDialogResult, OnUserDialog,

  // MCP
  McpServerConfig, McpStdioServerConfig, McpHttpServerConfig, McpSSEServerConfig,
  McpSdkServerConfig, McpClaudeAIProxyServerConfig, McpServerStatusConfig,
  McpServerToolPolicy, McpPermissionModeOverride,

  // Hooks — 33 events, one input + one output type per event
  HookEvent, HookCallback, HookCallbackMatcher, HookInput, HookJSONOutput,
  HookSpecificOutput, HookPermissionDecision, HooksConfig, HookEntry, HookMatcher,
  PreToolUseHookInput, PostToolUseHookInput, FileChangedHookInput, /* … */

  // Results & stream events — one type per StreamEvent variant
  QueryResult, StreamEvent, StreamResultEvent, StreamThinkingEvent,
  StreamContextUsageEvent, StreamPermissionDeniedEvent, /* … */
  ResultSubtype, TerminalReason, FastModeState, MessageOrigin,
  PermissionDenial, DeferredToolUse, TokenUsage, ModelUsageEntry,
  Message, ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock,
  ThinkingBlock, RedactedThinkingBlock,

  // Control-method payloads
  AccountInfo, ModelInfo, SlashCommand, AgentInfo, McpServerStatus,
  McpSetServersResult, McpPermissionModeOverrideResult, RewindFilesResult,
  ReadFileResult, InterruptResult, InitializationResult,
  ReloadPluginsResult, ReloadSkillsResult, ContextUsage, ContextUsageCategory,
  UsageReport, RateLimitWindows, RateLimitWindow, UsageBehaviors,

  // Sessions & stores
  SessionOptions, SessionInfo, SessionMessage, SessionMutationOptions,
  ForkSessionOptions, ForkSessionResult, ListSessionsOptions,
  GetSessionInfoOptions, GetSessionMessagesOptions,
  ListSubagentsOptions, GetSubagentMessagesOptions,
  SessionStore, SessionKey, SessionStoreEntry, SessionSummaryEntry,
  SessionStoreFlush, InMemorySessionStoreHandle, ImportSessionToStoreOptions,
  WarmQuery,

  // Settings resolution
  ResolvedSettings, ResolveSettingsOptions, ResolvedSettingsLayer,
  ResolvedSettingSource, PolicySettingsOrigin, ProvenanceEntry,

  // Executor
  IExecutor, ExecuteOptions, ResolvedOptions,
  SdkExecutorOptions, SdkExecutorEvents, InitStage,
} from '@scottwalker/kraube-konnektor'
```

---

## Errors

All errors extend `KraubeKonnektorError`.

| Error | When | Extra fields |
|---|---|---|
| `CliNotFoundError` | Binary not found at the configured path | `executable` |
| `CliExecutionError` | Non-zero exit, SDK init timeout, or aborted SDK query | `exitCode`, `stderr` |
| `CliTimeoutError` | Process exceeded the executor timeout | `timeoutMs` |
| `ParseError` | CLI output could not be parsed | `rawOutput` |
| `ValidationError` | Invalid or conflicting options, or an empty prompt | `field` |

```typescript
import { KraubeKonnektorError, CliNotFoundError } from '@scottwalker/kraube-konnektor'

try {
  await claude.query('…')
} catch (error) {
  if (error instanceof CliNotFoundError) {
    console.error(`Install Claude Code or set executable: ${error.executable}`)
  } else if (error instanceof KraubeKonnektorError) {
    console.error(error.message)
  }
}
```

---

## IExecutor

Low-level executor interface. Implement it to add a transport backend, or to
stub the CLI in tests.

```typescript
interface IExecutor {
  execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult>
  stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent>
  abort?(): void
}
```

`ExecuteOptions` carries **two channels**, because the two executors read
different ones:

- CLI mode reads everything from `args` — `buildArgs()` has already encoded every
  per-query override as a flag.
- SDK mode cannot: its session is created once, so the per-query fields on
  `ExecuteOptions` are the only way an override reaches it.

```typescript
interface ExecuteOptions {
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly prompt?: string
  readonly input?: string
  readonly systemPrompt?: string
  readonly signal?: AbortSignal
  // …plus every QueryOptions field, mirrored one-for-one
}
```

A field being present is not a promise that the SDK honours it mid-session — see
the [QueryOptions](#queryoptions) table for which three it bridges.

### Custom executor example

```typescript
import {
  Claude, EVENT_TEXT, EVENT_RESULT,
  type IExecutor, type ExecuteOptions, type QueryResult, type StreamEvent,
} from '@scottwalker/kraube-konnektor'

class MockExecutor implements IExecutor {
  async execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult> {
    return {
      text: 'Mocked response',
      sessionId: 'mock-session',
      usage: { inputTokens: 0, outputTokens: 0 },
      cost: null,
      durationMs: 0,
      messages: [],
      structured: null,
      raw: {},
    }
  }

  async *stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent> {
    yield { type: EVENT_TEXT, text: 'Mocked stream' }
    yield {
      type: EVENT_RESULT,
      text: 'Mocked stream',
      sessionId: 'mock-session',
      usage: { inputTokens: 0, outputTokens: 0 },
      cost: null,
      durationMs: 0,
    }
  }
}

const claude = new Claude({ model: 'opus' }, new MockExecutor())
```
