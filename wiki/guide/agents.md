# Agents

Define specialized subagents with their own model, tools, permissions, and prompt.

## Define Agents

```ts
import {
  Claude,
  PERMISSION_PLAN,
  PERMISSION_ACCEPT_EDITS,
} from '@scottwalker/kraube-konnektor'

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

## Scoping an Agent

Beyond model and tools, an agent can be given its own skills, MCP servers, memory tier and reasoning depth — and an observer that watches it.

```ts
import { Claude, EFFORT_HIGH, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  mcpServers: { linear: { type: 'http', url: 'https://mcp.linear.app/mcp' } },
  agents: {
    auditor: {
      description: 'Audits a release against the checklist',
      prompt: 'You are a release auditor.',
      model: 'opus',
      effort: EFFORT_HIGH,
      permissionMode: PERMISSION_PLAN,
      // only these skills, only this MCP server
      skills: ['pdf'],
      mcpServers: ['linear'],
      // read project memory (CLAUDE.md) rather than the user tier
      memory: 'project',
      // seed the agent's first turn
      initialPrompt: 'Start from the CHANGELOG.',
      // a second agent watches this one
      observer: 'reviewer',
      observerMessage: 'Flag anything the auditor skipped.',
    },
  },
})
```

`mcpServers` accepts either the name of a server already configured on the client, or an inline definition map. See [`AgentConfig`](../api/types#agentconfig) for the complete field list.

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

## Subagent Control

You can stop a running subagent task by its task ID. This is useful when a long-running agent needs to be cancelled programmatically:

```ts
import { Claude, EVENT_TASK_STARTED } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  agents: {
    researcher: {
      description: 'Deep codebase analysis',
      prompt: 'Explore the codebase thoroughly.',
      model: 'opus',
    },
  },
  agent: 'researcher',
})

let taskId: string | undefined

const handle = claude.stream('Analyze the entire repository')
  .on(EVENT_TASK_STARTED, (event) => {
    taskId = event.taskId
    console.log(`Task started: ${taskId}`)
  })

// Stop the task after 30 seconds
setTimeout(() => {
  if (taskId) claude.stopTask(taskId)
}, 30_000)

const result = await handle.done()
```

## Task Events

When agents spawn subagent tasks, the stream emits task lifecycle events. Use these to monitor subagent progress in real time:

```ts
import {
  Claude,
  EVENT_TASK_STARTED,
  EVENT_TASK_PROGRESS,
  EVENT_TASK_NOTIFICATION,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  agents: {
    reviewer: { description: 'Code reviewer', prompt: 'Review code.', model: 'opus' },
    fixer: { description: 'Bug fixer', prompt: 'Fix bugs.', model: 'sonnet' },
  },
})

const result = await claude.stream('Review and fix the auth module', { agent: 'reviewer' })
  .on(EVENT_TASK_STARTED, (event) => {
    console.log(`[${event.taskType}] Task ${event.taskId} started`)
  })
  .on(EVENT_TASK_PROGRESS, (event) => {
    console.log(`[Task ${event.taskId}] ${event.description}`)
  })
  .on(EVENT_TASK_NOTIFICATION, (event) => {
    console.log(`[Task ${event.taskId}] ${event.status}: ${event.summary}`)
  })
  .done()
```

## Agent Progress Summaries

Enable `agentProgressSummaries` to receive condensed progress updates from subagent tasks. This is especially useful in multi-agent workflows where you want a high-level view of what each agent is doing without verbose event-level output:

```ts
const claude = new Claude({
  agents: {
    reviewer: { description: 'Code reviewer', prompt: 'Review code.', model: 'opus' },
    fixer: { description: 'Bug fixer', prompt: 'Fix bugs.', model: 'sonnet' },
  },
  agentProgressSummaries: true,
})

const result = await claude.query('Review and fix the auth module')
```

When enabled, the stream includes summarized progress messages from each subagent, making it easier to track multi-agent orchestration in logs or UIs.
