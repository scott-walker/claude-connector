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
result.usage          // { inputTokens: number, outputTokens: number }
result.cost           // number | null — USD cost
result.durationMs     // number — wall-clock time
result.messages       // Message[] — full conversation history
result.structured     // unknown | null — parsed JSON when schema was used
result.raw            // Record<string, unknown> — raw CLI JSON response
```

### Accessing Message History

```ts
import {
  Claude,
  BLOCK_TEXT,
  BLOCK_TOOL_USE,
  BLOCK_TOOL_RESULT,
} from '@scottwalker/claude-connector'

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

Any `ClientOptions` field that has a `QueryOptions` counterpart can be overridden per-query:

```ts
import {
  Claude,
  PERMISSION_PLAN,
  PERMISSION_ACCEPT_EDITS,
  EFFORT_MEDIUM,
  EFFORT_MAX,
} from '@scottwalker/claude-connector'

const claude = new Claude({
  model: 'sonnet',
  maxTurns: 10,
  maxBudget: 5.0,
  permissionMode: PERMISSION_PLAN,
  effortLevel: EFFORT_MEDIUM,
  systemPrompt: 'You are a helpful assistant.',
  allowedTools: ['Read', 'Glob'],
  tools: ['Read', 'Glob', 'Grep', 'Bash'],
})

// Override everything for one query
const result = await claude.query('Fix the critical bug NOW', {
  model: 'opus',
  maxTurns: 50,
  maxBudget: 20.0,
  permissionMode: PERMISSION_ACCEPT_EDITS,
  effortLevel: EFFORT_MAX,
  systemPrompt: 'You are an emergency bug fixer. Act fast.',
  allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Bash'],
  tools: ['default'],
  cwd: '/home/user/production-hotfix',
  additionalDirs: ['/home/user/shared-config'],
  env: { HOTFIX: 'true' },
  agent: 'fixer',
  worktree: 'hotfix-branch',
})
```

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
  EFFORT_MAX,
} from '@scottwalker/claude-connector'

const claude = new Claude({ effortLevel: EFFORT_LOW })    // fast, shallow
const claude = new Claude({ effortLevel: EFFORT_MEDIUM })  // balanced
const claude = new Claude({ effortLevel: EFFORT_HIGH })    // deep thinking
const claude = new Claude({ effortLevel: EFFORT_MAX })     // maximum depth
```

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

## Piped Input (stdin)

Provide additional context alongside the prompt — equivalent to `echo "data" | claude -p "prompt"`:

```ts
import { readFileSync } from 'node:fs'

const logContent = readFileSync('/var/log/app.log', 'utf-8')

const result = await claude.query('Find errors in these logs', {
  input: logContent,
})
```

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

## Additional Directories

Grant Claude access to directories outside the main working directory:

```ts
const claude = new Claude({
  cwd: '/home/user/project',
  additionalDirs: ['/home/user/shared-lib', '/home/user/config'],
})

// Per-query additional directories
const result = await claude.query('Compare our auth with the shared lib', {
  additionalDirs: ['/home/user/other-project/src'],
})
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
