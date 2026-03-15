# Error Handling

All library errors extend `ClaudeConnectorError` for uniform catching.

## Error Hierarchy

```
ClaudeConnectorError          Base class (catch-all)
├── CliNotFoundError          Binary not found (ERR_ENOENT)
├── CliExecutionError         Non-zero exit code
├── CliTimeoutError           Process exceeded DEFAULT_TIMEOUT_MS
├── ParseError                Unexpected CLI output format
└── ValidationError           Invalid options/input
```

## Error Classes

### ClaudeConnectorError

Base class for all library errors. Catch this to handle any error from claude-connector.

### CliNotFoundError

Thrown when the Claude Code CLI binary is not found at the specified path.

- `err.executable` — the path that was not found

### CliExecutionError

Thrown when the CLI process exits with a non-zero code.

- `err.exitCode` — the process exit code
- `err.stderr` — captured stderr output

### CliTimeoutError

Thrown when a query exceeds the timeout.

- `err.timeoutMs` — the timeout that was exceeded

### ParseError

Thrown when the CLI output cannot be parsed (unexpected format).

- `err.rawOutput` — the raw output that failed to parse

### ValidationError

Thrown when invalid options or input are provided.

- `err.field` — the field that failed validation

## Error Handling Pattern

```ts
import {
  Claude,
  ClaudeConnectorError,
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  ParseError,
  ValidationError,
} from '@scottwalker/claude-connector'

const claude = new Claude()

try {
  await claude.query('Do something')
} catch (err) {
  if (err instanceof CliNotFoundError) {
    // Claude Code CLI not found
    console.error(`Install CLI: ${err.executable} not found`)
  } else if (err instanceof CliTimeoutError) {
    // Query took too long
    console.error(`Timeout after ${err.timeoutMs}ms`)
  } else if (err instanceof CliExecutionError) {
    // CLI exited with non-zero code
    console.error(`Exit code: ${err.exitCode}`)
    console.error(`Stderr: ${err.stderr}`)
  } else if (err instanceof ParseError) {
    // Unexpected CLI output format
    console.error(`Raw output: ${err.rawOutput.slice(0, 200)}`)
  } else if (err instanceof ValidationError) {
    // Invalid options
    console.error(`Invalid field: ${err.field}`)
  } else if (err instanceof ClaudeConnectorError) {
    // Catch-all for any library error
    console.error(err.message)
  }
}
```

## Stream Error Handling

```ts
import {
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  EVENT_TEXT,
  EVENT_ERROR,
} from '@scottwalker/claude-connector'

try {
  await claude.stream('Do something')
    .on(EVENT_TEXT, (t) => process.stdout.write(t))
    .on(EVENT_ERROR, (event) => {
      // Stream-level errors (Claude reports an issue)
      console.error(`\nStream error: ${event.message}`)
    })
    .done()
} catch (err) {
  // Process-level errors
  if (err instanceof CliNotFoundError) {
    console.error('Claude CLI not installed')
  } else if (err instanceof CliTimeoutError) {
    console.error(`Timed out after ${err.timeoutMs}ms`)
  } else if (err instanceof CliExecutionError) {
    console.error(`CLI exit code ${err.exitCode}: ${err.stderr}`)
  }
}
```

::: tip
Stream-level errors (received via `EVENT_ERROR` callback) indicate issues reported by Claude during execution. Process-level errors (caught in `try/catch`) indicate the CLI process itself failed.
:::

## Validation Errors

Validation errors fire immediately — at construction time or call time:

```ts
// Throws ValidationError at construction
new Claude({ maxTurns: -1 })
new Claude({ maxBudget: 0 })
new Claude({ permissionMode: 'invalid' as any })
new Claude({ effortLevel: 'turbo' as any })

// Throws ValidationError at call time
await claude.query('')
await claude.query('   ')
await claude.query('Ok', { maxTurns: 0 })
```

::: warning
Always validate user input before passing it to `claude.query()`. Empty or whitespace-only prompts throw `ValidationError` immediately.
:::
