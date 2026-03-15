# Architecture

## Overview

`claude-connector` is a programmatic Node.js interface for the Claude Code CLI. It wraps the `claude` command-line tool (used via subscription) and exposes a clean TypeScript API for building integrations.

```
┌──────────────────────────────────────────────────────────────────┐
│                        Consumer Code                             │
│                                                                  │
│  const claude = new Claude({ model: 'sonnet' })                  │
│  const result = await claude.query('Fix the bug')                │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Claude (Facade)                              │
│                                                                  │
│  Orchestrates all components. Validates input. Merges options.   │
│  Delegates execution.                                            │
│  Exposes: query, stream, chat, session, loop, parallel.          │
└──────┬────────────────────┬──────────────────────┬───────────────┘
       │                    │                      │
       ▼                    ▼                      ▼
┌─────────────┐    ┌──────────────┐    ┌────────────────────┐
│ ArgsBuilder │    │  IExecutor   │    │     Session        │
│             │    │  (interface) │    │                    │
│ Converts    │    │              │    │ Multi-turn state   │
│ options →   │    │  ┌────────┐  │    │ management via     │
│ CLI args    │    │  │  SDK   │  │    │ --resume/--continue│
│ (constants) │    │  │Executor│  │    │                    │
│             │    │  └────────┘  │    │ Returns StreamHandle│
└─────────────┘    │  ┌────────┐  │    └────────────────────┘
                   │  │  CLI   │  │
                   │  │Executor│  │    ┌────────────────────┐
                   │  └────────┘  │    │   StreamHandle     │
                   └──────┬───────┘    │   (Readable)       │
                          │            │                    │
                          │            │   .on() .done()    │
                          ▼            │   .text() .pipe()  │
              ┌───────────────────┐    │   .toReadable()    │
              │   CLI Process     │    └────────────────────┘
              │   claude -p "..." │
              │   --output-format │    ┌────────────────────┐
              │   stream-json     │    │   ChatHandle       │
              └───────────────────┘    │   (Duplex)         │
                                       │                    │
                                       │   .send() .pipe()  │
                                       │   .toReadable()    │
                                       │   .toDuplex()      │
                                       └────────────────────┘
```

## Design Principles

### 1. SOLID

**Single Responsibility**:
- `Claude` — facade, delegates everything
- `ArgsBuilder` — only converts options to CLI args (using constants from `constants.ts`)
- `SdkExecutor` — manages persistent SDK sessions (default)
- `CliExecutor` — only spawns and manages CLI processes
- `Session` — only tracks session state
- `StreamHandle` — fluent streaming API + Node.js Readable bridge
- `ChatHandle` — bidirectional streaming + Node.js Duplex bridge
- `Scheduler` — only manages recurring execution
- Parsers — only parse CLI output

**Open/Closed**:
- New execution backends are added by implementing `IExecutor` — no changes to existing code.
- New CLI flags are added to `ArgsBuilder` — parsers and executor remain unchanged.
- New stream consumers are added via `StreamHandle.on()` — no core changes needed.

**Liskov Substitution**:
- Any `IExecutor` implementation can replace `SdkExecutor`/`CliExecutor` without breaking the client.

**Interface Segregation**:
- `IExecutor` has only 3 methods: `execute`, `stream`, `abort`.
- Types are split into focused files: `client.ts`, `result.ts`, `session.ts`.

**Dependency Inversion**:
- `Claude` depends on `IExecutor` (abstraction), not `SdkExecutor` (implementation).
- Constructor injection: `new Claude(options, customExecutor)`.

### 2. No Magic Strings

All string literals (event types, CLI flags, permission modes, etc.) are centralized in `constants.ts`. Source files import named constants — no hardcoded strings anywhere in the codebase.

### 3. DRY

- Option merging logic is centralized in `mergeOptions()`.
- Validation is centralized in `utils/validation.ts`, referencing `VALID_PERMISSION_MODES` and `VALID_EFFORT_LEVELS` from constants.
- Error hierarchy has a single base class.
- Event dispatching logic is shared between `StreamHandle` and `ChatHandle`.

## Layer Map

```
src/
├── constants.ts          All string constants (events, flags, keys, modes)
├── index.ts              Public API surface (re-exports)
├── types/                Type definitions (no runtime code)
│   ├── client.ts         ClientOptions, QueryOptions, PermissionMode, EffortLevel
│   ├── result.ts         QueryResult, StreamEvent, TokenUsage, Message
│   └── session.ts        SessionOptions, SessionInfo
├── executor/             Execution abstraction
│   ├── interface.ts      IExecutor, ExecuteOptions
│   ├── sdk-executor.ts   SDK implementation (persistent session, default)
│   └── cli-executor.ts   CLI implementation (spawn per query)
├── builder/              Options → CLI args
│   └── args-builder.ts   buildArgs(), mergeOptions(), resolveEnv()
├── parser/               CLI output → typed objects
│   ├── json-parser.ts    JSON mode parsing
│   └── stream-parser.ts  NDJSON stream parsing
├── client/               High-level API
│   ├── claude.ts         Claude class (facade)
│   ├── session.ts        Session class (stateful wrapper)
│   ├── stream-handle.ts  StreamHandle (fluent API + Node.js Readable)
│   └── chat-handle.ts    ChatHandle (bidirectional + Node.js Duplex)
├── scheduler/            Recurring execution (/loop equivalent)
│   └── scheduler.ts      Scheduler, ScheduledJob
├── errors/               Error hierarchy
│   └── errors.ts         All error classes
└── utils/                Shared utilities
    └── validation.ts     Input validation
```

## Key Abstractions

### IExecutor

The central abstraction that decouples the public API from the transport mechanism.

**Why it exists**: Today there are two executors — `SdkExecutor` (persistent SDK session, default) and `CliExecutor` (spawns `claude -p` per query). Tomorrow, Anthropic may ship an HTTP API or Unix socket interface. By coding against `IExecutor`, only a new implementation is needed.

**Contract**:
- `execute(args, options)` → `Promise<QueryResult>` (run to completion)
- `stream(args, options)` → `AsyncIterable<StreamEvent>` (incremental)
- `abort()` → `void` (cancel running execution)

**Invariants**:
- Error conditions throw `ClaudeConnectorError` subclasses
- Arguments are fully resolved (no option merging in the executor)

### StreamHandle

Wraps an `AsyncIterable<StreamEvent>` with a fluent API and Node.js stream bridge.

**Why it exists**: Raw `for await` loops require boilerplate for common patterns (collect text, pipe to stdout, track progress). `StreamHandle` provides `.on().done()`, `.text()`, `.pipe()`, and `.toReadable()` for these cases, while preserving `for await` backward compatibility.

### ChatHandle

Manages a persistent CLI process with `--input-format stream-json` for bidirectional streaming.

**Why it exists**: One-shot `stream()` spawns a process per query. For multi-turn conversations where latency matters, `ChatHandle` keeps one process alive and sends messages via stdin. It provides `.send()` (Promise-based), `.toDuplex()` (Node.js Duplex), and the same `.on()` fluent API as `StreamHandle`.

### ArgsBuilder

Purely functional module that converts typed options into CLI argument arrays.

**Why it's separate**: Argument building is a distinct concern from execution. All CLI flag strings come from `constants.ts` — no hardcoded flags in the builder.

### Constants

Single source of truth for all string literals: event types, CLI flags, JSON protocol keys, permission modes, effort levels, error names, etc. Every module imports from here — zero magic strings in the codebase.

## Data Flow

### query() — Synchronous Request

```
claude.query('Find bugs', { model: 'opus' })
  │
  ├─ validate prompt & options
  ├─ mergeOptions(clientOpts, queryOpts, { outputFormat: FORMAT_JSON })
  ├─ buildArgs(resolvedOptions) → [FLAG_PRINT, FLAG_OUTPUT_FORMAT, FORMAT_JSON, ...]
  ├─ resolveEnv(clientOpts, queryOpts)
  │
  └─ executor.execute(args, { cwd, env, input, systemPrompt })
       │
       ├─ spawn(DEFAULT_EXECUTABLE, args)  or  session.send(prompt)
       ├─ collect stdout
       ├─ wait for exit
       │
       └─ parseJsonResult(stdout) → QueryResult
```

### stream() — Streaming Request

```
claude.stream('Rewrite module')
  │
  ├─ validate & merge (outputFormat: FORMAT_STREAM_JSON)
  │
  └─ new StreamHandle(() => executor.stream(args, options))
       │
       ├─ .on(EVENT_TEXT, cb)     → register callback
       ├─ .on(EVENT_TOOL_USE, cb) → register callback
       ├─ .done()                 → consume iterable, dispatch events
       │     │
       │     └─ for each NDJSON line:
       │          parseStreamLine(line) → StreamEvent
       │          dispatch to registered callbacks
       │
       ├─ .text()                 → collect text, return string
       ├─ .pipe(writable)         → pipe text, return result
       └─ .toReadable()           → Node.js Readable (text mode)
```

### chat() — Bidirectional Streaming

```
claude.chat()
  │
  ├─ buildArgs({ inputFormat: FORMAT_STREAM_JSON, ... })
  │
  └─ new ChatHandle(executable, args, { cwd, env })
       │
       ├─ spawn process with stdin open
       ├─ .send(prompt) → write JSON to stdin, await result
       ├─ stdout → parseStreamLine → dispatch to callbacks
       ├─ .toDuplex() → Node.js Duplex (write prompts, read text)
       └─ .end() → close stdin → process exits
```

## Error Handling Strategy

```
ClaudeConnectorError          Base class (catch-all)
├── CliNotFoundError          Binary not found (ERR_ENOENT)
├── CliExecutionError         Non-zero exit code
├── CliTimeoutError           Process exceeded DEFAULT_TIMEOUT_MS
├── ParseError                Unexpected CLI output format
└── ValidationError           Invalid options/input
```

**Philosophy**: Fail fast with descriptive messages. Each error class carries contextual data (exit code, stderr, raw output) for debugging. Error class names use constants from `ERR_NAME_*`.

## Testing Strategy

- **Unit tests**: Every module is tested in isolation using mock executors.
- **No real CLI calls in tests**: `IExecutor` is mocked, so tests run instantly.
- **Parser tests**: Cover both happy paths and edge cases (missing fields, malformed JSON).
- **Session tests**: Verify state management (session ID tracking, query counting, flag selection).
- **StreamHandle tests**: Verify `.on()`, `.done()`, `.text()`, `.pipe()`, `.toReadable()`, and `for await`.
- **ChatHandle tests**: Verify lifecycle (properties, close, abort, send-after-close).
- **Scheduler tests**: Use `vi.useFakeTimers()` for deterministic timing.
- **122 tests** across 10 test files.

## Future Extensibility

### Adding New CLI Flags

1. Add the constant to `constants.ts`
2. Add the option to `ClientOptions` and/or `QueryOptions` in `types/client.ts`
3. Add merging logic in `mergeOptions()` in `builder/args-builder.ts`
4. Add argument building in `buildArgs()` using the constant
5. Add tests
6. No changes needed in executor, parser, or client classes

### Adding New Stream Event Types

1. Add the constant to `constants.ts`
2. Add the type to the `StreamEvent` union in `types/result.ts`
3. Add parsing logic in `stream-parser.ts`
4. Add dispatch case in `StreamHandle` and `ChatHandle`
5. Unknown types are already forwarded as `EVENT_SYSTEM` events, so existing code won't break

## Custom Executor

Inject a custom executor for testing or custom transport:

```ts
import {
  Claude,
  EVENT_TEXT,
  EVENT_RESULT,
  type IExecutor,
  type ExecuteOptions,
  type QueryResult,
  type StreamEvent,
} from '@scottwalker/claude-connector'

const mockExecutor: IExecutor = {
  async execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult> {
    return {
      text: 'Mocked response',
      sessionId: 'mock-session',
      usage: { inputTokens: 0, outputTokens: 0 },
      cost: null,
      durationMs: 0,
      messages: [],
      structured: null,
      raw: {},
    }
  },

  async *stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent> {
    yield { type: EVENT_TEXT, text: 'Mocked stream' }
    yield {
      type: EVENT_RESULT,
      text: 'Mocked stream',
      sessionId: 'mock-session',
      usage: { inputTokens: 0, outputTokens: 0 },
      cost: null,
      durationMs: 0,
    }
  },

  abort() {},
}

// Pass as second argument — bypasses SDK/CLI executor creation
const claude = new Claude({ model: 'sonnet' }, mockExecutor)
const result = await claude.query('Test')
console.log(result.text) // "Mocked response"
```
