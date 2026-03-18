/**
 * Result of a completed (non-streaming) query.
 */
export interface QueryResult {
  /** The text response from Claude. */
  readonly text: string;

  /** Session ID for resuming this conversation. */
  readonly sessionId: string;

  /** Token usage statistics. */
  readonly usage: TokenUsage;

  /** Total cost in USD (available for API users). */
  readonly cost: number | null;

  /** Wall-clock duration in milliseconds. */
  readonly durationMs: number;

  /** Full message history from the conversation. */
  readonly messages: readonly Message[];

  /**
   * Structured output when a JSON schema was provided.
   * `null` if no schema was used.
   */
  readonly structured: unknown | null;

  /** Raw JSON response from CLI (for advanced use). */
  readonly raw: Record<string, unknown>;
}

/**
 * A single event emitted during streaming.
 *
 * Discriminated union on the `type` field.
 */
export type StreamEvent =
  | StreamTextEvent
  | StreamToolUseEvent
  | StreamResultEvent
  | StreamErrorEvent
  | StreamSystemEvent
  | StreamRateLimitEvent
  | StreamTaskStartedEvent
  | StreamTaskProgressEvent
  | StreamTaskNotificationEvent;

export interface StreamTextEvent {
  readonly type: 'text';

  /** Incremental text chunk. */
  readonly text: string;
}

export interface StreamToolUseEvent {
  readonly type: 'tool_use';

  /** Tool being invoked (e.g. 'Read', 'Bash'). */
  readonly toolName: string;

  /** Input parameters passed to the tool. */
  readonly toolInput: Record<string, unknown>;
}

export interface StreamResultEvent {
  readonly type: 'result';

  /** Result subtype: 'success' or 'error'. */
  readonly subtype?: 'success' | 'error' | string;

  /** Final text result. */
  readonly text: string;

  /** Session ID. */
  readonly sessionId: string;

  /** Token usage. */
  readonly usage: TokenUsage;

  /** Cost in USD. */
  readonly cost: number | null;

  /** Duration in milliseconds. */
  readonly durationMs: number;

  /** Whether the result is an error. */
  readonly isError?: boolean;

  /** Reason for stopping: 'end_turn', 'max_tokens', 'tool_use', etc. */
  readonly stopReason?: string | null;

  /** Number of agentic turns executed. */
  readonly numTurns?: number;

  /**
   * Structured output when a JSON schema was provided.
   * `null` if no schema was used.
   */
  readonly structured?: unknown | null;
}

export interface StreamErrorEvent {
  readonly type: 'error';

  /** Error message. */
  readonly message: string;

  /** Error code if available. */
  readonly code?: string;
}

export interface StreamSystemEvent {
  readonly type: 'system';

  /** System event subtype. */
  readonly subtype: string;

  /** Event-specific data. */
  readonly data: Record<string, unknown>;
}

// ── Rate limit event ──────────────────────────────────────────────

export interface StreamRateLimitEvent {
  readonly type: 'rate_limit';

  /** Rate limit status. */
  readonly status: 'allowed' | 'allowed_warning' | 'rejected';

  /** When the rate limit resets (Unix timestamp in ms). */
  readonly resetsAt?: number;

  /** Type of rate limit hit. */
  readonly rateLimitType?: string;

  /** Current utilization (0-1). */
  readonly utilization?: number;

  /** Full rate limit info from SDK. */
  readonly data: Record<string, unknown>;
}

// ── Task events (subagent lifecycle) ──────────────────────────────

export interface StreamTaskStartedEvent {
  readonly type: 'task_started';

  /** Unique task ID for tracking and control. */
  readonly taskId: string;

  /** Tool use ID that spawned this task. */
  readonly toolUseId?: string;

  /** Description of the task. */
  readonly description: string;

  /** Task type (e.g. agent type name). */
  readonly taskType?: string;

  /** The prompt given to the subagent. */
  readonly prompt?: string;
}

export interface StreamTaskProgressEvent {
  readonly type: 'task_progress';

  /** Task ID. */
  readonly taskId: string;

  /** Tool use ID. */
  readonly toolUseId?: string;

  /** Description of current progress. */
  readonly description: string;

  /** Resource usage so far. */
  readonly usage: {
    totalTokens: number;
    toolUses: number;
    durationMs: number;
  };

  /** Last tool used. */
  readonly lastToolName?: string;

  /** AI-generated progress summary (if agentProgressSummaries enabled). */
  readonly summary?: string;
}

export interface StreamTaskNotificationEvent {
  readonly type: 'task_notification';

  /** Task ID. */
  readonly taskId: string;

  /** Tool use ID. */
  readonly toolUseId?: string;

  /** Task completion status. */
  readonly status: 'completed' | 'failed' | 'stopped';

  /** Path to the task output file. */
  readonly outputFile: string;

  /** Summary of what the task accomplished. */
  readonly summary: string;

  /** Resource usage. */
  readonly usage?: {
    totalTokens: number;
    toolUses: number;
    durationMs: number;
  };
}

// ── Info types (from control methods) ─────────────────────────────

/** Information about the logged-in user's account. */
export interface AccountInfo {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
}

/** Information about an available model. */
export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: ('low' | 'medium' | 'high' | 'max')[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
  supportsAutoMode?: boolean;
}

/** Available slash command. */
export interface SlashCommand {
  [key: string]: unknown;
}

/** Information about an available subagent. */
export interface AgentInfo {
  name: string;
  description: string;
  model?: string;
}

/** Status of an MCP server connection. */
export interface McpServerStatus {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
  serverInfo?: { name: string; version: string };
  error?: string;
  config?: Record<string, unknown>;
  scope?: string;
  tools?: Array<{
    name: string;
    description?: string;
    annotations?: { readOnly?: boolean; destructive?: boolean; openWorld?: boolean };
  }>;
}

/** Result of a setMcpServers operation. */
export interface McpSetServersResult {
  added: string[];
  removed: string[];
  errors: Record<string, string>;
}

/** Result of a rewindFiles operation. */
export interface RewindFilesResult {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

// ── Token usage ───────────────────────────────────────────────────

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface Message {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly ContentBlock[];
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ToolUseBlock {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface ToolResultBlock {
  readonly type: 'tool_result';
  readonly tool_use_id: string;
  readonly content: string;
}
