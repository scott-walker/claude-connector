# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-03-15

### Added

- **StreamHandle** — fluent streaming API returned by `stream()`:
  - `.on(EVENT_TEXT, cb)` — typed event callbacks with chaining
  - `.done()` — consume stream, fire callbacks, return result
  - `.text()` — collect all text into a string
  - `.pipe(writable)` — pipe text to any writable, return result
  - `.toReadable()` — Node.js Readable for `pipeline()`, HTTP responses, file writes
  - `[Symbol.asyncIterator]` — backward-compatible `for await`
- **ChatHandle** — bidirectional streaming via `--input-format stream-json`:
  - `claude.chat()` — persistent CLI process for multi-turn conversation
  - `.send(prompt)` — returns `Promise<StreamResultEvent>`
  - `.toDuplex()` — Node.js Duplex (write prompts, read text)
  - `.toReadable()`, `.pipe()`, `.end()`, `.abort()`
- **Constants** — all 180+ string literals extracted to named constants, exported for client use
- Streaming guide with 27 integration patterns
- 122 tests

### Changed

- `stream()` returns `StreamHandle` instead of `AsyncIterable<StreamEvent>` (backward compatible)
- Zero magic strings in source code

## [0.2.0] - 2026-03-15

### Fixed

- CLI streaming (`--verbose` flag for `stream-json`)
- `systemPrompt` in SDK mode
- `mcpServers` and `hooks` dead code in CLI mode
- `effortLevel` via `--effort` flag instead of env variable

### Added

- Permission mode `auto`, effort level `max`
- `--agent`, `--tools`, `--name`, `--strict-mcp-config` flags
- Comprehensive examples document

## [0.1.0] - 2026-03-10

### Added

- Initial release: `Claude`, `Session`, `ScheduledJob`, `CliExecutor`, `SdkExecutor`
- Full `ClientOptions` covering 45+ CLI flags
- Streaming, structured output, MCP, agents, hooks, worktrees
- Typed error hierarchy
- 82 unit tests
