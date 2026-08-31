# Session Management

Module-level functions for working with sessions that are **not** currently running: list them, read their transcripts, rename, tag, fork or delete them, and mirror them into your own storage.

```typescript
import {
  listSessions,
  getSessionInfo,
  getSessionMessages,
  listSubagents,
  getSubagentMessages,
  forkSession,
  renameSession,
  tagSession,
  deleteSession,
  importSessionToStore,
  createInMemorySessionStore,
  loadSessionStoreHelpers,
  resolveSettings,
  loadSettingsHelpers,
} from '@scottwalker/kraube-konnektor'
```

::: tip Two ways in
Everything here also exists as a method on a live [`Session`](./session) — `session.info()`, `session.messages()`, `session.rename()` and so on operate on that session's own ID. The functions below take a session ID, so they work without a client instance.
:::

::: warning Requires the Agent SDK
These functions load the Agent SDK lazily on first call. They read local session storage (or a [`SessionStore`](#sessionstore)) directly — they do not spawn the CLI.
:::

## Common options

Most functions accept a `dir` (which project directory to look in — defaults to a scan of all of them) and a `sessionStore` (read from a custom backend instead of the local projects directory).

## listSessions()

```typescript
listSessions(options?: ListSessionsOptions): Promise<SessionInfo[]>
```

List stored sessions, newest first. Omitting `dir` scans every project directory; passing it restricts the scan to one project and, by default, its git worktrees. Headless runs made by this library are included unless `includeProgrammatic: false`.

| Option | Type | Description |
|--------|------|-------------|
| `dir` | `string` | Restrict to one project directory |
| `limit` | `number` | Max sessions to return |
| `offset` | `number` | Skip this many |
| `includeWorktrees` | `boolean` | Include the project's git worktrees |
| `includeProgrammatic` | `boolean` | Include headless runs (default `true`) |
| `sessionStore` | [`SessionStore`](#sessionstore) | Read from a custom backend |

```typescript
const recent = await listSessions({ dir: process.cwd(), limit: 10 })
for (const s of recent) {
  console.log(s.sessionId, s.summary, new Date(s.lastModified).toISOString())
}
```

## getSessionInfo()

```typescript
getSessionInfo(sessionId: string, options?: GetSessionInfoOptions): Promise<SessionInfo | undefined>
```

Read one session's metadata without scanning the whole project. Resolves to `undefined` — never throws — for a session that does not exist, is a subagent (sidechain) transcript, or has no extractable summary.

```typescript
const info = await getSessionInfo(sessionId, { dir: process.cwd() })
if (info) console.log(info.customTitle ?? info.summary, info.gitBranch)
```

## getSessionMessages()

```typescript
getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<SessionMessage[]>
```

Read a session's transcript. System messages (compact boundaries, informational notices) are excluded unless `includeSystemMessages: true`.

| Option | Type | Description |
|--------|------|-------------|
| `dir` | `string` | Project directory |
| `limit` / `offset` | `number` | Pagination |
| `includeSystemMessages` | `boolean` | Include system entries |
| `sessionStore` | [`SessionStore`](#sessionstore) | Read from a custom backend |

```typescript
const messages = await getSessionMessages(sessionId, { limit: 50 })
for (const m of messages) console.log(`[${m.type}] ${m.uuid}`)
```

Use `parent_agent_id` on the returned [`SessionMessage`](./types#sessionmessage)s to rebuild the subagent tree from the flat list.

## listSubagents()

```typescript
listSubagents(sessionId: string, options?: ListSubagentsOptions): Promise<string[]>
```

List the `agentId` of every subagent spawned inside a session. These identify *spawned* transcripts — unrelated to [`AgentInfo`](./types#agentinfo), which describes *configured* agent definitions.

## getSubagentMessages()

```typescript
getSubagentMessages(
  sessionId: string,
  agentId: string,
  options?: GetSubagentMessagesOptions,
): Promise<SessionMessage[]>
```

Read one subagent's transcript. This closes the loop with the live `task_started` / `task_progress` stream events: those report subagent activity as it happens, this reads it back afterwards.

```typescript
for (const agentId of await listSubagents(sessionId)) {
  const transcript = await getSubagentMessages(sessionId, agentId)
  console.log(agentId, transcript.length)
}
```

## forkSession()

```typescript
forkSession(sessionId: string, options?: ForkSessionOptions): Promise<ForkSessionResult>
```

Copy a session's transcript into a brand-new session, remapping every message UUID and preserving the parent chain.

| Option | Type | Description |
|--------|------|-------------|
| `upToMessageId` | `string` | Fork at a specific message instead of the tail |
| `title` | `string` | Custom title for the fork |
| `dir` | `string` | Project directory |
| `sessionStore` | [`SessionStore`](#sessionstore) | Custom backend |

```typescript
const { sessionId } = await forkSession(original, { title: 'What-if branch' })
const branch = claude.session({ resume: sessionId })
```

::: warning Not the same as `SessionOptions.fork`
[`SessionOptions.fork`](./session#sessionoptions) is the `--fork-session` flag: it branches on the *next* turn. `forkSession()` copies an existing transcript without running a turn, so the fork is usable immediately. Forked sessions start without undo history — file-history snapshots are not copied.
:::

## renameSession()

```typescript
renameSession(sessionId: string, title: string, options?: SessionMutationOptions): Promise<void>
```

Set a session's custom title. The title is appended to the transcript, so it surfaces afterwards as `SessionInfo.customTitle` — and as `summary` when nothing better exists.

## tagSession()

```typescript
tagSession(sessionId: string, tag: string | null, options?: SessionMutationOptions): Promise<void>
```

Set or clear a session's tag, surfaced afterwards as `SessionInfo.tag`. Pass `null` to clear it — that is the explicit clear command, which is why the parameter is `string | null` rather than optional.

```typescript
await tagSession(sessionId, 'release-audit')
await tagSession(sessionId, null) // clear
```

## deleteSession()

```typescript
deleteSession(sessionId: string, options?: SessionMutationOptions): Promise<void>
```

Without `sessionStore`, removes `{sessionId}.jsonl` and the `{sessionId}/` subagent-transcript directory from the local projects directory, and **throws** if the session is not found.

With `sessionStore`, calls `store.delete()` when the adapter implements it, and is a silent no-op otherwise — the right behavior for WORM / append-only backends.

## SessionStore

Mirror transcripts into your own storage. Pass one as [`ClientOptions.sessionStore`](./types#clientoptions) to have live sessions mirrored, or to any function above to read from it.

```typescript
interface SessionStore {
  append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void>
  load(key: SessionKey): Promise<SessionStoreEntry[] | null>
  listSessions?(projectKey: string): Promise<Array<{ sessionId: string; mtime: number }>>
  listSessionSummaries?(projectKey: string): Promise<SessionSummaryEntry[]>
  delete?(key: SessionKey): Promise<void>
  listSubkeys?(key: { projectKey: string; sessionId: string }): Promise<string[]>
}

interface SessionKey {
  readonly projectKey: string
  readonly sessionId: string
  readonly subpath?: string   // set for subagent transcripts
}
```

| Method | Required | Contract |
|--------|----------|----------|
| `append` | yes | Called **after** the local write succeeds, at roughly a 100ms cadence during active turns. Rejections are retried (3 attempts, short backoff); a 60s timeout is **not** retried, since the call may still land. After the final failure the batch is dropped and a `mirror_error` stream event is emitted — the subprocess continues unaffected |
| `load` | yes | Called once, before the subprocess spawns, and materialized to a temporary JSONL file. Return `null` for a key that was never written. Entries must be deep-equal to what was appended; byte-equal serialization is not required |
| `listSessions` | no | Without it, listing sessions through the store throws. `mtime` is integer epoch milliseconds |
| `listSessionSummaries` | no | Lets listing read all metadata in one round-trip instead of `listSessions()` plus a `load()` per session |
| `delete` | no | Without it, `deleteSession()` is a silent no-op |
| `listSubkeys` | no | Without it, resume materializes only the main transcript, not subagents |

::: warning Idempotency
`append()` is retried, so treat `SessionStoreEntry.uuid` as an idempotency key or a replay will duplicate rows. `sessionStore` is mutually exclusive with `noSessionPersistence` — the mirror runs after a successful local write, so there is nothing to mirror once local persistence is off.
:::

### createInMemorySessionStore()

```typescript
createInMemorySessionStore(): Promise<InMemorySessionStoreHandle>
```

The SDK's in-memory store, with every optional method implemented plus three test helpers: a `size` getter, `getEntries(key)` and `clear()`. Test and development only — all data dies with the process.

```typescript
const store = await createInMemorySessionStore()
const claude = new Claude({ sessionStore: store })   // client-level, SDK mode
await claude.query('hi')
console.log(store.size)
store.clear()
```

### importSessionToStore()

```typescript
importSessionToStore(
  sessionId: string,
  store: SessionStore,
  options?: ImportSessionToStoreOptions,
): Promise<void>
```

Copy a local JSONL session — and, by default, its subagent transcripts — into a store. `store.append()` is called once per batch of `batchSize` (default 500) entries.

| Option | Type | Description |
|--------|------|-------------|
| `dir` | `string` | Project directory to read from |
| `includeSubagents` | `boolean` | Also import subagent transcripts (default `true`) |
| `batchSize` | `number` | Entries per `append()` call |

### loadSessionStoreHelpers()

```typescript
loadSessionStoreHelpers(): Promise<SessionStoreHelpers>
```

Returns `{ foldSessionSummary }` — a **synchronous** function that folds a batch of appended entries into the running [`SessionSummaryEntry`](#sessionstore) for a key. It is an accessor rather than an async wrapper on purpose: stores call it inside the read-fold-write critical section of `append()`, and a promise there would break the contract.

```typescript
const { foldSessionSummary } = await loadSessionStoreHelpers()

const store: SessionStore = {
  async append(key, entries) {
    const prev = await db.readSummary(key)
    const next = foldSessionSummary(prev, key, entries, { mtime: Date.now() })
    await db.write(key, entries, next)
  },
  async load(key) { return (await db.read(key)) ?? null },
}
```

The fold itself is pure — serializing the read-fold-write is the store's job. Stamp `mtime` at persist time from the same clock that feeds `listSessions().mtime`.

## Settings resolution

### resolveSettings()

```typescript
resolveSettings(options?: ResolveSettingsOptions): Promise<ResolvedSettings>
```

Resolve the effective settings a query would see, without spawning the CLI.

```typescript
interface ResolvedSettings {
  readonly effective: Settings
  readonly provenance: Partial<Record<keyof Settings, ProvenanceEntry>>
  readonly sources: readonly ResolvedSettingsLayer[]
}
```

| Option | Type | Description |
|--------|------|-------------|
| `cwd` | `string` | Directory to resolve `project` / `local` settings against |
| `settingSources` | [`SettingSource[]`](./types#settingsource) | Which filesystem tiers to load. Omit for all of them; `[]` skips user/project/local but still reads the managed policy tier |
| `managedSettings` | `Settings` | Restrictive policy-tier settings, filtered through a restrictive-key allowlist |
| `serverManagedSettings` | `Settings` | Server-managed payload, feeding the `'remote'` policy sub-source |

```typescript
const resolved = await resolveSettings({ cwd: process.cwd() })
console.log(resolved.effective.model)
console.log(resolved.provenance.model?.source) // 'project' | 'managed' | ...
```

::: warning This is a cascade, not a security decision
The policy tier matches CLI startup (`managed-settings.json`, remote-cached managed settings, MDM via macOS plist or Windows registry, and `managedSettings`) **except** that the admin-configured `policyHelper` subprocess is not executed.

`permissions.defaultMode` is reported unfiltered across all tiers, including repo-committed `project` settings. Run the result through `filterEscalatingDefaultMode()` before acting on it.
:::

### loadSettingsHelpers()

```typescript
loadSettingsHelpers(): Promise<SettingsHelpers>
```

Returns `{ filterEscalatingDefaultMode }` — the trust-tier filter the CLI applies before honoring escalating permission modes from settings. When `permissions.defaultMode` is escalating (`bypassPermissions`, `auto`, `acceptEdits`) **and** came from a repo-committed tier, it is dropped.

```typescript
const resolved = await resolveSettings({ cwd: process.cwd() })
const { filterEscalatingDefaultMode } = await loadSettingsHelpers()
const trusted = filterEscalatingDefaultMode(resolved)
console.log(trusted.permissions?.defaultMode)
```

Not optional garnish: `resolveSettings()` reports modes the CLI would refuse to honor, so acting on `defaultMode` without this filter trusts an untrusted value.
