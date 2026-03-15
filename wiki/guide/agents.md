# Agents

Define specialized subagents with their own model, tools, permissions, and prompt.

## Define Agents

```ts
import {
  Claude,
  PERMISSION_PLAN,
  PERMISSION_ACCEPT_EDITS,
} from '@scottwalker/claude-connector'

const claude = new Claude({
  agents: {
    reviewer: {
      description: 'Reviews code for quality and security issues',
      prompt: 'You are a senior code reviewer. Focus on security, performance, and maintainability.',
      model: 'opus',
      tools: ['Read', 'Glob', 'Grep'],
      permissionMode: PERMISSION_PLAN,
      maxTurns: 10,
    },
    fixer: {
      description: 'Fixes bugs and implements features',
      prompt: 'You fix bugs. Be minimal and precise.',
      model: 'sonnet',
      permissionMode: PERMISSION_ACCEPT_EDITS,
    },
    researcher: {
      description: 'Explores codebases and answers questions',
      prompt: 'You are a codebase explorer.',
      model: 'haiku',
      tools: ['Read', 'Glob', 'Grep'],
      isolation: 'worktree',
      background: true,
    },
  },
  agent: 'reviewer', // default agent for all queries
})

const result = await claude.query('Review the auth module')
```

## Select an Agent

Set a default agent for all queries:

```ts
const claude = new Claude({
  agents: { /* ... */ },
  agent: 'reviewer',
})
```

## Per-Query Agent Switch

Override the default agent for a specific query:

```ts
// Uses the default 'reviewer' agent
const review = await claude.query('Review src/auth.ts')

// Switch to 'fixer' for this query
const fix = await claude.query('Fix the SQL injection in auth.ts', {
  agent: 'fixer',
})
```

::: tip
Agents are a powerful way to create specialized workflows. A `reviewer` agent with read-only tools can analyze code safely, while a `fixer` agent with edit permissions can apply changes.
:::
