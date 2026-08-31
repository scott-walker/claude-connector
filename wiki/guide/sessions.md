# Sessions

Multi-turn conversations with persistent context.

## New Session

```ts
const claude = new Claude()
const session = claude.session()

const r1 = await session.query('What files are in src/?')
console.log(r1.text)

const r2 = await session.query('Refactor the largest file')
// Claude remembers the previous context
console.log(r2.text)

console.log(session.sessionId)  // "abc-123-..." (captured after first query)
console.log(session.queryCount) // 2
```

## Resume an Existing Session

```ts
const session = claude.session({ resume: 'abc-123-def-456' })

const result = await session.query('Continue where we left off')
```

::: tip
Session IDs are returned in every `QueryResult.sessionId`. Save them to resume conversations later — even across process restarts.
:::

## Continue the Most Recent Session

```ts
const session = claude.session({ continue: true })

const result = await session.query('What were we working on?')
```

## Pin the Session ID

`sessionId` names a **new** session up front instead of loading an existing one, so the ID is usable for logging and correlation before the first query completes.

```ts
import { randomUUID } from 'node:crypto'

const id = randomUUID()
const session = claude.session({ sessionId: id })

logger.info({ sessionId: id }, 'starting audit') // already known
await session.query('Start the audit')
```

Creation fails if a session with that ID already exists. `sessionId` cannot be combined with `resume` or `continue` unless `fork` is also set — the client constructor rejects the combination rather than letting the CLI fail later.

## Resume at a Specific Point

`resumeSessionAt` is a chain-entry UUID: resume only up to and including that message — the transcript-side half of [`rewindFiles()`](../api/#rewindfiles). `resumeDropsTurn` guards it by naming the prompt UUID the truncating resume intends to discard, so a mismatch is refused rather than silently rewriting a different turn.

```ts
import { Claude, RESUME_REJECTED_PREFIX, EVENT_ERROR } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  resume: sessionId,
  resumeSessionAt: messageUuid,
  resumeDropsTurn: expectedTurnUuid,
})

await claude.stream('Take the other branch')
  .on(EVENT_ERROR, (event) => {
    if (event.message.startsWith(RESUME_REJECTED_PREFIX)) {
      // deterministic — route to a rewind path, never retry
    }
  })
  .done()
```

The refusal arrives as an `error` stream event and in `result.errors`; it is not thrown.

## Fork a Session

Create a new branch from an existing session:

```ts
const session = claude.session({
  resume: 'original-session-id',
  fork: true,
})

// New session ID, but starts with the context of the original
const result = await session.query('Try a different approach')
```

## Streaming in Sessions

```ts
import { Claude, EVENT_TEXT } from '@scottwalker/kraube-konnektor'

const claude = new Claude()
const session = claude.session()

for await (const event of session.stream('Analyze the codebase')) {
  if (event.type === EVENT_TEXT) process.stdout.write(event.text)
}

// Session ID is captured from the stream result
console.log(session.sessionId)

// Subsequent queries continue the conversation
const r2 = await session.query('Now fix the bugs you found')
```

### Streaming with Fluent API

```ts
import { EVENT_TEXT } from '@scottwalker/kraube-konnektor'

const session = claude.session()

// Turn 1 — stream
const text1 = await session.stream('Analyze the architecture')
  .on(EVENT_TEXT, (t) => process.stdout.write(t))
  .text()

console.log('\n---')

// Turn 2 — stream (Claude remembers turn 1)
const result = await session.stream('Now write tests for the weakest module')
  .on(EVENT_TEXT, (t) => process.stdout.write(t))
  .done()

console.log(`\nSession: ${session.sessionId}`)
```

## Session Properties

| Property | Type | Description |
|----------|------|-------------|
| `sessionId` | `string \| null` | Session ID, available after the first query |
| `queryCount` | `number` | Number of queries executed in this session |

## Session Persistence

Disable session persistence for ephemeral/CI workloads:

```ts
const claude = new Claude({
  noSessionPersistence: true,
})

// Sessions are not saved to disk and cannot be resumed
const result = await claude.query('Run CI checks')
```

## Session Name

Set a display name visible in `/resume` and the terminal title:

```ts
const claude = new Claude({
  name: 'deploy-review-march-2026',
})
```

## Abort Within a Session

```ts
const session = claude.session()
const promise = session.query('Long analysis...')

setTimeout(() => session.abort(), 5_000)
```

## Session Utilities

Sessions that are not currently running can still be listed, read, renamed, tagged, forked and deleted. Every helper has two forms: a method on a live [`Session`](../api/session), and a module-level function taking a session ID.

Full reference: [Session Management](../api/session-management).

### Browse Past Sessions

```ts
import { listSessions } from '@scottwalker/kraube-konnektor'

const sessions = await listSessions({
  dir: '/home/user/project',
  limit: 10,
  includeWorktrees: false,
})

for (const s of sessions) {
  console.log(`${s.sessionId} — ${s.summary}`)
  console.log(`  ${new Date(s.lastModified).toLocaleString()}  ${s.gitBranch ?? ''}`)
}
```

Omitting `dir` scans every project directory. Headless runs made by this library are included unless you pass `includeProgrammatic: false`.

### Read One Session

```ts
import { getSessionInfo, getSessionMessages } from '@scottwalker/kraube-konnektor'

const info = await getSessionInfo(sessionId, { dir: process.cwd() })
if (!info) return // not found, a subagent transcript, or no extractable summary

const messages = await getSessionMessages(sessionId, { limit: 50 })
for (const m of messages) console.log(`[${m.type}] ${m.uuid}`)
```

`getSessionInfo()` resolves to `undefined` rather than throwing when there is nothing to read.

### Read Subagent Transcripts

`task_started` and `task_progress` report subagent activity live; these read it back afterwards.

```ts
import { listSubagents, getSubagentMessages } from '@scottwalker/kraube-konnektor'

for (const agentId of await listSubagents(sessionId)) {
  const transcript = await getSubagentMessages(sessionId, agentId)
  console.log(agentId, transcript.length, 'messages')
}
```

`SessionMessage.parent_agent_id` is what lets a flat transcript be reassembled into a subagent tree.

### Rename, Tag, Delete

```ts
import { renameSession, tagSession, deleteSession } from '@scottwalker/kraube-konnektor'

await renameSession(sessionId, 'Auth refactor')
await tagSession(sessionId, 'release-audit')
await tagSession(sessionId, null)          // clear the tag
await deleteSession(sessionId)             // throws when not found
```

The same operations on a live session:

```ts
const session = claude.session({ resume: sessionId })
await session.rename('Auth refactor')
await session.tag('release-audit')
await session.delete()   // instance stays usable; the next query starts fresh
```

### Copy a Session

`forkSession()` copies a transcript into a brand-new session, remapping every message UUID and preserving the parent chain — no turn is run, so the fork is usable immediately.

```ts
import { forkSession } from '@scottwalker/kraube-konnektor'

const { sessionId: branchId } = await forkSession(original, { title: 'What-if branch' })
const branch = claude.session({ resume: branchId })
await branch.query('Try a different approach')

// Or straight from a live session
const other = await claude.session({ resume: original }).fork({ title: 'Plan B' })
```

::: warning Two different forks
`claude.session({ resume, fork: true })` is the `--fork-session` flag: it branches on the **next turn**. `forkSession()` copies the transcript **now**. Forks start without undo history — file-history snapshots are not copied.
:::

## Custom Session Storage

`sessionStore` mirrors transcripts into your own backend. Writes happen after the subprocess's local write succeeds, so durability is never at risk if the mirror fails — a failed batch surfaces as a `mirror_error` stream event and the run continues.

```ts
import { Claude, createInMemorySessionStore } from '@scottwalker/kraube-konnektor'

const store = await createInMemorySessionStore()
const claude = new Claude({ sessionStore: store, sessionStoreFlush: 'eager' })

await claude.query('Start the audit')
console.log(store.size)
```

A real adapter implements `append()` and `load()`; `listSessions()`, `listSessionSummaries()`, `delete()` and `listSubkeys()` are optional and unlock listing, deletion and subagent resume respectively.

```ts
import { loadSessionStoreHelpers } from '@scottwalker/kraube-konnektor'
import type { SessionStore } from '@scottwalker/kraube-konnektor'

const { foldSessionSummary } = await loadSessionStoreHelpers()

const store: SessionStore = {
  async append(key, entries) {
    const prev = await db.readSummary(key)
    const next = foldSessionSummary(prev, key, entries, { mtime: Date.now() })
    await db.write(key, entries, next)
  },
  async load(key) {
    return (await db.read(key)) ?? null
  },
}
```

::: warning Idempotency and exclusivity
`append()` is retried three times on rejection, so treat `SessionStoreEntry.uuid` as an idempotency key. `sessionStore` cannot be combined with `noSessionPersistence` — the mirror runs after a successful local write, so with local persistence off there is nothing to mirror.
:::

## File Checkpointing

Track file changes during a session and rewind them to a previous state (SDK mode only):

`rewindFiles()` takes the uuid of the **user message** to restore to — not a
session id. Capture it from the stream (`partial_message` carries
`userMessageUuid`) or from your own record of the turn; `QueryResult.messages` is
always `[]` in SDK mode, so it is not the place to look.

```ts
import { Claude, EVENT_PARTIAL_MESSAGE } from '@scottwalker/kraube-konnektor'

const claude = new Claude({
  enableFileCheckpointing: true,
  includePartialMessages: true,
})

let turnUuid = ''
await claude
  .stream('Refactor the auth module')
  .on(EVENT_PARTIAL_MESSAGE, (event) => { turnUuid = event.userMessageUuid ?? turnUuid })
  .done()

// Rewind files to the state before the refactoring
const rewind = await claude.rewindFiles(turnUuid, {
  dryRun: true, // preview only — no files changed
})

console.log('Can rewind:', rewind.canRewind)
console.log('Files affected:', rewind.filesChanged)
console.log('Insertions:', rewind.insertions)
console.log('Deletions:', rewind.deletions)

// Actually rewind (omit dryRun or set to false)
if (rewind.canRewind) {
  const result = await claude.rewindFiles(turnUuid)
  console.log('Files reverted:', result.filesChanged, result.skippedLinks ?? 0)
}
```

::: tip
Use `dryRun: true` first to preview which files would change. The `userMessageId` identifies the point in time to rewind to. The transcript-side half is `resumeSessionAt`, which resumes only up to a given message uuid.
:::
