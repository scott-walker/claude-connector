# Session

Multi-turn conversation wrapper that maintains context across queries. Created via [`claude.session()`](./#session).

Each query in the session automatically resumes the same conversation using `--resume` with the session ID from the first query.

```typescript
import { Claude } from '@scottwalker/claude-connector'

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
import { Claude, PERMISSION_PLAN } from '@scottwalker/claude-connector'

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
import { EVENT_TEXT } from '@scottwalker/claude-connector'

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

## SessionOptions

Options for creating or resuming a session. Passed to `claude.session(options)`.

```typescript
interface SessionOptions {
  resume?: string
  fork?: boolean
  continue?: boolean
}
```

| Option | Type | Description |
|--------|------|-------------|
| `resume` | `string` | Resume an existing session by ID |
| `fork` | `boolean` | Fork the session instead of continuing in-place (only with `resume`) |
| `continue` | `boolean` | Continue the most recent session in the working directory |

::: warning Mutual exclusivity
`resume` and `continue` are mutually exclusive. Use one or the other.
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
