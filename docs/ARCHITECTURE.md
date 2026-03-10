# Architecture

## Overview

`claude-connector` is a programmatic Node.js interface for the Claude Code CLI. It wraps the `claude` command-line tool (used via subscription) and exposes a clean TypeScript API for building integrations.

```
┌──────────────────────────────────────────────────────────────────┐
│                        Consumer Code                             │
│                                                                  │
│  const claude = new Claude({ executable: '/usr/bin/claude' })    │
│  const result = await claude.query('Fix the bug')                │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Claude (Facade)                              │
│                                                                  │
│  Orchestrates all components. Validates input. Merges options.   │
│  Delegates execution. Exposes: query, stream, session, loop.     │
└──────┬────────────────────┬──────────────────────┬───────────────┘
       │                    │                      │
       ▼                    ▼                      ▼
┌─────────────┐    ┌──────────────┐    ┌────────────────────┐
│ ArgsBuilder │    │  IExecutor   │    │     Session        │
│             │    │  (interface) │    │                    │
│ Converts    │    │              │    │ Multi-turn state   │
│ options →   │    │  ┌────────┐  │    │ management via     │
│ CLI args    │    │  │  CLI   │  │    │ --resume/--continue│
│             │    │  │Executor│  │    │                    │
└─────────────┘    │  └────────┘  │    └────────────────────┘
                   │  ┌────────┐  │
                   │  │ Future │  │
                   │  │Executor│  │
                   │  └────────┘  │
                   └──────┬───────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   CLI Process         │
              │   claude -p "..."     │
              │   --output-format json│
              └───────────────────────┘
```

## Design Principles

### 1. SOLID

**Single Responsibility**:
- `Claude` — facade, delegates everything
- `ArgsBuilder` — only converts options to CLI args
- `CliExecutor` — only spawns and manages CLI processes
- `Session` — only tracks session state
- `Scheduler` — only manages recurring execution
- Parsers — only parse CLI output

**Open/Closed**:
- New execution backends (SDK, HTTP) are added by implementing `IExecutor` — no changes to existing code.
- New CLI flags are added to `ArgsBuilder` — parsers and executor remain unchanged.

**Liskov Substitution**:
- Any `IExecutor` implementation can replace `CliExecutor` without breaking the client.

**Interface Segregation**:
- `IExecutor` has only 3 methods: `execute`, `stream`, `abort`.
- Types are split into focused files: `client.ts`, `result.ts`, `session.ts`.

**Dependency Inversion**:
- `Claude` depends on `IExecutor` (abstraction), not `CliExecutor` (implementation).
- Constructor injection: `new Claude(options, customExecutor)`.

### 2. KISS

- No frameworks. Only Node.js built-ins (`child_process`, `events`).
- Zero runtime dependencies.
- Each module does one thing and is small enough to read in a single sitting.

### 3. DRY

- Option merging logic is centralized in `mergeOptions()`.
- Validation is centralized in `utils/validation.ts`.
- Error hierarchy has a single base class.

## Layer Map

```
src/
├── index.ts              Public API surface (re-exports)
├── types/                Type definitions (no runtime code)
│   ├── client.ts         ClientOptions, QueryOptions
│   ├── result.ts         QueryResult, StreamEvent
│   └── session.ts        SessionOptions, SessionInfo
├── executor/             Execution abstraction
│   ├── interface.ts      IExecutor (the core abstraction)
│   └── cli-executor.ts   CLI implementation (spawn)
├── builder/              Options → CLI args
│   └── args-builder.ts   buildArgs(), mergeOptions(), resolveEnv()
├── parser/               CLI output → typed objects
│   ├── json-parser.ts    JSON mode parsing
│   └── stream-parser.ts  NDJSON stream parsing
├── client/               High-level API
│   ├── claude.ts         Claude class (facade)
│   └── session.ts        Session class (stateful wrapper)
├── scheduler/            Recurring execution (/loop equivalent)
│   └── scheduler.ts      Scheduler, ScheduledJob
├── errors/               Error hierarchy
│   └── errors.ts         All error classes
└── utils/                Shared utilities
    └── validation.ts     Input validation
```

## Key Abstractions

### IExecutor (executor/interface.ts)

The central abstraction that decouples the public API from the transport mechanism.

**Why it exists**: Today, the only way to interact with Claude Code programmatically (on a subscription) is via the CLI. Tomorrow, Anthropic may ship a native SDK, a Unix socket, or an HTTP API. By coding against `IExecutor`, only a new implementation is needed — the entire public surface remains stable.

**Contract**:
- `execute(args, options)` → `Promise<QueryResult>` (run to completion)
- `stream(args, options)` → `AsyncIterable<StreamEvent>` (incremental)
- `abort()` → `void` (cancel running execution)

**Invariants**:
- Stateless per invocation (safe for concurrent use)
- Error conditions throw `ClaudeConnectorError` subclasses
- Arguments are fully resolved (no option merging in the executor)

### ArgsBuilder (builder/args-builder.ts)

Purely functional module that converts typed options into CLI argument arrays.

**Why it's separate**: Argument building is a distinct concern from execution. Keeping it separate means:
- It's trivially unit-testable (input → output, no side effects)
- When CLI flags change, only this module needs updating
- The executor doesn't need to know about option semantics

### Claude (client/claude.ts)

The facade that ties everything together. Consumers interact with this class only.

**Responsibilities**:
- Validate inputs
- Merge client-level defaults with per-query overrides
- Delegate to ArgsBuilder and Executor
- Create sessions and scheduled jobs

**What it does NOT do**:
- Parse CLI output (that's the parser's job)
- Manage child processes (that's the executor's job)
- Track session state (that's the Session's job)

## Data Flow

### query() — Synchronous request

```
claude.query('Find bugs', { model: 'opus' })
  │
  ├─ validate prompt & options
  ├─ mergeOptions(clientOpts, queryOpts, { outputFormat: 'json' })
  ├─ buildArgs(resolvedOptions) → ['--print', '--output-format', 'json', ...]
  ├─ resolveEnv(clientOpts, queryOpts) → { CLAUDE_CODE_EFFORT_LEVEL: 'high' }
  │
  └─ executor.execute(args, { cwd, env, input })
       │
       ├─ spawn('claude', args)
       ├─ collect stdout
       ├─ wait for exit
       │
       └─ parseJsonResult(stdout) → QueryResult
```

### stream() — Streaming request

```
claude.stream('Rewrite module')
  │
  ├─ validate & merge (same as above, but outputFormat: 'stream-json')
  │
  └─ executor.stream(args, options)
       │
       ├─ spawn('claude', args)
       ├─ read stdout line-by-line (NDJSON)
       │
       └─ for each line:
            parseStreamLine(line) → StreamEvent
            yield event
```

### session.query() — Multi-turn

```
session.query('Analyze architecture')
  │
  ├─ queryCount === 0?
  │    ├─ YES: use --continue (if sessionOptions.continue)
  │    └─ NO:  use --resume <sessionId>
  │
  ├─ buildArgs with session flags
  ├─ executor.execute(...)
  │
  └─ updateSessionState(result.sessionId)
       └─ store sessionId for next query
```

## Error Handling Strategy

```
ClaudeConnectorError          Base class (catch-all)
├── CliNotFoundError          Binary not found (ENOENT)
├── CliExecutionError         Non-zero exit code
├── CliTimeoutError           Process exceeded timeout
├── ParseError                Unexpected CLI output format
└── ValidationError           Invalid options/input
```

**Philosophy**: Fail fast with descriptive messages. Each error class carries contextual data (exit code, stderr, raw output) for debugging.

## Testing Strategy

- **Unit tests**: Every module is tested in isolation using mock executors.
- **No real CLI calls in tests**: `IExecutor` is mocked, so tests run instantly and don't require Claude Code installed.
- **Parser tests**: Cover both happy paths and edge cases (missing fields, malformed JSON).
- **Session tests**: Verify state management (session ID tracking, query counting, flag selection).
- **Scheduler tests**: Use `vi.useFakeTimers()` for deterministic timing.

## Future Extensibility

### Adding a new executor (e.g., SDK-based)

```typescript
import type { IExecutor } from 'claude-connector'

class SdkExecutor implements IExecutor {
  async execute(args, options) { /* use SDK directly */ }
  async *stream(args, options) { /* use SDK streaming */ }
  abort() { /* cancel SDK call */ }
}

const claude = new Claude({ model: 'opus' }, new SdkExecutor())
// Everything else works exactly the same
```

### Adding new CLI flags

1. Add the option to `ClientOptions` and/or `QueryOptions` in `types/client.ts`
2. Add merging logic in `mergeOptions()` in `builder/args-builder.ts`
3. Add argument building in `buildArgs()` in `builder/args-builder.ts`
4. Add tests
5. No changes needed in executor, parser, or client classes

### Adding new stream event types

1. Add the type to the `StreamEvent` union in `types/result.ts`
2. Add parsing logic in `stream-parser.ts`
3. Unknown types are already forwarded as `system` events, so existing code won't break
