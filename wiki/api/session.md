# Session

Multi-turn conversation wrapper that maintains context across queries. Created via [`claude.session()`](./#session).

Each query in the session automatically resumes the same conversation using `--resume` with the session ID from the first query.

```typescript
import { Claude } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const session = claude.session()

const r1 = await session.query('Analyze the codebase')
const r2 = await session.query('Now refactor the auth module') // remembers context
console.log(session.sessionId) // same session throughout
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `sessionId` | `string \| null` | Current session ID (`null` until the first query completes) |
| `queryCount` | `number` | Number of queries executed in this session |

```typescript
const session = claude.session()
console.log(session.sessionId) // null
console.log(session.queryCount) // 0

await session.query('Hello')
console.log(session.sessionId) // 'abc-123...'
console.log(session.queryCount) // 1
```

## Methods

### query()

```typescript
query(prompt: string, options?: QueryOptions): Promise<QueryResult>
```

Execute a query within the session context. Same signature as [`claude.query()`](./#query), but automatically continues the session.

After the first query, subsequent queries use `--resume` with the session ID to maintain conversation history.

```typescript
import { Claude, PERMISSION_PLAN } from '@scottwalker/kraube-konnektor'

const session = claude.session()
const r1 = await session.query('Find all TODO comments')
const r2 = await session.query('Create issues for each one', {
  permissionMode: PERMISSION_PLAN,
})
```

### stream()

```typescript
stream(prompt: string, options?: QueryOptions): StreamHandle
```

Execute a streaming query within the session context. Returns a [`StreamHandle`](./stream-handle) that continues the session.

```typescript
import { EVENT_TEXT } from '@scottwalker/kraube-konnektor'

const session = claude.session()

// First turn
await session.stream('Analyze auth.ts')
  .on(EVENT_TEXT, (text) => process.stdout.write(text))
  .done()

// Second turn, same context
const text = await session.stream('Now improve error handling').text()
```

### abort()

```typescript
abort(): void
```

Cancel the currently running query in this session.

## Session Management Methods

These read and write the session's transcript on disk (or in the configured [`sessionStore`](./types#clientoptions)) rather than talking to a running process, so they work in **both** SDK and CLI mode.

All of them need an ID, which means: after the first query, or with `resume` / `sessionId` given up front. Without one they throw a `ValidationError` naming `sessionId`.

::: tip
Each has a module-level twin that takes a session ID instead — see [Session Management](./session-management) for reading and mutating sessions you do not have a `Session` object for.
:::

### info()

```typescript
info(options?: GetSessionInfoOptions): Promise<SessionInfo | undefined>
```

Read this session's stored metadata: title, tag, git branch, timestamps. Not cached — the transcript is rewritten by every turn, so a value read before `query()` is stale after it. Resolves to `undefined` when the session file is missing, is a sidechain, or has no extractable summary.

```typescript
const info = await session.info()
console.log(info?.customTitle ?? info?.summary, info?.gitBranch)
```

### messages()

```typescript
messages(options?: GetSessionMessagesOptions): Promise<SessionMessage[]>
```

Read this session's transcript. System messages are excluded unless `includeSystemMessages: true`.

### subagents()

```typescript
subagents(options?: ListSubagentsOptions): Promise<string[]>
```

List the `agentId` of every subagent spawned inside this session.

### subagentMessages()

```typescript
subagentMessages(agentId: string, options?: GetSubagentMessagesOptions): Promise<SessionMessage[]>
```

Read one subagent's transcript.

```typescript
for (const agentId of await session.subagents()) {
  const transcript = await session.subagentMessages(agentId)
  console.log(agentId, transcript.length)
}
```

### rename()

```typescript
rename(title: string, options?: SessionMutationOptions): Promise<void>
```

Set a custom title, surfaced afterwards as `SessionInfo.customTitle`.

### tag()

```typescript
tag(tag: string | null, options?: SessionMutationOptions): Promise<void>
```

Set or clear the session's tag. `null` clears it.

### fork()

```typescript
fork(options?: ForkSessionOptions): Promise<Session>
```

Copy this session's transcript into a new session and return a `Session` resuming it. Every message UUID is remapped and the parent chain preserved; file-history snapshots are not copied, so the fork starts without undo history. This session is left untouched.

`upToMessageId` slices the transcript, `title` names the fork. Unlike [`SessionOptions.fork`](#sessionoptions), which branches on the next turn, this copies the transcript immediately without running one.

```typescript
const branch = await session.fork({ title: 'What-if branch' })
await branch.query('Try a different approach')
```

### delete()

```typescript
delete(options?: SessionMutationOptions): Promise<void>
```

Delete this session's transcript and its subagent transcripts. Throws when the session file does not exist — on the local filesystem only; a `sessionStore` without `delete()` is a silent no-op.

The instance stays usable: its ID and query count are reset, so the next `query()` starts a fresh session instead of resuming a deleted one.

## SessionOptions

Options for creating or resuming a session. Passed to `claude.session(options)`.

```typescript
interface SessionOptions {
  resume?: string
  fork?: boolean
  continue?: boolean
  sessionId?: string
}
```

| Option | Type | Description |
|--------|------|-------------|
| `resume` | `string` | Resume an existing session by ID |
| `fork` | `boolean` | Branch on the next turn instead of continuing in place. Only meaningful with `resume` |
| `continue` | `boolean` | Continue the most recent session in the working directory |
| `sessionId` | `string` | Pin a **new** session to a caller-supplied UUID. Unlike `resume` it loads no transcript — it names the session about to be created, so the ID is known before the first query completes. Fails if a session with that ID already exists |

::: warning Mutual exclusivity
`resume` and `continue` are mutually exclusive. `sessionId` cannot be combined with either unless `fork` is also set.
:::

### Resume an existing session

```typescript
const session = claude.session({ resume: 'previous-session-id' })
await session.query('Continue where we left off')
```

### Fork a session

```typescript
const forked = claude.session({
  resume: 'previous-session-id',
  fork: true,
})
// New session branching from the original
await forked.query('Try a different approach')
```

### Continue the most recent session

```typescript
const session = claude.session({ continue: true })
await session.query('What were we working on?')
```

### Know the ID up front

```typescript
import { randomUUID } from 'node:crypto'

const id = randomUUID()
const session = claude.session({ sessionId: id })
console.log('logging under', id) // usable before the first query runs
await session.query('Start the audit')
```
