/**
 * # claude-connector
 *
 * Programmatic Node.js interface for Claude Code CLI.
 *
 * ## Quick start
 *
 * ```ts
 * import { Claude } from '@scottwalker/claude-connector'
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
 * ┌─────────┐                         │CliExecutor  │
 * │ Session │                         │ SdkExecutor │
 * │ Scheduler│                        └────────────┘
 * └─────────┘
 * ```
 *
 * @module
 */

// ── Main client ───────────────────────────────────────────────────
export { Claude } from './client/claude.js';
export { Session } from './client/session.js';
export { StreamHandle } from './client/stream-handle.js';
export { ChatHandle } from './client/chat-handle.js';

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

// ── Constants ─────────────────────────────────────────────────────
export {
  // Stream event types
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
  EVENT_ERROR,
  EVENT_SYSTEM,

  // Task event types
  EVENT_TASK_STARTED,
  EVENT_TASK_PROGRESS,
  EVENT_TASK_NOTIFICATION,

  // Rate limit
  EVENT_RATE_LIMIT,

  // Permission modes
  PERMISSION_DEFAULT,
  PERMISSION_ACCEPT_EDITS,
  PERMISSION_PLAN,
  PERMISSION_DONT_ASK,
  PERMISSION_BYPASS,
  PERMISSION_AUTO,

  // Effort levels
  EFFORT_LOW,
  EFFORT_MEDIUM,
  EFFORT_HIGH,
  EFFORT_MAX,

  // Scheduler events
  SCHED_RESULT,
  SCHED_ERROR,
  SCHED_TICK,
  SCHED_STOP,

  // Init events
  INIT_EVENT_STAGE,
  INIT_EVENT_READY,
  INIT_EVENT_ERROR,

  // Defaults
  DEFAULT_EXECUTABLE,

  // Content block types
  BLOCK_TEXT,
  BLOCK_TOOL_USE,
  BLOCK_TOOL_RESULT,
} from './constants.js';

// ── Types ─────────────────────────────────────────────────────────
export type {
  ClientOptions,
  QueryOptions,
  PermissionMode,
  EffortLevel,
  McpServerConfig,
  McpSdkServerConfig,
  AgentConfig,
  HookEntry,
  HookMatcher,
  HooksConfig,
  // Permission types
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
  PermissionBehavior,
  PermissionRuleValue,
  PermissionUpdateDestination,
  // Thinking types
  ThinkingConfig,
  ThinkingAdaptive,
  ThinkingEnabled,
  ThinkingDisabled,
  // Hook callback types
  HookEvent,
  HookCallback,
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
  SyncHookJSONOutput,
  AsyncHookJSONOutput,
  // Elicitation
  OnElicitation,
  ElicitationRequest,
  SettingSource,
  PluginConfig,
  SpawnOptions,
  SpawnedProcess,
  // Result types
  QueryResult,
  StreamEvent,
  StreamTextEvent,
  StreamToolUseEvent,
  StreamResultEvent,
  StreamErrorEvent,
  StreamSystemEvent,
  // Task event types
  StreamTaskStartedEvent,
  StreamTaskProgressEvent,
  StreamTaskNotificationEvent,
  StreamRateLimitEvent,
  // Info types
  AccountInfo,
  ModelInfo,
  SlashCommand,
  AgentInfo,
  McpServerStatus,
  McpSetServersResult,
  RewindFilesResult,
  // Other
  TokenUsage,
  Message,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  SessionOptions,
  SessionInfo,
} from './types/index.js';

// ── SDK Re-exports ────────────────────────────────────────────────
// Lazy re-exports of SDK helpers for in-process MCP tools.
// These will throw at import time if @anthropic-ai/claude-agent-sdk is not installed.

/**
 * Create an in-process MCP server for custom tools (SDK mode only).
 *
 * @example
 * ```ts
 * import { createSdkMcpServer, tool } from '@scottwalker/claude-connector'
 * import { z } from 'zod/v4'
 *
 * const server = createSdkMcpServer({
 *   name: 'my-tools',
 *   tools: [
 *     tool('getPrice', 'Get stock price', { ticker: z.string() },
 *       async ({ ticker }) => ({ content: [{ type: 'text', text: '142.50' }] })
 *     ),
 *   ],
 * })
 *
 * const claude = new Claude({ mcpServers: { prices: server } })
 * ```
 */
export async function createSdkMcpServer(options: {
  name: string;
  version?: string;
  tools?: Array<unknown>;
}): Promise<import('./types/client.js').McpSdkServerConfig> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.createSdkMcpServer(options as Parameters<typeof sdk.createSdkMcpServer>[0]) as unknown as import('./types/client.js').McpSdkServerConfig;
}

/**
 * Define a custom MCP tool for use with `createSdkMcpServer()`.
 *
 * @example
 * ```ts
 * import { tool } from '@scottwalker/claude-connector'
 * import { z } from 'zod/v4'
 *
 * const myTool = tool('greet', 'Say hello', { name: z.string() },
 *   async ({ name }) => ({ content: [{ type: 'text', text: `Hello ${name}!` }] })
 * )
 * ```
 */
export async function sdkTool(
  name: string,
  description: string,
  inputSchema: unknown,
  handler: (args: unknown, extra: unknown) => Promise<unknown>,
  extras?: { annotations?: Record<string, boolean> },
): Promise<unknown> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.tool(name, description, inputSchema as Parameters<typeof sdk.tool>[2], handler as Parameters<typeof sdk.tool>[3], extras as Parameters<typeof sdk.tool>[4]);
}

/**
 * List existing sessions.
 */
export async function listSessions(options?: {
  dir?: string;
  limit?: number;
  includeWorktrees?: boolean;
}): Promise<Array<{ sessionId: string; summary: string; lastModified: number }>> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.listSessions(options) as Promise<Array<{ sessionId: string; summary: string; lastModified: number }>>;
}

/**
 * Get messages from an existing session.
 */
export async function getSessionMessages(
  sessionId: string,
  options?: { dir?: string; limit?: number; offset?: number },
): Promise<Array<{ type: string; uuid: string; session_id: string; message: unknown }>> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.getSessionMessages(sessionId, options) as Promise<Array<{ type: string; uuid: string; session_id: string; message: unknown }>>;
}
