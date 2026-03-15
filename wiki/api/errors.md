# Errors

All errors thrown by claude-connector extend `ClaudeConnectorError`. This allows catching any library error uniformly while still handling specific cases.

```typescript
import {
  ClaudeConnectorError,
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  ParseError,
  ValidationError,
} from '@scottwalker/claude-connector'
```

## Error Hierarchy

```
ClaudeConnectorError (base)
  +-- CliNotFoundError
  +-- CliExecutionError
  +-- CliTimeoutError
  +-- ParseError
  +-- ValidationError
```

## ClaudeConnectorError

Base error class for all claude-connector errors.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Always `'ClaudeConnectorError'` |
| `message` | `string` | Human-readable error description |

```typescript
try {
  await claude.query('...')
} catch (e) {
  if (e instanceof ClaudeConnectorError) {
    // Any library error
    console.error(`Claude connector error: ${e.message}`)
  }
}
```

## CliNotFoundError

Thrown when the Claude Code CLI binary cannot be found at the specified path.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | `'CliNotFoundError'` |
| `executable` | `string` | The path that was searched |

**When thrown:**
- The `executable` option points to a non-existent file
- `claude` is not found in `PATH` (when using the default)

```typescript
import { CliNotFoundError } from '@scottwalker/claude-connector'

try {
  await claude.query('...')
} catch (e) {
  if (e instanceof CliNotFoundError) {
    console.error(`CLI not found at: ${e.executable}`)
    console.error('Install: https://docs.anthropic.com/en/docs/claude-code/overview')
  }
}
```

## CliExecutionError

Thrown when the CLI process exits with a non-zero code.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | `'CliExecutionError'` |
| `exitCode` | `number` | Process exit code |
| `stderr` | `string` | Full stderr output |

**When thrown:**
- Claude Code encounters an internal error
- Authentication fails
- Invalid CLI arguments are passed
- The model returns an error

```typescript
import { CliExecutionError } from '@scottwalker/claude-connector'

try {
  await claude.query('...')
} catch (e) {
  if (e instanceof CliExecutionError) {
    console.error(`CLI exited with code ${e.exitCode}`)
    console.error(`Stderr: ${e.stderr}`)
  }
}
```

## CliTimeoutError

Thrown when the CLI process exceeds the configured timeout.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | `'CliTimeoutError'` |
| `timeoutMs` | `number` | The timeout that was exceeded (in milliseconds) |

**When thrown:**
- A query or stream takes longer than `DEFAULT_TIMEOUT_MS` (600,000ms / 10 minutes)
- The configured timeout is exceeded

```typescript
import { CliTimeoutError, DEFAULT_TIMEOUT_MS } from '@scottwalker/claude-connector'

try {
  await claude.query('Complex task...')
} catch (e) {
  if (e instanceof CliTimeoutError) {
    console.error(`Timed out after ${e.timeoutMs}ms (default: ${DEFAULT_TIMEOUT_MS}ms)`)
  }
}
```

## ParseError

Thrown when CLI output cannot be parsed into the expected format.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | `'ParseError'` |
| `rawOutput` | `string` | The raw output that failed to parse |

**When thrown:**
- The CLI returns invalid JSON
- The response structure doesn't match expected format
- Stream-json output contains malformed lines

```typescript
import { ParseError } from '@scottwalker/claude-connector'

try {
  await claude.query('...')
} catch (e) {
  if (e instanceof ParseError) {
    console.error('Failed to parse CLI output')
    console.error(`Raw output: ${e.rawOutput.slice(0, 200)}`)
  }
}
```

## ValidationError

Thrown when invalid options or prompts are provided to the client.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | `'ValidationError'` |
| `field` | `string` | The option field that failed validation |

**When thrown:**
- An empty prompt is passed to `query()` or `stream()`
- An invalid `permissionMode` value is provided
- An invalid `effortLevel` value is provided
- An invalid interval format is passed to `loop()`
- `ClientOptions` or `QueryOptions` contain invalid values

```typescript
import { ValidationError } from '@scottwalker/claude-connector'

try {
  const claude = new Claude({ permissionMode: 'invalid' as any })
} catch (e) {
  if (e instanceof ValidationError) {
    console.error(`Invalid option '${e.field}': ${e.message}`)
  }
}
```

## Catching Pattern

Handle errors from most specific to least specific:

```typescript
import {
  ClaudeConnectorError,
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  ParseError,
  ValidationError,
} from '@scottwalker/claude-connector'

try {
  const result = await claude.query('Do work')
} catch (e) {
  if (e instanceof CliNotFoundError) {
    // Install Claude Code CLI
  } else if (e instanceof CliTimeoutError) {
    // Retry with longer timeout or simpler prompt
  } else if (e instanceof CliExecutionError) {
    // Check stderr, maybe auth issue
  } else if (e instanceof ParseError) {
    // Unexpected CLI output format
  } else if (e instanceof ValidationError) {
    // Fix the options
  } else if (e instanceof ClaudeConnectorError) {
    // Any other library error
  } else {
    // Not a claude-connector error
    throw e
  }
}
```
