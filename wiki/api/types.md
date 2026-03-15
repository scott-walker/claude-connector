# Types

All TypeScript interfaces and type aliases exported by the package.

```typescript
import type {
  ClientOptions,
  QueryOptions,
  QueryResult,
  StreamEvent,
  TokenUsage,
  Message,
  PermissionMode,
  EffortLevel,
} from '@scottwalker/claude-connector'
```

## ClientOptions

Configuration for the Claude client instance. Options set here act as defaults for all queries.

```typescript
interface ClientOptions {
  useSdk?: boolean
  executable?: string
  cwd?: string
  model?: string
  effortLevel?: EffortLevel
  fallbackModel?: string
  permissionMode?: PermissionMode
  allowedTools?: readonly string[]
  disallowedTools?: readonly string[]
  tools?: readonly string[]
  systemPrompt?: string
  appendSystemPrompt?: string
  maxTurns?: number
  maxBudget?: number
  additionalDirs?: readonly string[]
  mcpConfig?: string | readonly string[]
  mcpServers?: Record<string, McpServerConfig>
  agents?: Record<string, AgentConfig>
  agent?: string
  hooks?: HooksConfig
  env?: Record<string, string>
  noSessionPersistence?: boolean
  name?: string
  strictMcpConfig?: boolean
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `useSdk` | `boolean` | `true` | Use Agent SDK (persistent session) instead of CLI mode |
| `executable` | `string` | `'claude'` | Path to CLI binary |
| `cwd` | `string` | `process.cwd()` | Working directory |
| `model` | `string` | `'sonnet'` | Model: `'opus'`, `'sonnet'`, `'haiku'`, or full ID |
| `effortLevel` | [`EffortLevel`](#effortlevel) | -- | Thinking depth |
| `fallbackModel` | `string` | -- | Auto-fallback model on failure |
| `permissionMode` | [`PermissionMode`](#permissionmode) | `'default'` | Tool approval behavior |
| `allowedTools` | `string[]` | -- | Auto-approved tools (supports glob patterns) |
| `disallowedTools` | `string[]` | -- | Always-denied tools |
| `tools` | `string[]` | -- | Restrict available built-in tools (`--tools`) |
| `systemPrompt` | `string` | -- | Replace entire system prompt |
| `appendSystemPrompt` | `string` | -- | Append to default system prompt |
| `maxTurns` | `number` | -- | Max agentic turns per query |
| `maxBudget` | `number` | -- | Max spend in USD per query |
| `additionalDirs` | `string[]` | -- | Extra working directories |
| `mcpConfig` | `string \| string[]` | -- | Path(s) to MCP config JSON files |
| `mcpServers` | `Record<string, McpServerConfig>` | -- | Inline MCP server definitions |
| `agents` | `Record<string, AgentConfig>` | -- | Custom subagent definitions |
| `agent` | `string` | -- | Select preconfigured agent |
| `hooks` | [`HooksConfig`](#hooksconfig) | -- | Lifecycle hooks |
| `env` | `Record<string, string>` | -- | Extra environment variables |
| `noSessionPersistence` | `boolean` | -- | Don't save sessions to disk |
| `name` | `string` | -- | Display name for the session |
| `strictMcpConfig` | `boolean` | -- | Ignore MCP servers not in `mcpConfig` |

::: tip tools vs allowedTools
`tools` limits which tools **exist** (are available to Claude). `allowedTools` controls which existing tools are **auto-approved** without prompting.
:::

## QueryOptions

Per-query overrides. Any field set here takes precedence over `ClientOptions` for the duration of a single query.

```typescript
interface QueryOptions {
  cwd?: string
  model?: string
  effortLevel?: EffortLevel
  permissionMode?: PermissionMode
  allowedTools?: readonly string[]
  disallowedTools?: readonly string[]
  tools?: readonly string[]
  systemPrompt?: string
  appendSystemPrompt?: string
  maxTurns?: number
  maxBudget?: number
  input?: string
  schema?: Record<string, unknown>
  worktree?: boolean | string
  additionalDirs?: readonly string[]
  env?: Record<string, string>
  agent?: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cwd` | `string` | Override working directory |
| `model` | `string` | Override model |
| `effortLevel` | [`EffortLevel`](#effortlevel) | Override effort level |
| `permissionMode` | [`PermissionMode`](#permissionmode) | Override permission mode |
| `allowedTools` | `string[]` | Override allowed tools |
| `disallowedTools` | `string[]` | Override disallowed tools |
| `tools` | `string[]` | Override available built-in tools |
| `systemPrompt` | `string` | Override system prompt |
| `appendSystemPrompt` | `string` | Override appended system prompt |
| `maxTurns` | `number` | Override max turns |
| `maxBudget` | `number` | Override max budget |
| `input` | `string` | Piped stdin data (like `echo data \| claude`) |
| `schema` | `object` | JSON Schema for structured output |
| `worktree` | `boolean \| string` | Run in isolated git worktree (`true` for auto name) |
| `additionalDirs` | `string[]` | Override additional directories |
| `env` | `Record<string, string>` | Override environment variables |
| `agent` | `string` | Override agent for this query |

## QueryResult

Returned from [`claude.query()`](./#query) and [`session.query()`](./session#query).

```typescript
interface QueryResult {
  readonly text: string
  readonly sessionId: string
  readonly usage: TokenUsage
  readonly cost: number | null
  readonly durationMs: number
  readonly messages: readonly Message[]
  readonly structured: unknown | null
  readonly raw: Record<string, unknown>
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Text response from Claude |
| `sessionId` | `string` | Session ID for resuming |
| `usage` | [`TokenUsage`](#tokenusage) | Token usage statistics |
| `cost` | `number \| null` | Cost in USD |
| `durationMs` | `number` | Wall-clock duration in milliseconds |
| `messages` | [`Message[]`](#message) | Full conversation history |
| `structured` | `unknown \| null` | Structured output (when `schema` is used) |
| `raw` | `object` | Raw CLI JSON response (for advanced use) |

## StreamEvent

Discriminated union of all streaming event types. Check `event.type` to narrow.

```typescript
type StreamEvent =
  | StreamTextEvent
  | StreamToolUseEvent
  | StreamResultEvent
  | StreamErrorEvent
  | StreamSystemEvent
```

| Type | Constant | Key Fields |
|------|----------|------------|
| `StreamTextEvent` | `EVENT_TEXT` | `text: string` |
| `StreamToolUseEvent` | `EVENT_TOOL_USE` | `toolName: string`, `toolInput: object` |
| `StreamResultEvent` | `EVENT_RESULT` | `text`, `sessionId`, `usage`, `cost`, `durationMs` |
| `StreamErrorEvent` | `EVENT_ERROR` | `message: string`, `code?: string` |
| `StreamSystemEvent` | `EVENT_SYSTEM` | `subtype: string`, `data: object` |

### StreamTextEvent

```typescript
interface StreamTextEvent {
  readonly type: 'text'
  readonly text: string // incremental text chunk
}
```

### StreamToolUseEvent

```typescript
interface StreamToolUseEvent {
  readonly type: 'tool_use'
  readonly toolName: string // e.g. 'Read', 'Bash'
  readonly toolInput: Record<string, unknown>
}
```

### StreamResultEvent

```typescript
interface StreamResultEvent {
  readonly type: 'result'
  readonly text: string
  readonly sessionId: string
  readonly usage: TokenUsage
  readonly cost: number | null
  readonly durationMs: number
}
```

### StreamErrorEvent

```typescript
interface StreamErrorEvent {
  readonly type: 'error'
  readonly message: string
  readonly code?: string
}
```

### StreamSystemEvent

```typescript
interface StreamSystemEvent {
  readonly type: 'system'
  readonly subtype: string
  readonly data: Record<string, unknown>
}
```

## TokenUsage

```typescript
interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}
```

## Message

A single message in the conversation history.

```typescript
interface Message {
  readonly role: 'user' | 'assistant'
  readonly content: string | readonly ContentBlock[]
}
```

## ContentBlock

Discriminated union of content block types within a message.

```typescript
type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock
```

### TextBlock

```typescript
interface TextBlock {
  readonly type: 'text'
  readonly text: string
}
```

### ToolUseBlock

```typescript
interface ToolUseBlock {
  readonly type: 'tool_use'
  readonly id: string
  readonly name: string
  readonly input: Record<string, unknown>
}
```

### ToolResultBlock

```typescript
interface ToolResultBlock {
  readonly type: 'tool_result'
  readonly tool_use_id: string
  readonly content: string
}
```

## PermissionMode

```typescript
type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'dontAsk'
  | 'bypassPermissions'
  | 'auto'
```

| Value | Constant | Description |
|-------|----------|-------------|
| `'default'` | `PERMISSION_DEFAULT` | Prompt on first use |
| `'acceptEdits'` | `PERMISSION_ACCEPT_EDITS` | Auto-accept file edits |
| `'plan'` | `PERMISSION_PLAN` | Read-only, no modifications |
| `'dontAsk'` | `PERMISSION_DONT_ASK` | Skip permission prompts |
| `'bypassPermissions'` | `PERMISSION_BYPASS` | Skip all checks (dangerous) |
| `'auto'` | `PERMISSION_AUTO` | Automatically approve tools |

## EffortLevel

```typescript
type EffortLevel = 'low' | 'medium' | 'high' | 'max'
```

| Value | Constant | Description |
|-------|----------|-------------|
| `'low'` | `EFFORT_LOW` | Quick, minimal thinking |
| `'medium'` | `EFFORT_MEDIUM` | Balanced |
| `'high'` | `EFFORT_HIGH` | Deep analysis |
| `'max'` | `EFFORT_MAX` | Maximum depth |

## McpServerConfig

Configuration for an inline MCP server definition.

```typescript
interface McpServerConfig {
  readonly type?: 'stdio' | 'http' | 'sse'
  readonly command?: string
  readonly args?: readonly string[]
  readonly url?: string
  readonly env?: Record<string, string>
  readonly headers?: Record<string, string>
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'stdio' \| 'http' \| 'sse'` | Transport type |
| `command` | `string` | Command to start stdio server |
| `args` | `string[]` | Arguments for stdio server command |
| `url` | `string` | URL for http/sse server |
| `env` | `Record<string, string>` | Environment variables for the server process |
| `headers` | `Record<string, string>` | HTTP headers for http/sse servers |

```typescript
import { Claude } from '@scottwalker/claude-connector'

const claude = new Claude({
  mcpServers: {
    filesystem: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    },
    remote: {
      type: 'sse',
      url: 'https://mcp.example.com/sse',
      headers: { Authorization: 'Bearer token' },
    },
  },
})
```

## AgentConfig

Configuration for a custom subagent.

```typescript
interface AgentConfig {
  readonly description: string
  readonly prompt?: string
  readonly model?: string
  readonly tools?: readonly string[]
  readonly disallowedTools?: readonly string[]
  readonly permissionMode?: PermissionMode
  readonly maxTurns?: number
  readonly isolation?: 'worktree'
  readonly background?: boolean
}
```

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | When to delegate to this agent |
| `prompt` | `string` | Initial prompt / instructions |
| `model` | `string` | Model: `'opus'`, `'sonnet'`, `'haiku'`, `'inherit'` |
| `tools` | `string[]` | Tools available to this agent |
| `disallowedTools` | `string[]` | Tools denied to this agent |
| `permissionMode` | [`PermissionMode`](#permissionmode) | Permission mode for this agent |
| `maxTurns` | `number` | Max agentic turns |
| `isolation` | `'worktree'` | Run in isolated git worktree |
| `background` | `boolean` | Always run as background task |

```typescript
import { Claude, PERMISSION_PLAN } from '@scottwalker/claude-connector'

const claude = new Claude({
  agents: {
    reviewer: {
      description: 'Code review specialist',
      prompt: 'You are a senior code reviewer. Focus on security and performance.',
      model: 'opus',
      permissionMode: PERMISSION_PLAN,
    },
    fixer: {
      description: 'Bug fixer that works in isolation',
      model: 'sonnet',
      isolation: 'worktree',
      maxTurns: 10,
    },
  },
})
```

## HookEntry

A single hook command to execute at a lifecycle point.

```typescript
interface HookEntry {
  readonly command: string
  readonly timeout?: number
}
```

| Field | Type | Description |
|-------|------|-------------|
| `command` | `string` | Shell command to execute |
| `timeout` | `number` | Timeout in seconds |

## HookMatcher

Matches tool names to hook entries.

```typescript
interface HookMatcher {
  readonly matcher: string
  readonly hooks: readonly HookEntry[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `matcher` | `string` | Regex pattern to match tool names |
| `hooks` | [`HookEntry[]`](#hookentry) | Hook entries to execute when matched |

## HooksConfig

Lifecycle hooks configuration.

```typescript
interface HooksConfig {
  readonly PreToolUse?: readonly HookMatcher[]
  readonly PostToolUse?: readonly HookMatcher[]
  readonly Stop?: readonly HookMatcher[]
  readonly [key: string]: readonly HookMatcher[] | undefined
}
```

| Hook | When |
|------|------|
| `PreToolUse` | Before a tool is executed |
| `PostToolUse` | After a tool completes |
| `Stop` | When Claude stops |

```typescript
const claude = new Claude({
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [{ command: 'echo "Running bash command"', timeout: 5 }],
      },
    ],
    PostToolUse: [
      {
        matcher: '.*',
        hooks: [{ command: 'echo "Tool finished"' }],
      },
    ],
  },
})
```

## SessionInfo

Metadata about a stored session (returned by session listing APIs).

```typescript
interface SessionInfo {
  readonly sessionId: string
  readonly name?: string
  readonly summary?: string
  readonly lastActive: string
  readonly cwd: string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Unique session identifier |
| `name` | `string` | Human-readable session name (if renamed) |
| `summary` | `string` | Brief summary of the session |
| `lastActive` | `string` | ISO 8601 timestamp of last activity |
| `cwd` | `string` | Working directory associated with the session |
