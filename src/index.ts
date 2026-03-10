/**
 * # claude-connector
 *
 * Programmatic Node.js interface for Claude Code CLI.
 *
 * ## Quick start
 *
 * ```ts
 * import { Claude } from 'claude-connector'
 *
 * const claude = new Claude({ model: 'sonnet' })
 * const result = await claude.query('Find bugs in auth.ts')
 * console.log(result.text)
 * ```
 *
 * ## Architecture
 *
 * ```
 * ┌─────────┐     ┌─────────────┐     ┌────────────┐     ┌─────────────┐
 * │  Claude  │────>│ ArgsBuilder │────>│  IExecutor  │────>│  CLI Process │
 * │ (facade) │     │ (options→   │     │ (abstract)  │     │  (claude -p) │
 * │          │     │  CLI args)  │     │             │     │              │
 * └─────────┘     └─────────────┘     └────────────┘     └─────────────┘
 *      │                                    ▲
 *      │                                    │
 *      ▼                              ┌─────┴──────┐
 * ┌─────────┐                         │CliExecutor  │  (default implementation)
 * │ Session │                         │ SdkExecutor │  (future)
 * │ Scheduler│                        │ HttpExecutor│  (future)
 * └─────────┘                         └────────────┘
 * ```
 *
 * @module
 */

// ── Main client ───────────────────────────────────────────────────
export { Claude } from './client/claude.js';
export { Session } from './client/session.js';

// ── Executor abstraction ──────────────────────────────────────────
export type { IExecutor, ExecuteOptions } from './executor/interface.js';
export { CliExecutor } from './executor/cli-executor.js';
export { SdkExecutor } from './executor/sdk-executor.js';
export type { SdkExecutorOptions, SdkExecutorEvents, InitStage } from './executor/sdk-executor.js';

// ── Scheduler ─────────────────────────────────────────────────────
export { Scheduler, ScheduledJob } from './scheduler/scheduler.js';
export type { ScheduledJobEvents } from './scheduler/scheduler.js';

// ── Builder ───────────────────────────────────────────────────────
export { buildArgs, mergeOptions, resolveEnv } from './builder/args-builder.js';
export type { ResolvedOptions } from './builder/args-builder.js';

// ── Parsers ───────────────────────────────────────────────────────
export { parseJsonResult } from './parser/json-parser.js';
export { parseStreamLine } from './parser/stream-parser.js';

// ── Errors ────────────────────────────────────────────────────────
export {
  ClaudeConnectorError,
  CliNotFoundError,
  CliExecutionError,
  CliTimeoutError,
  ParseError,
  ValidationError,
} from './errors/errors.js';

// ── Types ─────────────────────────────────────────────────────────
export type {
  ClientOptions,
  QueryOptions,
  PermissionMode,
  EffortLevel,
  McpServerConfig,
  AgentConfig,
  HookEntry,
  HookMatcher,
  HooksConfig,
  QueryResult,
  StreamEvent,
  StreamTextEvent,
  StreamToolUseEvent,
  StreamResultEvent,
  StreamErrorEvent,
  StreamSystemEvent,
  TokenUsage,
  Message,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  SessionOptions,
  SessionInfo,
} from './types/index.js';
