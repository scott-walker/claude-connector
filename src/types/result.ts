/**
 * Result and stream-event surface — everything the executors hand back.
 *
 * Three families live here: the aggregated {@link QueryResult} returned by
 * `query()`, the {@link StreamEvent} union yielded by `stream()`, and the
 * typed payloads returned by the control methods on `Claude` / `SdkExecutor`.
 *
 * Two conventions are worth knowing before reading further:
 *
 * 1. **Fields are camelCase.** The CLI and the Agent SDK speak `snake_case` on
 *    the wire (`tool_use_id`, `total_cost_usd`, `pre_tokens`); the executors
 *    translate on the way in so callers never see it. Hook *inputs* are the one
 *    exception — see `./hooks.js`.
 * 2. **Every `type` discriminator comes from `src/constants.ts`.** Match on the
 *    exported `EVENT_*` constants rather than on bare string literals.
 *
 * Both executors produce the same union. SDK mode maps the SDK message union;
 * CLI mode parses `claude --output-format stream-json`, whose lines map onto
 * those same variants, and forwards only a genuinely unknown `type` as
 * {@link StreamSystemEvent}. Where a variant needs an option to be enabled, or
 * where only one mode can reach it, the variant says so.
 *
 * @example
 * ```ts
 * for await (const event of claude.stream('Refactor this')) {
 *   switch (event.type) {
 *     case 'text':     process.stdout.write(event.text); break
 *     case 'thinking': console.error('[thinking]', event.thinking); break
 *     case 'result':   console.log(event.usage, event.modelUsage); break
 *   }
 * }
 * ```
 */

import type {
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_TOOL_RESULT,
  EVENT_RESULT,
  EVENT_ERROR,
  EVENT_SYSTEM,
  EVENT_RATE_LIMIT,
  EVENT_TASK_STARTED,
  EVENT_TASK_PROGRESS,
  EVENT_TASK_NOTIFICATION,
  EVENT_TASK_UPDATED,
  EVENT_BACKGROUND_TASKS_CHANGED,
  EVENT_TOOL_PROGRESS,
  EVENT_TOOL_USE_SUMMARY,
  EVENT_AUTH_STATUS,
  EVENT_HOOK_STARTED,
  EVENT_HOOK_PROGRESS,
  EVENT_HOOK_RESPONSE,
  EVENT_FILES_PERSISTED,
  EVENT_COMPACT_BOUNDARY,
  EVENT_CONTEXT_USAGE,
  EVENT_LOCAL_COMMAND_OUTPUT,
  EVENT_THINKING,
  EVENT_THINKING_TOKENS,
  EVENT_API_RETRY,
  EVENT_MODEL_REFUSAL_FALLBACK,
  EVENT_MODEL_REFUSAL_NO_FALLBACK,
  EVENT_SESSION_STATE_CHANGED,
  EVENT_STATUS,
  EVENT_WORKER_SHUTTING_DOWN,
  EVENT_CONVERSATION_RESET,
  EVENT_MIRROR_ERROR,
  EVENT_INIT,
  EVENT_PERMISSION_DENIED,
  EVENT_NOTIFICATION,
  EVENT_INFORMATIONAL,
  EVENT_PROMPT_SUGGESTION,
  EVENT_PARTIAL_MESSAGE,
  EVENT_MEMORY_RECALL,
  EVENT_COMMANDS_CHANGED,
  EVENT_PLUGIN_INSTALL,
  EVENT_ELICITATION_COMPLETE,
  EVENT_CONTROL_REQUEST_PROGRESS,
  BLOCK_TEXT,
  BLOCK_TOOL_USE,
  BLOCK_TOOL_RESULT,
  BLOCK_THINKING,
  BLOCK_REDACTED_THINKING,
  VALID_EFFORT_LEVELS,
  VALID_RATE_LIMIT_TYPES,
  VALID_RESULT_SUBTYPES,
  VALID_TERMINAL_REASONS,
} from '../constants.js';
import type { McpServerStatusConfig, PermissionMode } from './client.js';

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

  /** Which result variant produced this object: `'success'` or an `error_*` subtype. */
  readonly subtype?: ResultSubtype;

  /** Whether the turn ended in an error. Pairs with {@link QueryResult.errors}. */
  readonly isError?: boolean;

  /** Error strings collected on an `error_*` result. Empty or absent on success. */
  readonly errors?: readonly string[];

  /** Why the agent loop stopped, as reported by the CLI. */
  readonly terminalReason?: TerminalReason;

  /**
   * Per-model token and cost totals for every call in the query pipeline —
   * main loop, subagents, sidechains, compaction. The correct field for
   * accounting; {@link QueryResult.usage} covers the main loop only.
   */
  readonly modelUsage?: Readonly<Record<string, ModelUsageEntry>>;

  /** Authoritative record of tool calls denied during the turn. */
  readonly permissionDenials?: readonly PermissionDenial[];

  /** Tool call handed back to the caller instead of being run. */
  readonly deferredToolUse?: DeferredToolUse | null;

  /** Time spent waiting on the API, in milliseconds. */
  readonly durationApiMs?: number;

  /** User sends still queued when this result was produced. `> 0` means another turn follows. */
  readonly queuedTurnCount?: number;

  /** Time to first token, in milliseconds. */
  readonly ttftMs?: number;

  /** HTTP status of the API error that ended the turn, when there was one. */
  readonly apiErrorStatus?: number | null;

  /** Fast-mode state at the end of the turn. */
  readonly fastModeState?: FastModeState;

  /** Provenance of the turn — who or what sent the prompt. */
  readonly origin?: MessageOrigin;
}

/**
 * A single event emitted during streaming.
 *
 * Discriminated union on the `type` field.
 */
export type StreamEvent =
  | StreamTextEvent
  | StreamToolUseEvent
  | StreamToolResultEvent
  | StreamResultEvent
  | StreamErrorEvent
  | StreamSystemEvent
  | StreamRateLimitEvent
  | StreamTaskStartedEvent
  | StreamTaskProgressEvent
  | StreamTaskNotificationEvent
  | StreamTaskUpdatedEvent
  | StreamBackgroundTasksChangedEvent
  | StreamToolProgressEvent
  | StreamToolUseSummaryEvent
  | StreamAuthStatusEvent
  | StreamHookStartedEvent
  | StreamHookProgressEvent
  | StreamHookResponseEvent
  | StreamFilesPersistedEvent
  | StreamCompactBoundaryEvent
  | StreamLocalCommandOutputEvent
  | StreamThinkingEvent
  | StreamThinkingTokensEvent
  | StreamApiRetryEvent
  | StreamModelRefusalFallbackEvent
  | StreamModelRefusalNoFallbackEvent
  | StreamSessionStateChangedEvent
  | StreamStatusEvent
  | StreamWorkerShuttingDownEvent
  | StreamConversationResetEvent
  | StreamMirrorErrorEvent
  | StreamInitEvent
  | StreamPermissionDeniedEvent
  | StreamNotificationEvent
  | StreamInformationalEvent
  | StreamPromptSuggestionEvent
  | StreamPartialMessageEvent
  | StreamMemoryRecallEvent
  | StreamCommandsChangedEvent
  | StreamPluginInstallEvent
  | StreamElicitationCompleteEvent
  | StreamControlRequestProgressEvent
  | StreamContextUsageEvent;

export interface StreamTextEvent {
  readonly type: typeof EVENT_TEXT;

  /** Incremental text chunk. */
  readonly text: string;
}

export interface StreamToolUseEvent {
  readonly type: typeof EVENT_TOOL_USE;

  /** Tool being invoked (e.g. 'Read', 'Bash'). */
  readonly toolName: string;

  /** Input parameters passed to the tool. */
  readonly toolInput: Record<string, unknown>;

  /**
   * Id of this invocation, matching the `toolUseId` of the
   * {@link StreamToolResultEvent} that answers it and of the
   * {@link StreamToolProgressEvent}s it emits along the way.
   *
   * Optional because a transcript replayed from an older session may not carry
   * one; every live turn does.
   */
  readonly toolUseId?: string;
}

export interface StreamResultEvent {
  readonly type: typeof EVENT_RESULT;

  /** Result subtype: 'success' or one of the `error_*` variants. */
  readonly subtype?: ResultSubtype;

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

  /** Error strings collected on an `error_*` result. */
  readonly errors?: readonly string[];

  /** Why the agent loop stopped — the CLI-side reason, not the model's `stopReason`. */
  readonly terminalReason?: TerminalReason;

  /**
   * Per-model token and cost totals across the whole query pipeline, keyed by
   * model id. Cumulative in streaming-input sessions: read the latest result
   * rather than summing.
   */
  readonly modelUsage?: Readonly<Record<string, ModelUsageEntry>>;

  /** Authoritative record of tool calls denied during the turn. */
  readonly permissionDenials?: readonly PermissionDenial[];

  /** Tool call deferred to the caller. Pairs with `terminalReason: 'tool_deferred'`. */
  readonly deferredToolUse?: DeferredToolUse | null;

  /** Time spent waiting on the API, in milliseconds. */
  readonly durationApiMs?: number;

  /** User sends still queued when this result was produced. `> 0` means another turn follows. */
  readonly queuedTurnCount?: number;

  /** Time to first token, in milliseconds. */
  readonly ttftMs?: number;

  /** HTTP status of the API error that ended the turn, when there was one. */
  readonly apiErrorStatus?: number | null;

  /** Fast-mode state at the end of the turn. */
  readonly fastModeState?: FastModeState;

  /** Provenance of the turn — who or what sent the prompt. */
  readonly origin?: MessageOrigin;
}

export interface StreamErrorEvent {
  readonly type: typeof EVENT_ERROR;

  /** Error message. */
  readonly message: string;

  /** Error code if available. */
  readonly code?: string;

  /** True when the turn was cancelled rather than failing on its own. */
  readonly aborted?: boolean;

  /** API request id, for correlating with provider-side logs. */
  readonly requestId?: string;
}

export interface StreamSystemEvent {
  readonly type: typeof EVENT_SYSTEM;

  /** System event subtype. */
  readonly subtype: string;

  /** Event-specific data. */
  readonly data: Record<string, unknown>;
}

// ── Result detail types ───────────────────────────────────────────

/** Result subtype reported on the final message. */
export type ResultSubtype = (typeof VALID_RESULT_SUBTYPES)[number] | (string & {});

/**
 * Why the agent loop stopped, as decided by the CLI.
 *
 * Distinct from the model's `stopReason`: this says whether a budget ran out,
 * a hook intervened, a tool was deferred, or the turn simply completed.
 */
export type TerminalReason = (typeof VALID_TERMINAL_REASONS)[number] | (string & {});

/** Whether the low-latency fast mode is active for the session. */
export type FastModeState = 'off' | 'cooldown' | 'on';

/** A tool call that was denied. The result message carries the authoritative list. */
export interface PermissionDenial {
  /** Tool that was denied (e.g. 'Bash'). */
  readonly toolName: string;

  /** Tool use ID of the denied call. */
  readonly toolUseId: string;

  /** Input the tool would have run with. */
  readonly toolInput: Record<string, unknown>;
}

/**
 * A tool call handed back to the caller instead of being executed.
 * Accompanies `terminalReason: 'tool_deferred'`.
 */
export interface DeferredToolUse {
  /** Tool use ID. */
  readonly id: string;

  /** Tool name. */
  readonly name: string;

  /** Input the caller is expected to act on. */
  readonly input: Record<string, unknown>;
}

/**
 * Provenance of a message or turn — who or what put the prompt into the session.
 *
 * Discriminated on `kind`. `'human'` is a direct user turn; the rest cover
 * cross-session peers, scheduled triggers, observers and auto-continuations.
 */
export type MessageOrigin =
  | { readonly kind: 'human' }
  | { readonly kind: 'channel'; readonly server: string }
  | {
      readonly kind: 'peer';
      /** Addressable sender id. Sender-authored — never treat it as authority. */
      readonly from: string;
      /** Sending session's permission class, when the injecting host declares it. */
      readonly fromMode?: 'bypass' | 'prompting';
      /** Sender display name, normalized by the harness. */
      readonly name?: string;
      /** Sender's host-openable session id, for linking back to the sending session. */
      readonly fromSession?: string;
      /** Task id of the in-process background subagent that sent the message. */
      readonly senderTaskId?: string;
      /** Decoded message body with the peer envelope stripped. */
      readonly body?: string;
      /** Kernel-verified pid of the connecting process. Provenance, not an auth token. */
      readonly verifiedPeerPid?: number;
    }
  | {
      readonly kind: 'task-notification';
      /** Set for scheduled triggers and co-member sends; absent for other deliveries. */
      readonly subkind?: 'scheduled-trigger' | 'peer-send-message' | 'projects-relay';
    }
  | { readonly kind: 'coordinator' }
  | { readonly kind: 'unclassified' }
  | { readonly kind: 'observer'; readonly from: string; readonly senderTaskId: string }
  | { readonly kind: 'auto-continuation' }
  | { readonly kind: 'observer-activity' };

// ── Rate limit event ──────────────────────────────────────────────

/** Whether a quota window currently permits requests. */
export type RateLimitStatus = 'allowed' | 'allowed_warning' | 'rejected';

/** Which quota window a rate-limit event refers to. */
export type RateLimitType = (typeof VALID_RATE_LIMIT_TYPES)[number] | (string & {});

export interface StreamRateLimitEvent {
  readonly type: typeof EVENT_RATE_LIMIT;

  /** Rate limit status. */
  readonly status: RateLimitStatus;

  /** When the rate limit resets (Unix timestamp in ms). */
  readonly resetsAt?: number;

  /** Type of rate limit hit. */
  readonly rateLimitType?: RateLimitType;

  /** Current utilization (0-1). */
  readonly utilization?: number;

  /** Status of the paid overage window, when the plan has one. */
  readonly overageStatus?: RateLimitStatus;

  /** When the overage window resets (Unix timestamp in ms). */
  readonly overageResetsAt?: number;

  /**
   * Why overage is unavailable, e.g. `'out_of_credits'`, `'org_level_disabled'`,
   * `'no_limits_configured'`. Left open — the CLI adds reasons over time.
   */
  readonly overageDisabledReason?: string;

  /** Whether the current request is being served from overage credits. */
  readonly isUsingOverage?: boolean;

  /** Whether the session has started consuming overage credits. */
  readonly overageInUse?: boolean;

  /** Full rate limit info from SDK. */
  readonly data: Record<string, unknown>;
}

// ── Task events (subagent lifecycle) ──────────────────────────────

export interface StreamTaskStartedEvent {
  readonly type: typeof EVENT_TASK_STARTED;

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

  /** Subagent definition this task runs (e.g. 'code-reviewer'). */
  readonly subagentType?: string;

  /** Whether the task started in the background rather than blocking the turn. */
  readonly isBackgrounded?: boolean;

  /** Nesting depth: 0 for a main-loop task, 1 for a subagent's subagent, and so on. */
  readonly spawnDepth?: number;

  /** Workflow that owns this task, when it was spawned by one. */
  readonly workflowName?: string;

  /** Whether the task is kept out of the transcript. */
  readonly skipTranscript?: boolean;

  /** Housekeeping task — exclude it from activity indicators. */
  readonly ambient?: boolean;
}

export interface StreamTaskProgressEvent {
  readonly type: typeof EVENT_TASK_PROGRESS;

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

  /** Subagent definition this task runs (e.g. 'code-reviewer'). */
  readonly subagentType?: string;
}

export interface StreamTaskNotificationEvent {
  readonly type: typeof EVENT_TASK_NOTIFICATION;

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

  /** Whether the task is kept out of the transcript. */
  readonly skipTranscript?: boolean;

  /** Housekeeping task — exclude it from activity indicators. */
  readonly ambient?: boolean;
}

/**
 * Incremental change to a task already announced by {@link StreamTaskStartedEvent}.
 *
 * `patch` carries only the fields that changed — apply it over the task state
 * you are holding rather than replacing it.
 */
export interface StreamTaskUpdatedEvent {
  readonly type: typeof EVENT_TASK_UPDATED;

  /** Task ID. */
  readonly taskId: string;

  /** Fields that changed on this task. */
  readonly patch: {
    readonly status?: 'pending' | 'running' | 'completed' | 'failed' | 'killed' | 'paused';
    readonly description?: string;
    /** When the task settled (Unix timestamp in ms). */
    readonly endTime?: number;
    /** Total time the task spent paused, in milliseconds. */
    readonly totalPausedMs?: number;
    readonly error?: string;
    readonly isBackgrounded?: boolean;
  };
}

/**
 * The full set of background tasks after a change.
 *
 * REPLACE semantics: swap your whole cached set for `tasks` — this is a level
 * signal, not an edge.
 */
export interface StreamBackgroundTasksChangedEvent {
  readonly type: typeof EVENT_BACKGROUND_TASKS_CHANGED;

  /** Every background task currently known to the session. */
  readonly tasks: ReadonlyArray<{
    readonly taskId: string;
    readonly taskType: string;
    readonly description: string;
    /** Housekeeping task — exclude it from activity indicators. */
    readonly ambient?: boolean;
  }>;
}

// ── Tool progress, results & summary ──────────────────────────────

export interface StreamToolProgressEvent {
  readonly type: typeof EVENT_TOOL_PROGRESS;

  /** Tool use ID for this invocation. */
  readonly toolUseId: string;

  /** Name of the tool being executed. */
  readonly toolName: string;

  /** Parent tool use ID (for nested tool calls). */
  readonly parentToolUseId: string | null;

  /** How long the tool has been running. */
  readonly elapsedTimeSeconds: number;

  /** Task ID if running inside a subagent. */
  readonly taskId?: string;

  /** Keep-alive tick rather than a state change — safe to ignore for display. */
  readonly heartbeat?: boolean;

  /** Subagent definition running this tool, when it runs inside one. */
  readonly subagentType?: string;

  /** API retry happening inside the subagent — the only surface for subagent-level retries. */
  readonly subagentRetry?: {
    readonly agentId: string;
    readonly attempt: number;
    readonly maxRetries: number;
    readonly retryDelayMs: number;
    readonly errorStatus: number | null;
    readonly errorCategory: string;
  };
}

/**
 * What a tool returned, lifted out of the `user` message that answers a
 * `tool_use` block. The counterpart to {@link StreamToolUseEvent}.
 */
export interface StreamToolResultEvent {
  readonly type: typeof EVENT_TOOL_RESULT;

  /** Tool use ID this result answers. */
  readonly toolUseId: string;

  /** Result payload — plain text, or the content blocks the tool returned. */
  readonly content: string | readonly ContentBlock[];

  /** Whether the tool failed. */
  readonly isError?: boolean;

  /** Structured result the CLI attached alongside the text content. */
  readonly toolUseResult?: unknown;

  /** Parent tool use ID (for nested tool calls). */
  readonly parentToolUseId?: string | null;

  /** True when this is a resumed session replaying history — filter these to avoid double-counting. */
  readonly isReplay?: boolean;

  /** True when the CLI generated the message rather than a real tool run. */
  readonly isSynthetic?: boolean;

  /** Subagent that produced the result, when it came from one. */
  readonly subagentType?: string;

  /** Description of the task the subagent was running. */
  readonly taskDescription?: string;

  /** ISO timestamp of the message. */
  readonly timestamp?: string;

  /** Provenance of the message. */
  readonly origin?: MessageOrigin;
}

export interface StreamToolUseSummaryEvent {
  readonly type: typeof EVENT_TOOL_USE_SUMMARY;

  /** AI-generated summary of what the tools did. */
  readonly summary: string;

  /** IDs of tool uses this summary covers. */
  readonly precedingToolUseIds: string[];
}

// ── Auth status ───────────────────────────────────────────────────

export interface StreamAuthStatusEvent {
  readonly type: typeof EVENT_AUTH_STATUS;

  /** Whether authentication is currently in progress. */
  readonly isAuthenticating: boolean;

  /** Auth flow output messages. */
  readonly output: string[];

  /** Error message if auth failed. */
  readonly error?: string;
}

// ── Hook lifecycle ────────────────────────────────────────────────

export interface StreamHookStartedEvent {
  readonly type: typeof EVENT_HOOK_STARTED;

  /** Unique hook execution ID. */
  readonly hookId: string;

  /** Hook name from settings. */
  readonly hookName: string;

  /** Event that triggered this hook (e.g. 'PreToolUse'). */
  readonly hookEvent: string;
}

export interface StreamHookProgressEvent {
  readonly type: typeof EVENT_HOOK_PROGRESS;

  /** Unique hook execution ID. */
  readonly hookId: string;

  /** Hook name from settings. */
  readonly hookName: string;

  /** Event that triggered this hook. */
  readonly hookEvent: string;

  /** Standard output so far. */
  readonly stdout: string;

  /** Standard error so far. */
  readonly stderr: string;

  /** Combined output. */
  readonly output: string;
}

export interface StreamHookResponseEvent {
  readonly type: typeof EVENT_HOOK_RESPONSE;

  /** Unique hook execution ID. */
  readonly hookId: string;

  /** Hook name from settings. */
  readonly hookName: string;

  /** Event that triggered this hook. */
  readonly hookEvent: string;

  /** Combined output. */
  readonly output: string;

  /** Standard output. */
  readonly stdout: string;

  /** Standard error. */
  readonly stderr: string;

  /** Process exit code. */
  readonly exitCode?: number;

  /** Hook outcome. */
  readonly outcome: 'success' | 'error' | 'cancelled';
}

// ── File persistence ──────────────────────────────────────────────

export interface StreamFilesPersistedEvent {
  readonly type: typeof EVENT_FILES_PERSISTED;

  /** Files that were successfully persisted. */
  readonly files: ReadonlyArray<{ filename: string; fileId: string }>;

  /** Files that failed to persist. */
  readonly failed: ReadonlyArray<{ filename: string; error: string }>;

  /** ISO timestamp of when persistence occurred. */
  readonly processedAt: string;
}

// ── Context compaction ────────────────────────────────────────────

export interface StreamCompactBoundaryEvent {
  readonly type: typeof EVENT_COMPACT_BOUNDARY;

  /** What triggered compaction. */
  readonly trigger: 'manual' | 'auto';

  /** Token count before compaction. */
  readonly preTokens: number;

  /** Token count after compaction. Absent on CLIs that predate the field. */
  readonly postTokens?: number;

  /** How long compaction took, in milliseconds. */
  readonly durationMs?: number;

  /**
   * Ordered uuids of the messages kept verbatim across the boundary. Supersedes
   * {@link StreamCompactBoundaryEvent.preservedSegment} — relink `uuids[i]` to
   * `uuids[i - 1]`, and `uuids[0]` to `anchorUuid`.
   */
  readonly preservedMessages?: {
    readonly anchorUuid: string;
    readonly uuids: readonly string[];
  };

  /** Relink info for the preserved segment. Unset when compaction summarized everything. */
  readonly preservedSegment?: {
    readonly headUuid: string;
    readonly anchorUuid: string;
    readonly tailUuid: string;
  };
}

/**
 * Structured `/context` report carried on the assistant message wrapper.
 * The typed twin of what `getContextUsage()` returns.
 */
export interface StreamContextUsageEvent {
  readonly type: typeof EVENT_CONTEXT_USAGE;

  /** The context breakdown itself. */
  readonly contextUsage: ContextUsage;
}

// ── Local command output ──────────────────────────────────────────

export interface StreamLocalCommandOutputEvent {
  readonly type: typeof EVENT_LOCAL_COMMAND_OUTPUT;

  /** Text output from the slash command (e.g. /voice, /cost). */
  readonly content: string;
}

// ── Assistant reasoning ───────────────────────────────────────────

/**
 * An extended-thinking block lifted out of the assistant message.
 *
 * Only emitted when thinking is enabled. For a redacted block the reasoning is
 * encrypted: `redacted` is true and `thinking` carries the opaque payload.
 */
export interface StreamThinkingEvent {
  readonly type: typeof EVENT_THINKING;

  /** The reasoning text, or the opaque payload when `redacted` is true. */
  readonly thinking: string;

  /** Signature the API uses to verify the block on replay. */
  readonly signature?: string;

  /** True when the block arrived encrypted and cannot be displayed. */
  readonly redacted?: boolean;
}

/**
 * Running token estimate while the model is thinking — the only progress signal
 * during a redacted-thinking phase. Needs thinking to be enabled.
 */
export interface StreamThinkingTokensEvent {
  readonly type: typeof EVENT_THINKING_TOKENS;

  /** Thinking tokens estimated so far. */
  readonly estimatedTokens: number;

  /** Increase since the previous event. */
  readonly estimatedTokensDelta: number;
}

// ── Model refusal & API retry ─────────────────────────────────────

/** An API call failed and is being retried. */
export interface StreamApiRetryEvent {
  readonly type: typeof EVENT_API_RETRY;

  /** Which attempt is about to run (1-based). */
  readonly attempt: number;

  /** How many attempts will be made in total. */
  readonly maxRetries: number;

  /** Delay before the next attempt, in milliseconds. */
  readonly retryDelayMs: number;

  /** HTTP status that caused the retry, when there was one. */
  readonly errorStatus: number | null;

  /** Error category, e.g. 'overloaded', 'rate_limit', 'server_error'. */
  readonly error: string;
}

/**
 * The model refused the request and the CLI switched to a fallback model.
 *
 * `retractedMessageUuids` is load-bearing: evict those uuids from any transcript
 * you keep, or you will replay content the CLI has withdrawn.
 */
export interface StreamModelRefusalFallbackEvent {
  readonly type: typeof EVENT_MODEL_REFUSAL_FALLBACK;

  /** Whether the turn is retried, reverted, or the fallback sticks. */
  readonly direction: 'retry' | 'revert' | 'sticky';

  /** How far the fallback applies. */
  readonly scope?: 'session' | 'local';

  /** Model that refused. */
  readonly originalModel: string;

  /** Model the turn fell back to. */
  readonly fallbackModel: string;

  /** API request id, for correlating with provider-side logs. */
  readonly requestId: string | null;

  /** Refusal category reported by the API. */
  readonly refusalCategory?: string | null;

  /** Human-readable refusal explanation reported by the API. */
  readonly refusalExplanation?: string | null;

  /** Messages the CLI withdrew from the transcript — drop these. */
  readonly retractedMessageUuids?: readonly string[];

  /** Uuid of the user message that was refused. */
  readonly refusedUserMessageUuid?: string | null;

  /** Text shown to the user about the fallback. */
  readonly content: string;
}

/**
 * The model refused and no fallback is available — the turn is over.
 * Without handling this, a refused turn simply produces no assistant text.
 */
export interface StreamModelRefusalNoFallbackEvent {
  readonly type: typeof EVENT_MODEL_REFUSAL_NO_FALLBACK;

  /** Model that refused. */
  readonly originalModel: string;

  /** API request id, for correlating with provider-side logs. */
  readonly requestId: string | null;

  /** Refusal category reported by the API. */
  readonly refusalCategory?: string | null;

  /** Human-readable refusal explanation reported by the API. */
  readonly refusalExplanation?: string | null;

  /** Uuid of the user message that was refused. */
  readonly refusedUserMessageUuid?: string | null;

  /** Text shown to the user about the refusal. */
  readonly content: string;
}

// ── Session & runtime signals ─────────────────────────────────────

/**
 * The session moved between idle, running and waiting-on-you.
 * `'idle'` is the authoritative turn-over signal — informational messages can
 * still arrive after the result event.
 */
export interface StreamSessionStateChangedEvent {
  readonly type: typeof EVENT_SESSION_STATE_CHANGED;

  /** New session state. */
  readonly state: 'idle' | 'running' | 'requires_action';
}

/** Coarse activity status, plus the outcome of a manual compaction. */
export interface StreamStatusEvent {
  readonly type: typeof EVENT_STATUS;

  /** What the session is doing, or `null` when it went back to idle. */
  readonly status: 'compacting' | 'requesting' | null;

  /** Permission mode in force, when the status change carries one. */
  readonly permissionMode?: PermissionMode;

  /** Outcome of the compaction this status refers to. */
  readonly compactResult?: 'success' | 'failed';

  /** Why compaction failed. */
  readonly compactError?: string;
}

/**
 * The worker is shutting down. A live-tail signal: it can also replay
 * mid-stream on a resumed session, so treat it as advisory.
 */
export interface StreamWorkerShuttingDownEvent {
  readonly type: typeof EVENT_WORKER_SHUTTING_DOWN;

  /** Why the worker is going away. */
  readonly reason: string;
}

/**
 * The conversation was cleared (`/clear`) and continues under a new id.
 * Any transcript state you accumulated is now stale.
 */
export interface StreamConversationResetEvent {
  readonly type: typeof EVENT_CONVERSATION_RESET;

  /** Id the conversation continues under. */
  readonly newConversationId: string;
}

/**
 * A transcript-mirror batch was dropped after retries — data loss, surfaced.
 * Both parsers map it, but only a run configured with a `sessionStore` mirror
 * has anything to lose, and that option exists in SDK mode alone.
 */
export interface StreamMirrorErrorEvent {
  readonly type: typeof EVENT_MIRROR_ERROR;

  /** Why the mirror write failed. */
  readonly error: string;

  /** Which mirror target failed. */
  readonly key: {
    readonly projectKey: string;
    readonly sessionId: string;
    readonly subpath?: string;
  };
}

/**
 * The `init` handshake, typed.
 *
 * The first message of every session: what the CLI loaded, what it can do, and
 * which model and permission mode it settled on. `capabilities` is the CLI's own
 * feature-detection channel — prefer it over version comparisons.
 */
export interface StreamInitEvent {
  readonly type: typeof EVENT_INIT;

  /** Model the session will run. */
  readonly model: string;

  /** Working directory. */
  readonly cwd: string;

  /** Tools available to the model. */
  readonly tools: readonly string[];

  /** Skills loaded into the system prompt. */
  readonly skills: readonly string[];

  /** Slash commands the session accepts. */
  readonly slashCommands: readonly string[];

  /** Slash commands handled by the terminal rather than the agent. */
  readonly terminalSlashCommands?: readonly string[];

  /** MCP servers and how their connection ended up. */
  readonly mcpServers: ReadonlyArray<{ readonly name: string; readonly status: string }>;

  /** Plugins that were loaded. */
  readonly plugins: ReadonlyArray<{
    readonly name: string;
    readonly path: string;
    /** Declared in the plugin's manifest — plugin-author-controlled, so validate before trusting. */
    readonly version?: string;
  }>;

  /** Subagents available to the Task tool. */
  readonly agents?: readonly string[];

  /** Permission mode the session starts in. */
  readonly permissionMode: PermissionMode;

  /** Where the API key came from. */
  readonly apiKeySource: string;

  /** Version of the `claude` binary behind the session. */
  readonly claudeCodeVersion: string;

  /** Active output style. */
  readonly outputStyle: string;

  /** Beta features the session enabled. */
  readonly betas?: readonly string[];

  /** Effort level in force, or `null` when the model does not support one. */
  readonly effort?: (typeof VALID_EFFORT_LEVELS)[number] | null;

  /** Feature flags advertised by the CLI. Prefer these over version checks. */
  readonly capabilities?: readonly string[];

  /** Fast-mode state at startup. */
  readonly fastModeState?: FastModeState;

  /** Why fast mode is unavailable, e.g. `'free'`, `'preference'`, `'model_not_allowed'`. */
  readonly fastModeDisabledReason?: string;
}

// ── Permission & notifications ────────────────────────────────────

/**
 * A tool call was auto-denied without an interactive prompt (deny rule, `dontAsk`
 * mode, auto-mode classifier). Advisory: `permissionDenials` on the result event
 * is the authoritative record.
 */
export interface StreamPermissionDeniedEvent {
  readonly type: typeof EVENT_PERMISSION_DENIED;

  /** Tool that was denied. */
  readonly toolName: string;

  /** Tool use ID of the denied call. */
  readonly toolUseId: string;

  /** Subagent the denied call originated in, when it was not the main loop. */
  readonly agentId?: string;

  /** Which decision path denied it, e.g. 'classifier', 'mode', 'rule'. */
  readonly decisionReasonType?: string;

  /** Human-readable reason for the denial. */
  readonly decisionReason?: string;

  /** Message the CLI would show the user. */
  readonly message: string;
}

/**
 * A host-facing toast. Distinct from {@link StreamTaskNotificationEvent}, which
 * reports a finished subagent task.
 */
export interface StreamNotificationEvent {
  readonly type: typeof EVENT_NOTIFICATION;

  /** Stable key for de-duplicating repeats of the same notification. */
  readonly key: string;

  /** Text to display. */
  readonly text: string;

  /** How urgently it should surface. */
  readonly priority: 'low' | 'medium' | 'high' | 'immediate';

  /** Suggested accent color. */
  readonly color?: string;

  /** How long to display it, in milliseconds. */
  readonly timeoutMs?: number;
}

/**
 * An advisory message from the CLI. `preventContinuation` is a stop signal —
 * e.g. a Stop hook denied continuing.
 */
export interface StreamInformationalEvent {
  readonly type: typeof EVENT_INFORMATIONAL;

  /** Message text. */
  readonly content: string;

  /** Severity. */
  readonly level: 'info' | 'notice' | 'suggestion' | 'warning';

  /** Tool call this message is about, when it is about one. */
  readonly toolUseId?: string;

  /** True when the session must not continue past this message. */
  readonly preventContinuation?: boolean;
}

/**
 * A follow-up prompt the CLI suggests. Only emitted when prompt suggestions are
 * enabled, and it arrives *after* the turn's result: SDK mode reaches it through
 * the post-result drain, CLI mode by streaming until the process exits.
 */
export interface StreamPromptSuggestionEvent {
  readonly type: typeof EVENT_PROMPT_SUGGESTION;

  /** Suggested prompt text. */
  readonly suggestion: string;
}

// ── Partial messages ──────────────────────────────────────────────

/**
 * A raw Anthropic streaming event, forwarded verbatim.
 *
 * Only emitted when `includePartialMessages` is on. `event` is the provider's
 * own `BetaRawMessageStreamEvent` — the library deliberately does not re-model
 * it, so read it against the Anthropic SDK's types.
 */
export interface StreamPartialMessageEvent {
  readonly type: typeof EVENT_PARTIAL_MESSAGE;

  /** The verbatim Anthropic streaming event (`message_start`, `content_block_delta`, …). */
  readonly event: Record<string, unknown>;

  /** Parent tool use ID when the deltas come from inside a tool call. */
  readonly parentToolUseId: string | null;

  /** Time to first token, in milliseconds. */
  readonly ttftMs?: number;

  /** Uuid of the user message these deltas answer. */
  readonly userMessageUuid?: string;
}

// ── Memory, commands & plugins ────────────────────────────────────

/** Memory files the CLI pulled into context for this turn. */
export interface StreamMemoryRecallEvent {
  readonly type: typeof EVENT_MEMORY_RECALL;

  /** Whether memories were selected verbatim or synthesized into a summary. */
  readonly mode: 'select' | 'synthesize';

  /** The recalled memories. */
  readonly memories: ReadonlyArray<{
    readonly path: string;
    readonly scope: 'personal' | 'team' | 'organization';
    /** Present when the recall carried the file body. */
    readonly content?: string;
  }>;
}

/**
 * The slash-command list changed mid-session (e.g. skills discovered in a
 * subdirectory). REPLACE semantics: swap your cached list for `commands`.
 */
export interface StreamCommandsChangedEvent {
  readonly type: typeof EVENT_COMMANDS_CHANGED;

  /** The complete new command list. */
  readonly commands: readonly SlashCommand[];
}

/** Progress of a plugin installation. */
export interface StreamPluginInstallEvent {
  readonly type: typeof EVENT_PLUGIN_INSTALL;

  /** Where the install got to. */
  readonly status: 'started' | 'installed' | 'failed' | 'completed';

  /** Plugin name, once it is known. */
  readonly name?: string;

  /** Why the install failed. */
  readonly error?: string;
}

// ── Elicitation & control requests ────────────────────────────────

/** An MCP server confirmed that a URL-mode elicitation finished. */
export interface StreamElicitationCompleteEvent {
  readonly type: typeof EVENT_ELICITATION_COMPLETE;

  /** MCP server that raised the elicitation. */
  readonly mcpServerName: string;

  /** Elicitation id, matching the one the request carried. */
  readonly elicitationId: string;
}

/**
 * Progress of a long-running control request, correlated by `requestId`.
 * Both parsers map it; the control requests it reports on are the ones SDK mode
 * issues, so CLI mode only sees it when the host drives the protocol itself.
 */
export interface StreamControlRequestProgressEvent {
  readonly type: typeof EVENT_CONTROL_REQUEST_PROGRESS;

  /** Id of the control request this progress belongs to. */
  readonly requestId: string;

  /** `'started'` once the work is accepted; `'api_retry'` while it retries. */
  readonly status: 'started' | 'api_retry';

  /** Which attempt is running (`api_retry` only). */
  readonly attempt?: number;

  /** How many attempts will be made (`api_retry` only). */
  readonly maxRetries?: number;

  /** Delay before the next attempt, in milliseconds (`api_retry` only). */
  readonly retryDelayMs?: number;

  /** HTTP status that caused the retry (`api_retry` only). */
  readonly errorStatus?: number | null;
}

// ── Info types (from control methods) ─────────────────────────────

/** Information about the logged-in user's account. */
export interface AccountInfo {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
  /**
   * Active API backend. The other fields only apply to `'firstParty'`; for
   * third-party providers auth is external and they are absent.
   */
  readonly apiProvider?:
    | 'firstParty'
    | 'bedrock'
    | 'vertex'
    | 'foundry'
    | 'anthropicAws'
    | 'anthropicGoogleCloud'
    | 'mantle'
    | 'gateway';
}

/** Information about an available model. */
export interface ModelInfo {
  value: string;
  /** Canonical wire id an alias row resolves to (e.g. 'sonnet' → 'claude-sonnet-5'). */
  readonly resolvedModel?: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: (typeof VALID_EFFORT_LEVELS)[number][];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
  supportsAutoMode?: boolean;
}

/** Available slash command. Skills are reported through this shape too. */
export interface SlashCommand {
  /** Command name, without the leading slash. */
  name: string;
  /** What the command does. */
  description: string;
  /** Hint for the command's arguments (e.g. `"<file>"`). */
  argumentHint: string;
  /** Alternate names that resolve to this command (e.g. `/cost` → `/usage`). */
  aliases?: readonly string[];
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
  /** Config the server was started from, discriminated on `type`. */
  config?: McpServerStatusConfig;
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
  /**
   * Tracked files left alone because a symlink, hard link or unsafe parent was
   * detected. Only set on a real (non-`dryRun`) rewind.
   */
  readonly skippedLinks?: number;
}

/**
 * Receipt from an interrupt.
 *
 * `undefined` from the control method means the CLI predates the receipt
 * protocol — the interrupt still happened, it just reported nothing.
 */
export interface InterruptResult {
  /**
   * Uuids of queued user messages that survived the interrupt. These will run
   * unless cancelled. An empty array does not mean nothing will run — messages
   * sent without a uuid are never listed.
   */
  readonly stillQueued: readonly string[];

  /** Uuids cancelled by this interrupt. Only present when cancellation was requested. */
  readonly cancelled?: readonly string[];
}

/** What the session loaded during `initialize` — the response to init and reinit. */
export interface InitializationResult {
  /** Slash commands the session accepts. */
  readonly commands: readonly SlashCommand[];

  /** Subagents available to the Task tool. */
  readonly agents: readonly AgentInfo[];

  /** Active output style. */
  readonly outputStyle: string;

  /** Output styles the session can switch to. */
  readonly availableOutputStyles: readonly string[];

  /** Models the session can run. */
  readonly models: readonly ModelInfo[];

  /** The logged-in account. */
  readonly account: AccountInfo;

  /**
   * Whether the hooks this initialize carried were registered. `false` means a
   * repeated initialize's hooks were ignored; absent when none were sent.
   */
  readonly hooksApplied?: boolean;

  /** Fast-mode state at startup. */
  readonly fastModeState?: FastModeState;

  /** Why fast mode is unavailable, e.g. `'free'`, `'preference'`, `'model_not_allowed'`. */
  readonly fastModeDisabledReason?: string;
}

/** File contents read through the session, so reads respect its permissions. */
export interface ReadFileResult {
  /** File contents, decoded per `encoding`. */
  readonly contents: string;

  /** Absolute path the request resolved to. */
  readonly absPath: string;

  /** True when the file was longer than the requested byte budget. */
  readonly truncated?: boolean;

  /** Set only when the contents are base64. Absent means UTF-8. */
  readonly encoding?: 'base64';
}

/** Session components refreshed by a plugin reload. */
export interface ReloadPluginsResult {
  /** The complete new command list. */
  readonly commands: readonly SlashCommand[];

  /** The complete new subagent list. */
  readonly agents: readonly AgentInfo[];

  /** Plugins now loaded. */
  readonly plugins: ReadonlyArray<{
    readonly name: string;
    readonly path: string;
    readonly source?: string;
    /** Declared in the plugin's manifest — plugin-author-controlled, so validate before trusting. */
    readonly version?: string;
  }>;

  /** MCP servers after the reload. */
  readonly mcpServers: readonly McpServerStatus[];

  /** How many plugins failed to load. */
  readonly errorCount: number;
}

/** Skills refreshed by a skill reload. */
export interface ReloadSkillsResult {
  /** The complete new skill list. */
  readonly skills: readonly SlashCommand[];
}

/** Outcome of pinning an MCP server's permission mode. */
export interface McpPermissionModeOverrideResult {
  /** Set when the override was accepted with a caveat. */
  readonly warning?: string;
}

// ── Context usage ─────────────────────────────────────────────────

/**
 * One row of the `/context` breakdown.
 *
 * `kind` classifies the row and comes from the message-carried report; `color`
 * and `isDeferred` come from the control-method report. Use `kind` — not `name`,
 * which is display text — to decide what a row means.
 */
export interface ContextUsageCategory {
  /** Display name of the row, e.g. "Messages" or "MCP tools (deferred)". */
  readonly name: string;

  /** Tokens attributed to the row. */
  readonly tokens: number;

  /**
   * What the row is: `'used'` occupies the window, `'free'` is what is left,
   * `'buffer'` is the compaction reserve, `'deferred'` rows are out-of-window
   * tool schemas excluded from the usage math.
   */
  readonly kind?: 'used' | 'free' | 'buffer' | 'deferred';

  /** Suggested accent color for the row. */
  readonly color?: string;

  /** True for out-of-window rows listed for awareness only. */
  readonly isDeferred?: boolean;
}

/**
 * Structured `/context` report — what is filling the context window.
 *
 * Two producers fill this: the assistant message wrapper (see
 * {@link StreamContextUsageEvent}) and the `getContextUsage()` control method.
 * They overlap on the core fields; the extras each one adds are optional here,
 * so check for a field before rendering it.
 *
 * @example
 * ```ts
 * const usage = await claude.getContextUsage()
 * console.log(`${usage.percentage}% of ${usage.rawMaxTokens}`)
 * for (const row of usage.categories) {
 *   if (row.kind === 'used') console.log(row.name, row.tokens)
 * }
 * ```
 */
export interface ContextUsage {
  /** Model the usage was computed for. */
  readonly model: string;

  /** Estimated tokens in use. Unclamped — it can exceed `rawMaxTokens`. */
  readonly totalTokens: number;

  /** The window usage is measured against, after compaction policy is applied. */
  readonly rawMaxTokens: number;

  /** The model's own window, before compaction policy. Control-method reports only. */
  readonly maxTokens?: number;

  /** `totalTokens / rawMaxTokens`, rounded, 0-100+. */
  readonly percentage: number;

  /**
   * Present when `totalTokens` exceeds `rawMaxTokens`. `kind` says how the
   * window was resolved: `'hard_limit'` is the model's own ceiling,
   * `'compaction_window'` a policy window that may sit below it.
   */
  readonly overLimit?: {
    readonly tokensOver: number;
    readonly kind: 'hard_limit' | 'compaction_window';
  };

  /** Usage broken down by category. Rows may carry zero tokens. */
  readonly categories: readonly ContextUsageCategory[];

  /** Tokens spent on MCP tool schemas. */
  readonly mcpTools?: ReadonlyArray<{
    /** Wire name, e.g. `"mcp__linear__create_issue"`. */
    readonly name: string;
    readonly serverName: string;
    readonly tokens: number;
    readonly isLoaded?: boolean;
  }>;

  /** Tokens spent on memory files (CLAUDE.md and friends). */
  readonly memoryFiles?: ReadonlyArray<{
    readonly path: string;
    /** Display label of the source, e.g. "Project" or "User". */
    readonly type: string;
    readonly tokens: number;
  }>;

  /** Tokens spent on subagent definitions. */
  readonly agents?: ReadonlyArray<{
    readonly agentType: string;
    /** Raw source id, e.g. 'projectSettings', 'userSettings', 'plugin'. */
    readonly source: string;
    readonly tokens: number;
  }>;

  /**
   * Tokens spent on skills. The message-carried report lists them one by one;
   * the control-method report summarizes them.
   */
  readonly skills?:
    | ReadonlyArray<{
        readonly name: string;
        /** Raw source id, e.g. 'userSettings', 'plugin', 'syncedSkills'. */
        readonly source: string;
        readonly pluginName?: string;
        readonly tokens: number;
      }>
    | {
        readonly totalSkills: number;
        readonly includedSkills: number;
        readonly tokens: number;
        readonly skillFrontmatter: ReadonlyArray<{
          readonly name: string;
          readonly source: string;
          readonly tokens: number;
        }>;
      };

  /** Tokens spent on slash-command definitions. Control-method reports only. */
  readonly slashCommands?: {
    readonly totalCommands: number;
    readonly includedCommands: number;
    readonly tokens: number;
  };

  /** Built-in tools kept out of the window. Control-method reports only. */
  readonly deferredBuiltinTools?: ReadonlyArray<{
    readonly name: string;
    readonly tokens: number;
    readonly isLoaded: boolean;
  }>;

  /** Tokens spent on built-in tool schemas. Control-method reports only. */
  readonly systemTools?: ReadonlyArray<{ readonly name: string; readonly tokens: number }>;

  /** Tokens spent on system-prompt sections. Control-method reports only. */
  readonly systemPromptSections?: ReadonlyArray<{ readonly name: string; readonly tokens: number }>;

  /** Pre-rendered grid the CLI draws the usage bar from. Control-method reports only. */
  readonly gridRows?: ReadonlyArray<
    ReadonlyArray<{
      readonly color: string;
      readonly isFilled: boolean;
      readonly categoryName: string;
      readonly tokens: number;
      readonly percentage: number;
      readonly squareFullness: number;
    }>
  >;

  /** Where the message tokens went. Control-method reports only. */
  readonly messageBreakdown?: {
    readonly toolCallTokens: number;
    readonly toolResultTokens: number;
    readonly attachmentTokens: number;
    readonly assistantMessageTokens: number;
    readonly userMessageTokens: number;
    readonly redirectedContextTokens: number;
    readonly unattributedTokens: number;
    readonly toolCallsByType: ReadonlyArray<{
      readonly name: string;
      readonly callTokens: number;
      readonly resultTokens: number;
    }>;
    readonly attachmentsByType: ReadonlyArray<{ readonly name: string; readonly tokens: number }>;
  };

  /** Fraction of the window at which autocompact fires. Control-method reports only. */
  readonly autoCompactThreshold?: number;

  /** Whether autocompact is on. Control-method reports only. */
  readonly isAutoCompactEnabled?: boolean;

  /** Tokens the last API request actually billed. Control-method reports only. */
  readonly apiUsage?: TokenUsage | null;
}

// ── Usage report ──────────────────────────────────────────────────

/**
 * Session totals plus plan rate-limit utilization — the structured form of
 * what `/usage` prints.
 *
 * @experimental The CLI marks the underlying control request unstable; its
 * shape may change in a future SDK release.
 */
export interface UsageReport {
  /** Cost and usage accumulated by this session. */
  readonly session: {
    readonly totalCostUsd: number;
    readonly totalApiDurationMs: number;
    readonly totalDurationMs: number;
    readonly totalLinesAdded: number;
    readonly totalLinesRemoved: number;
    /** Per-model totals, keyed by model id. */
    readonly modelUsage: Readonly<Record<string, ModelUsage>>;
  };

  /** Claude.ai plan ('pro', 'max', 'team', 'enterprise'), or `null` for API-key sessions. */
  readonly subscriptionType: string | null;

  /** `false` when plan rate limits do not apply — `rateLimits` is then `null`. */
  readonly rateLimitsAvailable: boolean;

  /** Plan rate-limit utilization, or `null` when unavailable. */
  readonly rateLimits: RateLimitWindows | null;

  /** What is driving usage, from a scan of local transcripts. `null` for non-subscriber sessions. */
  readonly behaviors: UsageBehaviors | null;
}

/** Utilization of one rate-limit window. */
export interface RateLimitWindow {
  /** Percentage of the window used, 0-100. */
  readonly utilization: number | null;

  /** ISO 8601 timestamp when the window resets. */
  readonly resetsAt: string | null;

  /** Server-supplied label, on model-scoped windows only (e.g. 'Fable'). */
  readonly displayName?: string;
}

/** Every rate-limit window the plan reports. */
export interface RateLimitWindows {
  readonly fiveHour?: RateLimitWindow | null;
  readonly sevenDay?: RateLimitWindow | null;
  readonly sevenDayOauthApps?: RateLimitWindow | null;
  readonly sevenDayOpus?: RateLimitWindow | null;
  readonly sevenDaySonnet?: RateLimitWindow | null;
  /** Per-model weekly windows. Present only when the server emits them. */
  readonly modelScoped?: readonly RateLimitWindow[];
  /** Paid overage credits. */
  readonly extraUsage?: {
    readonly isEnabled: boolean;
    readonly monthlyLimit: number | null;
    readonly usedCredits: number | null;
    readonly utilization: number | null;
    readonly currency?: string | null;
  } | null;
}

/** Usage attribution for one window, from a scan of local transcripts. */
export interface UsageBehaviors {
  /** Last 24 hours. */
  readonly day: UsageBehaviorWindow;

  /** Last 7 days. */
  readonly week: UsageBehaviorWindow;
}

/** Share of weighted local usage attributed to one named item, 0-100. */
export interface UsageAttributionEntry {
  readonly name: string;
  readonly pct: number;
}

/** One time window of the local-usage scan. Approximate: this machine only. */
export interface UsageBehaviorWindow {
  /** API requests found in local transcripts for this window. */
  readonly requestCount: number;

  /** Distinct sessions observed in this window. */
  readonly sessionCount: number;

  /** Behavioral characteristics. Categories overlap, so the shares do not sum to 100. */
  readonly behaviors: ReadonlyArray<{
    readonly key: 'cache_miss' | 'long_context' | 'subagent_heavy' | 'high_parallel' | 'cron';
    readonly pct: number;
    readonly count: number;
  }>;

  readonly agents: readonly UsageAttributionEntry[];
  readonly skills: readonly UsageAttributionEntry[];
  readonly plugins: readonly UsageAttributionEntry[];
  readonly mcpServers: readonly UsageAttributionEntry[];
}

// ── Token usage ───────────────────────────────────────────────────

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;

  /** Tokens written to the prompt cache. Billed differently from plain input tokens. */
  readonly cacheCreationInputTokens?: number;

  /** Tokens served from the prompt cache. */
  readonly cacheReadInputTokens?: number;

  /** Server-side tool calls billed on top of the token counts. */
  readonly serverToolUse?: {
    readonly webSearchRequests?: number;
    readonly webFetchRequests?: number;
  };

  /** Which capacity tier served the request. */
  readonly serviceTier?: 'standard' | 'priority' | 'batch';
}

/**
 * Token and cost totals for one model.
 *
 * The unit of `modelUsage` on results and usage reports. Unlike
 * {@link TokenUsage}, this covers subagents, sidechains and compaction too, so
 * it is the right basis for cost accounting.
 */
export interface ModelUsageEntry {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly webSearchRequests: number;

  /** Estimated cost in USD. The SDK spells this `costUSD` on the wire. */
  readonly costUsd: number;

  readonly contextWindow: number;
  readonly maxOutputTokens: number;

  /** Canonical model id used for the pricing lookup. May differ from the key. */
  readonly canonicalModel?: string;

  /** API provider that served the model, e.g. 'firstParty', 'bedrock', 'vertex'. */
  readonly provider?: string;

  /**
   * Which price table the most recent request was priced against. Absent until
   * a request has been priced, and on older CLIs — treat that as `'list'`.
   */
  readonly costBasis?: 'list' | 'managed' | 'unknown';
}

/** Alias of {@link ModelUsageEntry}, named after the SDK's `ModelUsage`. */
export type ModelUsage = ModelUsageEntry;

export interface Message {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly ContentBlock[];
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | RedactedThinkingBlock;

export interface TextBlock {
  readonly type: typeof BLOCK_TEXT;
  readonly text: string;
}

export interface ToolUseBlock {
  readonly type: typeof BLOCK_TOOL_USE;
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface ToolResultBlock {
  readonly type: typeof BLOCK_TOOL_RESULT;
  readonly tool_use_id: string;
  readonly content: string;
}

/** Extended-thinking block. Only present when thinking is enabled. */
export interface ThinkingBlock {
  readonly type: typeof BLOCK_THINKING;

  /** The reasoning text. */
  readonly thinking: string;

  /** Signature the API uses to verify the block on replay. */
  readonly signature?: string;
}

/** Encrypted thinking block — the reasoning cannot be displayed, only replayed. */
export interface RedactedThinkingBlock {
  readonly type: typeof BLOCK_REDACTED_THINKING;

  /** Opaque payload. Pass it back untouched; do not try to render it. */
  readonly data: string;
}
