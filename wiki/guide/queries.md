# Queries

## Basic Query

```ts
const claude = new Claude()

const result = await claude.query('Explain what src/index.ts does')

console.log(result.text)        // Claude's response text
console.log(result.sessionId)   // "abc-123-..." — for resuming later
console.log(result.usage)       // { inputTokens: 1500, outputTokens: 800 }
console.log(result.cost)        // 0.012 or null
console.log(result.durationMs)  // 3200
console.log(result.messages)    // full message history
```

## QueryResult Fields

Full reference for the object returned by `query()`:

```ts
const result = await claude.query('Explain the auth module')

result.text           // string — Claude's response
result.sessionId      // string — session ID for resuming
result.usage          // { inputTokens: number, outputTokens: number } — main loop only
result.cost           // number | null — USD cost
result.durationMs     // number — wall-clock time
result.messages       // Message[] — full conversation history
result.structured     // unknown | null — parsed JSON when schema was used
result.raw            // Record<string, unknown> — raw CLI JSON response

// Outcome
result.subtype        // 'success' | 'error_max_turns' | 'error_max_budget_usd' | ...
result.isError        // boolean
result.errors         // string[] — collected on an error_* result
result.terminalReason // why the loop stopped: 'completed', 'budget_exhausted', ...

// Accounting and timing
result.modelUsage     // per-model totals, including subagents and compaction
result.durationApiMs  // time waiting on the API
result.ttftMs         // time to first token
result.queuedTurnCount // > 0 means another turn follows

// Governance
result.permissionDenials // tool calls denied during the turn
result.deferredToolUse   // a tool call handed back instead of run
result.apiErrorStatus    // HTTP status of the API error that ended the turn
result.fastModeState     // 'off' | 'cooldown' | 'on'
result.origin            // who or what sent the prompt
```

::: tip `usage` vs `modelUsage`
`usage` counts the main loop only. For billing or accounting, use `modelUsage`, which covers subagents, sidechains and compaction as well.
:::

### Accessing Message History

```ts
import {
  Claude,
  BLOCK_TEXT,
  BLOCK_TOOL_USE,
  BLOCK_TOOL_RESULT,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const result = await claude.query('Explain the auth module')

for (const msg of result.messages) {
  console.log(`[${msg.role}]`)

  if (typeof msg.content === 'string') {
    console.log(msg.content)
  } else {
    for (const block of msg.content) {
      switch (block.type) {
        case BLOCK_TEXT:
          console.log(block.text)
          break
        case BLOCK_TOOL_USE:
          console.log(`Tool: ${block.name}(${JSON.stringify(block.input)})`)
          break
        case BLOCK_TOOL_RESULT:
          console.log(`Result: ${block.content}`)
          break
      }
    }
  }
}
```

## Per-Query Overrides

`QueryOptions` overrides `ClientOptions` for the duration of one query.

```ts
import {
  Claude,
  PERMISSION_PLAN,
  PERMISSION_ACCEPT_EDITS,
  EFFORT_MEDIUM,
  EFFORT_MAX,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  useSdk: false,          // CLI mode: every override below becomes a flag
  model: 'sonnet',
  maxTurns: 10,
  maxBudget: 5.0,
  permissionMode: PERMISSION_PLAN,
  effortLevel: EFFORT_MEDIUM,
  systemPrompt: 'You are a helpful assistant.',
  allowedTools: ['Read', 'Glob'],
  tools: ['Read', 'Glob', 'Grep', 'Bash'],
})

const result = await claude.query('Fix the critical bug NOW', {
  model: 'opus',
  maxTurns: 50,
  maxBudget: 20.0,
  permissionMode: PERMISSION_ACCEPT_EDITS,
  effortLevel: EFFORT_MAX,
  systemPrompt: 'You are an emergency bug fixer. Act fast.',
  allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Bash'],
  tools: { type: 'preset', preset: 'claude_code' },
  cwd: '/home/user/production-hotfix',
  additionalDirs: ['/home/user/shared-config'],
  env: { HOTFIX: 'true' },
  agent: 'fixer',
  worktree: 'hotfix-branch',
})
```

### What actually applies in SDK mode

An SDK session is constructed once and reused, so most options are fixed at construction. This is the same list as on the [`QueryOptions`](../api/types#queryoptions) reference, and it is worth knowing before relying on an override.

| Option | SDK mode | CLI mode |
|--------|----------|----------|
| `model` | Bridged through the control protocol, restored afterwards | Flag |
| `permissionMode` | Bridged, restored afterwards | Flag |
| `thinking` | Bridged, restored afterwards (`'adaptive'` has no token-budget spelling and is skipped) | Flag |
| `effortLevel` | Bridged via `applyFlagSettings({ effortLevel })`, restored afterwards | Flag |
| `fallbackModel` | Bridged via `applyFlagSettings({ fallbackModel })`, restored afterwards | Flag (comma-separated) |
| `allowedTools` / `disallowedTools` / `additionalDirs` | Bridged via `applyFlagSettings({ permissions })` — the `allow` / `deny` / `additionalDirectories` lists — restored afterwards | Flags |
| `signal` | Honoured — interrupts the running turn | Honoured — `SIGTERM` |
| `systemPrompt` | Prepended to the prompt text as a system instruction | Flag |
| Everything else — `cwd`, `env`, `input`, `planModeInstructions`, `appendSystemPrompt`, `systemPromptFile`, `appendSystemPromptFile`, `tools`, `agent`, `maxTurns`, `maxBudget`, `taskBudgetTokens`, `schema`, `worktree`, `files` | **Ignored** — fixed when the session is constructed, so set them on `ClientOptions` | Flags |
| `skills`, `background` | **Inert** (`@deprecated`) — no per-query channel exists | **Inert** — no `--skills` flag, and `--bg` conflicts with `--print` |

::: warning Fixed in 0.7.0
Before 0.7.0 *no* per-query override reached the SDK session, and `signal` was a silent no-op there. Eight overrides and `signal` now work; the rest are documented as construction-time rather than being dropped without a word.
:::

## Parallel Queries

Run multiple independent queries concurrently:

```ts
const claude = new Claude()

const results = await claude.parallel([
  { prompt: 'Review src/auth.ts for security issues' },
  { prompt: 'Find dead code in src/utils/' },
  { prompt: 'Check for TypeScript strict mode violations', options: { model: 'haiku' } },
])

for (const result of results) {
  console.log(result.text)
  console.log('---')
}
```

## Model Selection

```ts
// Aliases
const claude = new Claude({ model: 'opus' })
const claude = new Claude({ model: 'sonnet' })
const claude = new Claude({ model: 'haiku' })

// Full model ID
const claude = new Claude({ model: 'claude-sonnet-4-6' })
```

### Fallback Model

Automatically fall back if the primary model is overloaded:

```ts
const claude = new Claude({
  model: 'opus',
  fallbackModel: 'sonnet',
})
```

## Effort Levels

Controls thinking depth:

```ts
import {
  Claude,
  EFFORT_LOW,
  EFFORT_MEDIUM,
  EFFORT_HIGH,
  EFFORT_XHIGH,
  EFFORT_MAX,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({ effortLevel: EFFORT_LOW })     // fast, shallow
const claude = new Claude({ effortLevel: EFFORT_MEDIUM })  // balanced
const claude = new Claude({ effortLevel: EFFORT_HIGH })    // deep thinking
const claude = new Claude({ effortLevel: EFFORT_XHIGH })   // above high
const claude = new Claude({ effortLevel: EFFORT_MAX })     // maximum depth
```

Not every model supports every level — `supportedModels()` reports `supportedEffortLevels` per model.

::: tip Change it mid-session
[`applyFlagSettings({ effortLevel })`](../api/#applyflagsettings) changes the level for the rest of an SDK session, and `{ effortLevel: null }` puts it back to whatever settings say.
:::

## System Prompt

### Override the Entire System Prompt

```ts
const claude = new Claude({
  systemPrompt: 'You are a senior Go developer. Always respond in Go idioms.',
})

const result = await claude.query('How do I handle errors?')
```

### Append to the Default System Prompt

```ts
const claude = new Claude({
  appendSystemPrompt: 'Always include test examples in your answers.',
})
```

::: warning `systemPrompt` wins
Setting both replaces the preset entirely and ignores `appendSystemPrompt` — the two are mutually exclusive. Before 0.7.0 the append silently discarded the custom prompt instead.
:::

### Split the Prompt on the Cache Boundary

The array form of `systemPrompt` splits the prompt at `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`: everything before the marker is a stable, cacheable prefix, everything after is per-run context. SDK mode only.

```ts
import { Claude, SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  systemPrompt: [
    'You are a release auditor. Follow the checklist strictly.',
    SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
    `Repo: ${repo}\nCommit: ${sha}`,
  ],
})
```

### Load It From a File

```ts
const claude = new Claude({
  useSdk: false,
  systemPromptFile: './prompts/auditor.md',
  appendSystemPromptFile: './prompts/house-style.md',
  // and for every subagent this session spawns
  appendSubagentSystemPrompt: 'Report findings as a bullet list.',
})
```

### Drop the Dynamic Sections

`excludeDynamicSystemPromptSections: true` keeps the Claude Code preset but strips its environment, git and directory sections — useful when those change every run and would otherwise break prompt caching.

### Per-Query System Prompt Override

```ts
const claude = new Claude({
  systemPrompt: 'You are a TypeScript expert.',
})

// Override for a specific query
const result = await claude.query('Explain ownership', {
  systemPrompt: 'You are a Rust expert.',
})
```

::: tip How the override lands
In CLI mode it becomes `--system-prompt`. In SDK mode the session's prompt is already fixed, so the override is prepended to the prompt text as a system instruction instead.
:::

## Piped Input (stdin)

Provide additional context alongside the prompt — equivalent to `echo "data" | claude -p "prompt"`:

```ts
import { readFileSync } from 'node:fs'

const claude = new Claude({ useSdk: false })
const logContent = readFileSync('/var/log/app.log', 'utf-8')

const result = await claude.query('Find errors in these logs', {
  input: logContent,
})
```

::: warning CLI mode
There is no stdin to pipe to in SDK mode, where the session is long-lived. Use `useSdk: false`, or fold the content into the prompt itself.
:::

### Analyze Diff Output

```ts
import { execSync } from 'node:child_process'

const diff = execSync('git diff HEAD~5').toString()

const result = await claude.query('Review these changes for bugs', {
  input: diff,
})
```

## Git Worktree Isolation

Run queries in an isolated git worktree — changes don't affect your working tree:

```ts
// Auto-generated worktree name
const result = await claude.query('Experiment with a new API design', {
  worktree: true,
})

// Named worktree
const result = await claude.query('Build the auth feature', {
  worktree: 'feature-auth',
})
```

::: tip
Worktree isolation is ideal for exploratory changes. Claude operates on a separate copy of your repo, so your working tree remains clean.
:::

::: warning CLI mode
`worktree` becomes the `--worktree` flag, so it needs `useSdk: false`. For per-agent isolation in SDK mode, set `isolation: 'worktree'` on an [`AgentConfig`](../api/types#agentconfig) instead.
:::

## Additional Directories

Grant Claude access to directories outside the main working directory:

```ts
const claude = new Claude({
  cwd: '/home/user/project',
  additionalDirs: ['/home/user/shared-lib', '/home/user/config'],
})

// Per-query additional directories (CLI mode — a flag per spawn)
const result = await claude.query('Compare our auth with the shared lib', {
  additionalDirs: ['/home/user/other-project/src'],
})
```

In SDK mode the directory set is fixed at construction, so use the client-level option.

## Thinking Config

Control Claude's extended thinking behavior (SDK mode only):

```ts
// Adaptive — Claude decides when and how deeply to think
const claude = new Claude({
  thinking: { type: 'adaptive' },
})

// Fixed budget — allocate a specific token budget for thinking
const claude = new Claude({
  thinking: { type: 'enabled', budgetTokens: 10_000 },
})

// Disabled — no extended thinking
const claude = new Claude({
  thinking: { type: 'disabled' },
})

// Per-query override
const result = await claude.query('Solve this complex math problem', {
  thinking: { type: 'enabled', budgetTokens: 50_000 },
})
```

## Per-Query Abort with `signal`

Cancel a specific query without affecting other queries or the client:

```ts
const claude = new Claude()

const controller = new AbortController()

// Abort this specific query after 10 seconds
setTimeout(() => controller.abort(), 10_000)

try {
  const result = await claude.query('Analyze the entire codebase', {
    signal: controller.signal,
  })
} catch (err) {
  console.log('Query was aborted')
}
```

::: tip
`signal` cancels a single query. `claude.abort()` kills the entire active session. Use `signal` when running parallel queries and you only want to cancel one.
:::

::: warning Fixed in 0.7.0
`signal` used to be a no-op in SDK mode — the default — so the query ran to completion regardless. It now interrupts the running turn in both modes.
:::

For a session-wide abort in SDK mode, pass your own `abortController` in `ClientOptions`: aborting it tears the whole session down.

## Runtime Model Switch

Change the model mid-session (SDK mode only):

```ts
const claude = new Claude({ model: 'sonnet' })

// Start a query, then switch model for the next turn
const r1 = await claude.query('Outline the refactoring plan')

await claude.setModel('opus')

const r2 = await claude.query('Now implement step 1 of the plan')
```

## Account & Model Info

Query account details and available models (SDK mode only):

```ts
const claude = new Claude()

// Account information
const account = await claude.accountInfo()
console.log(account.email)            // "user@example.com"
console.log(account.subscriptionType) // "max"

// List supported models
const models = await claude.supportedModels()
for (const m of models) {
  console.log(`${m.displayName} (${m.value})`)
  console.log(`  Effort levels: ${m.supportedEffortLevels?.join(', ')}`)
  console.log(`  Adaptive thinking: ${m.supportsAdaptiveThinking}`)
}
```

## Abort

Cancel a running query:

```ts
const claude = new Claude()

const promise = claude.query('Analyze the entire codebase')

// Abort after 10 seconds
setTimeout(() => claude.abort(), 10_000)

try {
  await promise
} catch (err) {
  console.log('Query was aborted')
}
```
