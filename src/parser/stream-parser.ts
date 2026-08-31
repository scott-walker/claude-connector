import type { StreamEvent } from '../types/index.js';
import { mapToolResultContent } from './content-blocks.js';
import type {
  ContextUsage,
  ContextUsageCategory,
  DeferredToolUse,
  MessageOrigin,
  ModelUsageEntry,
  PermissionDenial,
  ResultSubtype,
  SlashCommand,
  StreamCompactBoundaryEvent,
  StreamHookResponseEvent,
  StreamInitEvent,
  StreamResultEvent,
  StreamModelRefusalFallbackEvent,
  StreamRateLimitEvent,
  StreamStatusEvent,
  StreamTaskUpdatedEvent,
  TerminalReason,
  TokenUsage,
} from '../types/result.js';
import {
  KEY_TYPE, KEY_RESULT, KEY_SESSION_ID, KEY_USAGE, KEY_INPUT_TOKENS, KEY_OUTPUT_TOKENS,
  KEY_TOTAL_COST, KEY_DURATION, KEY_MESSAGE, KEY_CONTENT, KEY_TEXT, KEY_NAME, KEY_INPUT,
  KEY_ERROR, KEY_CODE, KEY_SUBTYPE, KEY_STRUCTURED_OUTPUT,
  KEY_IS_ERROR, KEY_STOP_REASON, KEY_NUM_TURNS, KEY_ERRORS, KEY_TERMINAL_REASON,
  KEY_PERMISSION_DENIALS, KEY_DEFERRED_TOOL_USE, KEY_DURATION_API, KEY_QUEUED_TURN_COUNT,
  KEY_TTFT_MS, KEY_API_ERROR_STATUS, KEY_FAST_MODE_STATE, KEY_FAST_MODE_DISABLED_REASON,
  KEY_ORIGIN, KEY_USER_MESSAGE_UUID, KEY_MODEL_USAGE,
  KEY_CACHE_CREATION_INPUT_TOKENS, KEY_CACHE_READ_INPUT_TOKENS, KEY_SERVER_TOOL_USE,
  KEY_SERVICE_TIER, KEY_TOTAL_TOKENS, KEY_TOOL_USES, KEY_WEB_SEARCH_REQUESTS,
  KEY_TOOL_NAME, KEY_TOOL_USE_ID, KEY_TOOL_INPUT, KEY_TOOL_USE_RESULT, KEY_PARENT_TOOL_USE_ID,
  KEY_IS_REPLAY, KEY_IS_SYNTHETIC, KEY_TASK_ID, KEY_TASK_TYPE, KEY_TASKS, KEY_PATCH,
  KEY_DESCRIPTION, KEY_SUBAGENT_TYPE, KEY_SUBAGENT_RETRY, KEY_IS_BACKGROUNDED, KEY_SPAWN_DEPTH,
  KEY_WORKFLOW_NAME, KEY_SKIP_TRANSCRIPT, KEY_AMBIENT, KEY_END_TIME, KEY_TOTAL_PAUSED_MS,
  KEY_HEARTBEAT, KEY_ATTEMPT, KEY_MAX_RETRIES, KEY_RETRY_DELAY_MS, KEY_ERROR_STATUS,
  KEY_ERROR_CATEGORY, KEY_REQUEST_ID, KEY_DIRECTION, KEY_SCOPE, KEY_ORIGINAL_MODEL,
  KEY_FALLBACK_MODEL, KEY_API_REFUSAL_CATEGORY, KEY_API_REFUSAL_EXPLANATION,
  KEY_RETRACTED_MESSAGE_UUIDS, KEY_REFUSED_USER_MESSAGE_UUID, KEY_AGENT_ID,
  KEY_DECISION_REASON, KEY_DECISION_REASON_TYPE, KEY_LEVEL, KEY_PREVENT_CONTINUATION,
  KEY_PRIORITY, KEY_COLOR, KEY_TIMEOUT_MS, KEY_KEY, KEY_SUGGESTION, KEY_STATE, KEY_STATUS,
  KEY_REASON, KEY_MODE, KEY_NEW_CONVERSATION_ID, KEY_MEMORIES, KEY_COMMANDS, KEY_PATH,
  KEY_VERSION, KEY_MCP_SERVER_NAME, KEY_ELICITATION_ID, KEY_THINKING, KEY_SIGNATURE, KEY_DATA,
  KEY_ESTIMATED_TOKENS, KEY_ESTIMATED_TOKENS_DELTA, KEY_EVENT, KEY_COMPACT_METADATA,
  KEY_TRIGGER, KEY_PRE_TOKENS, KEY_POST_TOKENS, KEY_PRESERVED_SEGMENT, KEY_PRESERVED_MESSAGES,
  KEY_COMPACT_RESULT, KEY_COMPACT_ERROR, KEY_CWD, KEY_API_KEY_SOURCE, KEY_PERMISSION_MODE,
  KEY_CLAUDE_CODE_VERSION, KEY_SLASH_COMMANDS, KEY_TERMINAL_SLASH_COMMANDS, KEY_MCP_SERVERS,
  KEY_OUTPUT_STYLE, KEY_SKILLS, KEY_PLUGINS, KEY_AGENTS, KEY_BETAS, KEY_EFFORT,
  KEY_CAPABILITIES, KEY_CONTEXT_USAGE, KEY_RAW_MAX_TOKENS, KEY_PERCENTAGE, KEY_OVER_LIMIT,
  KEY_TOKENS_OVER, KEY_KIND, KEY_CATEGORIES, KEY_MCP_TOOLS, KEY_MEMORY_FILES, KEY_TOKENS,
  KEY_RATE_LIMIT_INFO, KEY_RATE_LIMIT_TYPE, KEY_RESETS_AT, KEY_UTILIZATION,
  KEY_OVERAGE_STATUS, KEY_OVERAGE_RESETS_AT, KEY_OVERAGE_DISABLED_REASON,
  KEY_IS_USING_OVERAGE, KEY_OVERAGE_IN_USE, KEY_MODEL, KEY_TOOLS,
  KEY_HOOK_ID, KEY_HOOK_NAME, KEY_HOOK_EVENT, KEY_STDOUT, KEY_STDERR, KEY_OUTPUT,
  KEY_EXIT_CODE, KEY_OUTCOME, KEY_ELAPSED_TIME_SECONDS, KEY_PRECEDING_TOOL_USE_IDS,
  KEY_SUMMARY, KEY_LAST_TOOL_NAME, KEY_OUTPUT_FILE, KEY_PROMPT, KEY_FILES, KEY_FAILED,
  KEY_FILENAME, KEY_FILE_ID, KEY_PROCESSED_AT, KEY_IS_AUTHENTICATING, KEY_TIMESTAMP,
  KEY_TASK_DESCRIPTION, KEY_ANCHOR_UUID, KEY_HEAD_UUID, KEY_TAIL_UUID, KEY_UUIDS,
  KEY_PROJECT_KEY, KEY_SESSION_ID_CAMEL, KEY_SUBPATH, KEY_SERVER_NAME, KEY_AGENT_TYPE,
  KEY_SOURCE, KEY_PLUGIN_NAME, KEY_WEB_FETCH_REQUESTS, KEY_COST_USD,
  KEY_INPUT_TOKENS_CAMEL, KEY_OUTPUT_TOKENS_CAMEL, KEY_CACHE_READ_TOKENS_CAMEL,
  KEY_CACHE_CREATION_TOKENS_CAMEL, KEY_WEB_SEARCH_REQUESTS_CAMEL, KEY_CONTEXT_WINDOW,
  KEY_MAX_OUTPUT_TOKENS, KEY_CANONICAL_MODEL, KEY_PROVIDER, KEY_COST_BASIS,
  KEY_ARGUMENT_HINT, KEY_ALIASES, KEY_ID,
  EVENT_RESULT, EVENT_ERROR, EVENT_TEXT, EVENT_TOOL_USE, EVENT_SYSTEM, EVENT_TOOL_RESULT,
  EVENT_TASK_STARTED, EVENT_TASK_PROGRESS, EVENT_TASK_NOTIFICATION, EVENT_TASK_UPDATED,
  EVENT_BACKGROUND_TASKS_CHANGED, EVENT_TOOL_PROGRESS, EVENT_TOOL_USE_SUMMARY,
  EVENT_AUTH_STATUS, EVENT_HOOK_STARTED, EVENT_HOOK_PROGRESS, EVENT_HOOK_RESPONSE,
  EVENT_FILES_PERSISTED, EVENT_COMPACT_BOUNDARY, EVENT_CONTEXT_USAGE,
  EVENT_LOCAL_COMMAND_OUTPUT, EVENT_THINKING, EVENT_THINKING_TOKENS, EVENT_API_RETRY,
  EVENT_MODEL_REFUSAL_FALLBACK, EVENT_MODEL_REFUSAL_NO_FALLBACK, EVENT_SESSION_STATE_CHANGED,
  EVENT_STATUS, EVENT_WORKER_SHUTTING_DOWN, EVENT_CONVERSATION_RESET, EVENT_MIRROR_ERROR,
  EVENT_INIT, EVENT_PERMISSION_DENIED, EVENT_NOTIFICATION, EVENT_INFORMATIONAL,
  EVENT_PROMPT_SUGGESTION, EVENT_PARTIAL_MESSAGE, EVENT_MEMORY_RECALL, EVENT_COMMANDS_CHANGED,
  EVENT_PLUGIN_INSTALL, EVENT_ELICITATION_COMPLETE, EVENT_CONTROL_REQUEST_PROGRESS,
  EVENT_RATE_LIMIT, SDK_RATE_LIMIT_EVENT, SDK_STREAM_EVENT,
  ROLE_ASSISTANT, ROLE_USER, BLOCK_TEXT, BLOCK_TOOL_USE, BLOCK_TOOL_RESULT, BLOCK_THINKING,
  BLOCK_REDACTED_THINKING, RESULT_SUCCESS, SYSTEM_UNKNOWN, PERMISSION_DEFAULT,
  RESULT_ERROR_DURING_EXECUTION, RESUME_REJECTED_PREFIX,
  COMPACT_TRIGGER_AUTO, RATE_LIMIT_ALLOWED, UNKNOWN_ERROR_MESSAGE, KEY_ABORTED,
} from '../constants.js';

/** Shared empty result, so a skipped line allocates nothing. */
const NO_EVENTS: readonly StreamEvent[] = Object.freeze([]);

/**
 * Parses a single line of NDJSON from `claude -p --output-format stream-json`.
 *
 * ## Stream format
 *
 * Each line is a self-contained JSON object whose `type` selects the shape.
 * Most CLI-side signals arrive as `system` messages with a `subtype`:
 *
 * ```jsonl
 * {"type":"system","subtype":"init","model":"sonnet","tools":["Read"], ...}
 * {"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."}]}}
 * {"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1", ...}]}}
 * {"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"audit", ...}
 * {"type":"result","session_id":"...","usage":{...},"duration_ms":...}
 * ```
 *
 * The parser maps these into the typed {@link StreamEvent} union, using the same
 * variants — and the same defaults — the SDK executor produces, so a given SDK
 * message and its stream-json twin yield the same events in the same order.
 * Types it does not model are forwarded as `system` events for extensibility.
 *
 * One line can carry several events: an assistant turn holds a wrapper-level
 * error, every content block, and a `/context` report; a user turn holds one
 * `tool_result` per parallel tool call. That is why this is the plural entry
 * point — {@link parseStreamLine} keeps the older single-event shape.
 *
 * Note that some of these lines only appear when the matching flag was passed:
 * `hook_*` needs `--include-hook-events`, `stream_event` needs
 * `--include-partial-messages`, and `prompt_suggestion` needs
 * `--prompt-suggestions`.
 *
 * @returns Every event the line carries, in wire order. Empty when the line is
 *   malformed or carries nothing this library models as an event.
 */
export function parseStreamEvents(line: string): readonly StreamEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    // Malformed line — skip gracefully
    return NO_EVENTS;
  }
  if (!isRecord(parsed)) return NO_EVENTS;

  const json = parsed;
  const type = json[KEY_TYPE];

  switch (type) {
    case EVENT_RESULT:
      return parseResultEvents(json);

    case ROLE_ASSISTANT:
      return parseAssistantEvents(json);

    case ROLE_USER:
      return parseUserEvents(json);

    case EVENT_ERROR:
      return [{
        type: EVENT_ERROR,
        message: String(json[KEY_MESSAGE] ?? json[KEY_ERROR] ?? UNKNOWN_ERROR_MESSAGE),
        code: optString(json[KEY_CODE]),
        requestId: optString(json[KEY_REQUEST_ID]),
      }];

    case EVENT_SYSTEM:
      return [parseSystemEvent(json)];

    case EVENT_TOOL_PROGRESS:
      return [{
        type: EVENT_TOOL_PROGRESS,
        toolUseId: String(json[KEY_TOOL_USE_ID] ?? ''),
        toolName: String(json[KEY_TOOL_NAME] ?? ''),
        parentToolUseId: optString(json[KEY_PARENT_TOOL_USE_ID]) ?? null,
        elapsedTimeSeconds: numberOr(json[KEY_ELAPSED_TIME_SECONDS], 0),
        taskId: optString(json[KEY_TASK_ID]),
        heartbeat: optBoolean(json[KEY_HEARTBEAT]),
        subagentType: optString(json[KEY_SUBAGENT_TYPE]),
        subagentRetry: parseSubagentRetry(json[KEY_SUBAGENT_RETRY]),
      }];

    case EVENT_TOOL_USE_SUMMARY:
      return [{
        type: EVENT_TOOL_USE_SUMMARY,
        summary: String(json[KEY_SUMMARY] ?? ''),
        precedingToolUseIds: stringArray(json[KEY_PRECEDING_TOOL_USE_IDS]),
      }];

    case EVENT_AUTH_STATUS:
      return [{
        type: EVENT_AUTH_STATUS,
        isAuthenticating: json[KEY_IS_AUTHENTICATING] === true,
        output: stringArray(json[KEY_OUTPUT]),
        error: optString(json[KEY_ERROR]),
      }];

    case SDK_RATE_LIMIT_EVENT:
      return [parseRateLimitEvent(json[KEY_RATE_LIMIT_INFO])];

    case SDK_STREAM_EVENT:
      return [{
        type: EVENT_PARTIAL_MESSAGE,
        event: isRecord(json[KEY_EVENT]) ? json[KEY_EVENT] : {},
        parentToolUseId: optString(json[KEY_PARENT_TOOL_USE_ID]) ?? null,
        ttftMs: optNumber(json[KEY_TTFT_MS]),
        userMessageUuid: optString(json[KEY_USER_MESSAGE_UUID]),
      }];

    case EVENT_PROMPT_SUGGESTION:
      return [{
        type: EVENT_PROMPT_SUGGESTION,
        suggestion: String(json[KEY_SUGGESTION] ?? ''),
      }];

    case EVENT_CONVERSATION_RESET:
      return [{
        type: EVENT_CONVERSATION_RESET,
        newConversationId: String(json[KEY_NEW_CONVERSATION_ID] ?? ''),
      }];

    default:
      // Forward unknown types as system events
      return [systemFallback(String(type ?? SYSTEM_UNKNOWN), json)];
  }
}

/**
 * Single-event view of {@link parseStreamEvents}, kept for backward
 * compatibility — this is the shape the package root has always exported.
 *
 * It yields the line's *primary* event: the last one `parseStreamEvents`
 * produces, which is the block the CLI is currently delivering and, on a
 * `/context` turn, the structured report rather than its rendered table. Lines
 * that carry more than one event — an assistant turn with several content
 * blocks, a user turn answering parallel tool calls — lose the rest here, so
 * prefer {@link parseStreamEvents} for anything that must not drop events.
 *
 * @returns The line's primary event, or `null` if the line should be skipped.
 */
export function parseStreamLine(line: string): StreamEvent | null {
  return parseStreamEvents(line).at(-1) ?? null;
}

// ── system subtypes ───────────────────────────────────────────────

/**
 * Map a `system` line onto its typed event.
 * The CLI puts most of its out-of-band signals here, discriminated by `subtype`.
 */
function parseSystemEvent(json: Record<string, unknown>): StreamEvent {
  const subtype = optString(json[KEY_SUBTYPE]);

  switch (subtype) {
    case EVENT_INIT:
      return parseInitEvent(json);

    // ── Task lifecycle ──────────────────────────────────────────
    case EVENT_TASK_STARTED:
      return {
        type: EVENT_TASK_STARTED,
        taskId: String(json[KEY_TASK_ID] ?? ''),
        toolUseId: optString(json[KEY_TOOL_USE_ID]),
        description: String(json[KEY_DESCRIPTION] ?? ''),
        taskType: optString(json[KEY_TASK_TYPE]),
        prompt: optString(json[KEY_PROMPT]),
        subagentType: optString(json[KEY_SUBAGENT_TYPE]),
        isBackgrounded: optBoolean(json[KEY_IS_BACKGROUNDED]),
        spawnDepth: optNumber(json[KEY_SPAWN_DEPTH]),
        workflowName: optString(json[KEY_WORKFLOW_NAME]),
        skipTranscript: optBoolean(json[KEY_SKIP_TRANSCRIPT]),
        ambient: optBoolean(json[KEY_AMBIENT]),
      };

    case EVENT_TASK_PROGRESS:
      return {
        type: EVENT_TASK_PROGRESS,
        taskId: String(json[KEY_TASK_ID] ?? ''),
        toolUseId: optString(json[KEY_TOOL_USE_ID]),
        description: String(json[KEY_DESCRIPTION] ?? ''),
        usage: parseTaskUsage(json[KEY_USAGE]),
        lastToolName: optString(json[KEY_LAST_TOOL_NAME]),
        summary: optString(json[KEY_SUMMARY]),
        subagentType: optString(json[KEY_SUBAGENT_TYPE]),
      };

    case EVENT_TASK_NOTIFICATION:
      return {
        type: EVENT_TASK_NOTIFICATION,
        taskId: String(json[KEY_TASK_ID] ?? ''),
        toolUseId: optString(json[KEY_TOOL_USE_ID]),
        status: unionOr(json[KEY_STATUS], 'completed'),
        outputFile: String(json[KEY_OUTPUT_FILE] ?? ''),
        summary: String(json[KEY_SUMMARY] ?? ''),
        usage: json[KEY_USAGE] === undefined ? undefined : parseTaskUsage(json[KEY_USAGE]),
        skipTranscript: optBoolean(json[KEY_SKIP_TRANSCRIPT]),
        ambient: optBoolean(json[KEY_AMBIENT]),
      };

    case EVENT_TASK_UPDATED: {
      const patch = isRecord(json[KEY_PATCH]) ? json[KEY_PATCH] : {};
      return {
        type: EVENT_TASK_UPDATED,
        taskId: String(json[KEY_TASK_ID] ?? ''),
        patch: {
          status: optString(patch[KEY_STATUS]) as StreamTaskUpdatedEvent['patch']['status'],
          description: optString(patch[KEY_DESCRIPTION]),
          endTime: optNumber(patch[KEY_END_TIME]),
          totalPausedMs: optNumber(patch[KEY_TOTAL_PAUSED_MS]),
          error: optString(patch[KEY_ERROR]),
          isBackgrounded: optBoolean(patch[KEY_IS_BACKGROUNDED]),
        },
      };
    }

    case EVENT_BACKGROUND_TASKS_CHANGED:
      return {
        type: EVENT_BACKGROUND_TASKS_CHANGED,
        tasks: recordArray(json[KEY_TASKS]).map((task) => ({
          taskId: String(task[KEY_TASK_ID] ?? ''),
          taskType: String(task[KEY_TASK_TYPE] ?? ''),
          description: String(task[KEY_DESCRIPTION] ?? ''),
          ambient: optBoolean(task[KEY_AMBIENT]),
        })),
      };

    // ── Hook lifecycle (requires --include-hook-events) ─────────
    case EVENT_HOOK_STARTED:
      return {
        type: EVENT_HOOK_STARTED,
        hookId: String(json[KEY_HOOK_ID] ?? ''),
        hookName: String(json[KEY_HOOK_NAME] ?? ''),
        hookEvent: String(json[KEY_HOOK_EVENT] ?? ''),
      };

    case EVENT_HOOK_PROGRESS:
      return {
        type: EVENT_HOOK_PROGRESS,
        hookId: String(json[KEY_HOOK_ID] ?? ''),
        hookName: String(json[KEY_HOOK_NAME] ?? ''),
        hookEvent: String(json[KEY_HOOK_EVENT] ?? ''),
        stdout: String(json[KEY_STDOUT] ?? ''),
        stderr: String(json[KEY_STDERR] ?? ''),
        output: String(json[KEY_OUTPUT] ?? ''),
      };

    case EVENT_HOOK_RESPONSE:
      return {
        type: EVENT_HOOK_RESPONSE,
        hookId: String(json[KEY_HOOK_ID] ?? ''),
        hookName: String(json[KEY_HOOK_NAME] ?? ''),
        hookEvent: String(json[KEY_HOOK_EVENT] ?? ''),
        output: String(json[KEY_OUTPUT] ?? ''),
        stdout: String(json[KEY_STDOUT] ?? ''),
        stderr: String(json[KEY_STDERR] ?? ''),
        exitCode: optNumber(json[KEY_EXIT_CODE]),
        outcome:
          (json[KEY_OUTCOME] as StreamHookResponseEvent['outcome'] | undefined) ?? RESULT_SUCCESS,
      };

    // ── Workspace & context ─────────────────────────────────────
    case EVENT_FILES_PERSISTED:
      return {
        type: EVENT_FILES_PERSISTED,
        files: recordArray(json[KEY_FILES]).map((file) => ({
          filename: String(file[KEY_FILENAME] ?? ''),
          fileId: String(file[KEY_FILE_ID] ?? ''),
        })),
        failed: recordArray(json[KEY_FAILED]).map((file) => ({
          filename: String(file[KEY_FILENAME] ?? ''),
          error: String(file[KEY_ERROR] ?? ''),
        })),
        processedAt: String(json[KEY_PROCESSED_AT] ?? ''),
      };

    case EVENT_COMPACT_BOUNDARY: {
      const meta = isRecord(json[KEY_COMPACT_METADATA]) ? json[KEY_COMPACT_METADATA] : {};
      const segment = isRecord(meta[KEY_PRESERVED_SEGMENT]) ? meta[KEY_PRESERVED_SEGMENT] : undefined;
      const preserved = isRecord(meta[KEY_PRESERVED_MESSAGES]) ? meta[KEY_PRESERVED_MESSAGES] : undefined;
      return {
        type: EVENT_COMPACT_BOUNDARY,
        trigger: (meta[KEY_TRIGGER] as StreamCompactBoundaryEvent['trigger'] | undefined)
          ?? COMPACT_TRIGGER_AUTO,
        preTokens: numberOr(meta[KEY_PRE_TOKENS], 0),
        postTokens: optNumber(meta[KEY_POST_TOKENS]),
        durationMs: optNumber(meta[KEY_DURATION]),
        preservedMessages: preserved && {
          anchorUuid: String(preserved[KEY_ANCHOR_UUID] ?? ''),
          uuids: stringArray(preserved[KEY_UUIDS]),
        },
        preservedSegment: segment && {
          headUuid: String(segment[KEY_HEAD_UUID] ?? ''),
          anchorUuid: String(segment[KEY_ANCHOR_UUID] ?? ''),
          tailUuid: String(segment[KEY_TAIL_UUID] ?? ''),
        },
      };
    }

    case EVENT_LOCAL_COMMAND_OUTPUT:
      return {
        type: EVENT_LOCAL_COMMAND_OUTPUT,
        content: String(json[KEY_CONTENT] ?? ''),
      };

    case EVENT_THINKING_TOKENS:
      return {
        type: EVENT_THINKING_TOKENS,
        estimatedTokens: numberOr(json[KEY_ESTIMATED_TOKENS], 0),
        estimatedTokensDelta: numberOr(json[KEY_ESTIMATED_TOKENS_DELTA], 0),
      };

    // ── Retries, refusals & limits ──────────────────────────────
    case EVENT_API_RETRY:
      return {
        type: EVENT_API_RETRY,
        attempt: numberOr(json[KEY_ATTEMPT], 0),
        maxRetries: numberOr(json[KEY_MAX_RETRIES], 0),
        retryDelayMs: numberOr(json[KEY_RETRY_DELAY_MS], 0),
        errorStatus: optNumber(json[KEY_ERROR_STATUS]) ?? null,
        error: String(json[KEY_ERROR] ?? ''),
      };

    case EVENT_MODEL_REFUSAL_FALLBACK:
      return {
        type: EVENT_MODEL_REFUSAL_FALLBACK,
        direction: unionOr(json[KEY_DIRECTION], 'retry'),
        scope: optString(json[KEY_SCOPE]) as StreamModelRefusalFallbackEvent['scope'],
        originalModel: String(json[KEY_ORIGINAL_MODEL] ?? ''),
        fallbackModel: String(json[KEY_FALLBACK_MODEL] ?? ''),
        requestId: optString(json[KEY_REQUEST_ID]) ?? null,
        refusalCategory: optString(json[KEY_API_REFUSAL_CATEGORY]),
        refusalExplanation: optString(json[KEY_API_REFUSAL_EXPLANATION]),
        retractedMessageUuids: json[KEY_RETRACTED_MESSAGE_UUIDS] === undefined
          ? undefined
          : stringArray(json[KEY_RETRACTED_MESSAGE_UUIDS]),
        refusedUserMessageUuid: optString(json[KEY_REFUSED_USER_MESSAGE_UUID]),
        content: String(json[KEY_CONTENT] ?? ''),
      };

    case EVENT_MODEL_REFUSAL_NO_FALLBACK:
      return {
        type: EVENT_MODEL_REFUSAL_NO_FALLBACK,
        originalModel: String(json[KEY_ORIGINAL_MODEL] ?? ''),
        requestId: optString(json[KEY_REQUEST_ID]) ?? null,
        refusalCategory: optString(json[KEY_API_REFUSAL_CATEGORY]),
        refusalExplanation: optString(json[KEY_API_REFUSAL_EXPLANATION]),
        refusedUserMessageUuid: optString(json[KEY_REFUSED_USER_MESSAGE_UUID]),
        content: String(json[KEY_CONTENT] ?? ''),
      };

    // Quota state also reaches CLI mode as a `system` line, not only as the
    // top-level `rate_limit_event` message.
    case EVENT_RATE_LIMIT:
      return parseRateLimitEvent(json[KEY_RATE_LIMIT_INFO] ?? json);

    // ── Permissions & notifications ─────────────────────────────
    case EVENT_PERMISSION_DENIED:
      return {
        type: EVENT_PERMISSION_DENIED,
        toolName: String(json[KEY_TOOL_NAME] ?? ''),
        toolUseId: String(json[KEY_TOOL_USE_ID] ?? ''),
        agentId: optString(json[KEY_AGENT_ID]),
        decisionReasonType: optString(json[KEY_DECISION_REASON_TYPE]),
        decisionReason: optString(json[KEY_DECISION_REASON]),
        message: String(json[KEY_MESSAGE] ?? ''),
      };

    case EVENT_NOTIFICATION:
      return {
        type: EVENT_NOTIFICATION,
        key: String(json[KEY_KEY] ?? ''),
        text: String(json[KEY_TEXT] ?? ''),
        priority: unionOr(json[KEY_PRIORITY], 'low'),
        color: optString(json[KEY_COLOR]),
        timeoutMs: optNumber(json[KEY_TIMEOUT_MS]),
      };

    case EVENT_INFORMATIONAL:
      return {
        type: EVENT_INFORMATIONAL,
        content: String(json[KEY_CONTENT] ?? ''),
        level: unionOr(json[KEY_LEVEL], 'info'),
        toolUseId: optString(json[KEY_TOOL_USE_ID]),
        preventContinuation: optBoolean(json[KEY_PREVENT_CONTINUATION]),
      };

    // ── Session & runtime ───────────────────────────────────────
    case EVENT_STATUS:
      return {
        type: EVENT_STATUS,
        status: (json[KEY_STATUS] as StreamStatusEvent['status']) ?? null,
        permissionMode: optString(json[KEY_PERMISSION_MODE]) as StreamStatusEvent['permissionMode'],
        compactResult: optString(json[KEY_COMPACT_RESULT]) as StreamStatusEvent['compactResult'],
        compactError: optString(json[KEY_COMPACT_ERROR]),
      };

    case EVENT_SESSION_STATE_CHANGED:
      return {
        type: EVENT_SESSION_STATE_CHANGED,
        state: unionOr(json[KEY_STATE], 'idle'),
      };

    case EVENT_WORKER_SHUTTING_DOWN:
      return {
        type: EVENT_WORKER_SHUTTING_DOWN,
        reason: String(json[KEY_REASON] ?? ''),
      };

    case EVENT_MIRROR_ERROR: {
      const key = isRecord(json[KEY_KEY]) ? json[KEY_KEY] : {};
      return {
        type: EVENT_MIRROR_ERROR,
        error: String(json[KEY_ERROR] ?? ''),
        key: {
          projectKey: String(key[KEY_PROJECT_KEY] ?? ''),
          sessionId: String(key[KEY_SESSION_ID_CAMEL] ?? ''),
          subpath: optString(key[KEY_SUBPATH]),
        },
      };
    }

    // ── Memory, commands, plugins & elicitation ─────────────────
    case EVENT_MEMORY_RECALL:
      return {
        type: EVENT_MEMORY_RECALL,
        mode: unionOr(json[KEY_MODE], 'select'),
        memories: recordArray(json[KEY_MEMORIES]).map((memory) => ({
          path: String(memory[KEY_PATH] ?? ''),
          scope: unionOr(memory[KEY_SCOPE], 'personal'),
          content: optString(memory[KEY_CONTENT]),
        })),
      };

    case EVENT_COMMANDS_CHANGED:
      return {
        type: EVENT_COMMANDS_CHANGED,
        commands: recordArray(json[KEY_COMMANDS]).map(parseSlashCommand),
      };

    case EVENT_PLUGIN_INSTALL:
      return {
        type: EVENT_PLUGIN_INSTALL,
        status: unionOr(json[KEY_STATUS], 'started'),
        name: optString(json[KEY_NAME]),
        error: optString(json[KEY_ERROR]),
      };

    case EVENT_ELICITATION_COMPLETE:
      return {
        type: EVENT_ELICITATION_COMPLETE,
        mcpServerName: String(json[KEY_MCP_SERVER_NAME] ?? ''),
        elicitationId: String(json[KEY_ELICITATION_ID] ?? ''),
      };

    case EVENT_CONTROL_REQUEST_PROGRESS:
      return {
        type: EVENT_CONTROL_REQUEST_PROGRESS,
        requestId: String(json[KEY_REQUEST_ID] ?? ''),
        status: unionOr(json[KEY_STATUS], 'started'),
        attempt: optNumber(json[KEY_ATTEMPT]),
        maxRetries: optNumber(json[KEY_MAX_RETRIES]),
        retryDelayMs: optNumber(json[KEY_RETRY_DELAY_MS]),
        errorStatus: json[KEY_ERROR_STATUS] === undefined
          ? undefined
          : (optNumber(json[KEY_ERROR_STATUS]) ?? null),
      };

    default:
      // Same fallback chain as the SDK executor: own subtype, then the message
      // type, so a system line the library does not model yet stays identifiable.
      return systemFallback(subtype ?? EVENT_SYSTEM, json);
  }
}

// ── message branches ──────────────────────────────────────────────

/**
 * The `init` handshake — what the CLI loaded and which model it settled on.
 * Always the first line of a stream-json run.
 */
function parseInitEvent(json: Record<string, unknown>): StreamEvent {
  return {
    type: EVENT_INIT,
    model: String(json[KEY_MODEL] ?? ''),
    cwd: String(json[KEY_CWD] ?? ''),
    tools: stringArray(json[KEY_TOOLS]),
    skills: stringArray(json[KEY_SKILLS]),
    slashCommands: stringArray(json[KEY_SLASH_COMMANDS]),
    terminalSlashCommands: json[KEY_TERMINAL_SLASH_COMMANDS] === undefined
      ? undefined
      : stringArray(json[KEY_TERMINAL_SLASH_COMMANDS]),
    mcpServers: recordArray(json[KEY_MCP_SERVERS]).map((server) => ({
      name: String(server[KEY_NAME] ?? ''),
      status: String(server[KEY_STATUS] ?? ''),
    })),
    plugins: recordArray(json[KEY_PLUGINS]).map((plugin) => ({
      name: String(plugin[KEY_NAME] ?? ''),
      path: String(plugin[KEY_PATH] ?? ''),
      version: optString(plugin[KEY_VERSION]),
    })),
    agents: json[KEY_AGENTS] === undefined ? undefined : stringArray(json[KEY_AGENTS]),
    permissionMode: unionOr(json[KEY_PERMISSION_MODE], PERMISSION_DEFAULT),
    apiKeySource: String(json[KEY_API_KEY_SOURCE] ?? ''),
    claudeCodeVersion: String(json[KEY_CLAUDE_CODE_VERSION] ?? ''),
    outputStyle: String(json[KEY_OUTPUT_STYLE] ?? ''),
    betas: json[KEY_BETAS] === undefined ? undefined : stringArray(json[KEY_BETAS]),
    effort: (optString(json[KEY_EFFORT]) as StreamInitEvent['effort']) ?? null,
    capabilities: json[KEY_CAPABILITIES] === undefined
      ? undefined
      : stringArray(json[KEY_CAPABILITIES]),
    fastModeState: optString(json[KEY_FAST_MODE_STATE]) as StreamInitEvent['fastModeState'],
    fastModeDisabledReason: optString(json[KEY_FAST_MODE_DISABLED_REASON]),
  };
}

/**
 * The terminal message of a turn, preceded by an error event when the turn was
 * refused rather than run.
 *
 * A `--resume-drops-turn` refusal is deterministic: surfacing it as its own
 * error event lets callers route to a rewind path instead of retrying, which is
 * what the SDK executor does with the same message.
 */
function parseResultEvents(json: Record<string, unknown>): readonly StreamEvent[] {
  const events: StreamEvent[] = [];

  const resumeRejected = stringArray(json[KEY_ERRORS])
    .find((message) => message.startsWith(RESUME_REJECTED_PREFIX));
  if (resumeRejected !== undefined) {
    events.push({
      type: EVENT_ERROR,
      message: resumeRejected,
      code: RESULT_ERROR_DURING_EXECUTION,
    });
  }

  events.push(parseResultEvent(json));
  return events;
}

/**
 * The terminal message of a turn: text, spend, and the authoritative accounting
 * (`modelUsage`, `permissionDenials`, `terminalReason`, `errors`).
 *
 * `subtype` is passed through verbatim — `'success'` or the exact `error_*`
 * variant — matching what the SDK executor reports, so which limit was hit
 * survives into CLI mode. `terminalReason` and `errors` carry the detail.
 */
export function parseResultEvent(json: Record<string, unknown>): StreamResultEvent {
  return {
    type: EVENT_RESULT,
    subtype: (optString(json[KEY_SUBTYPE]) as ResultSubtype | undefined) ?? RESULT_SUCCESS,
    text: typeof json[KEY_RESULT] === 'string' ? json[KEY_RESULT] : '',
    sessionId: String(json[KEY_SESSION_ID] ?? ''),
    usage: parseUsage(json[KEY_USAGE]),
    cost: optNumber(json[KEY_TOTAL_COST]) ?? null,
    durationMs: numberOr(json[KEY_DURATION], 0),
    isError: json[KEY_IS_ERROR] === true,
    stopReason: optString(json[KEY_STOP_REASON]) ?? null,
    numTurns: optNumber(json[KEY_NUM_TURNS]),
    structured: json[KEY_STRUCTURED_OUTPUT] ?? null,
    errors: json[KEY_ERRORS] === undefined ? undefined : stringArray(json[KEY_ERRORS]),
    terminalReason: json[KEY_TERMINAL_REASON] as TerminalReason | undefined,
    modelUsage: parseModelUsage(json[KEY_MODEL_USAGE]),
    permissionDenials: json[KEY_PERMISSION_DENIALS] === undefined
      ? undefined
      : parsePermissionDenials(json[KEY_PERMISSION_DENIALS]),
    deferredToolUse: parseDeferredToolUse(json[KEY_DEFERRED_TOOL_USE]),
    durationApiMs: optNumber(json[KEY_DURATION_API]),
    queuedTurnCount: optNumber(json[KEY_QUEUED_TURN_COUNT]),
    ttftMs: optNumber(json[KEY_TTFT_MS]),
    apiErrorStatus: json[KEY_API_ERROR_STATUS] === undefined
      ? undefined
      : (optNumber(json[KEY_API_ERROR_STATUS]) ?? null),
    fastModeState: json[KEY_FAST_MODE_STATE] as StreamInitEvent['fastModeState'],
    origin: json[KEY_ORIGIN] as MessageOrigin | undefined,
  };
}

/**
 * An assistant turn: the wrapper-level error, then every content block, then the
 * structured `/context` report — the exact order the SDK executor pushes them.
 *
 * All three parts can be present at once. A `/context` turn carries both the
 * rendered markdown table (as a text block) and the structured `context_usage`
 * wrapper, and the markdown stays the canonical fallback, so neither is dropped.
 * An overloaded or refused turn arrives as `error` on the wrapper with an empty
 * content array; without reading it, the failure would vanish.
 */
function parseAssistantEvents(json: Record<string, unknown>): readonly StreamEvent[] {
  const events: StreamEvent[] = [];
  const message = json[KEY_MESSAGE];
  const content = isRecord(message) ? recordArray(message[KEY_CONTENT]) : [];

  // The wrapper-level `error` is the only signal an overloaded / rate-limited /
  // refused API turn produces — the content array is empty in that case.
  const error = optString(json[KEY_ERROR]);
  if (error !== undefined) {
    const text = content.map((block) => optString(block[KEY_TEXT]) ?? '').join('');
    events.push({
      type: EVENT_ERROR,
      message: text.length > 0 ? text : error,
      code: error,
      aborted: json[KEY_ABORTED] === true ? true : undefined,
      requestId: optString(json[KEY_REQUEST_ID]),
    });
  }

  for (const block of content) {
    const blockType = block[KEY_TYPE];
    if (blockType === BLOCK_TEXT) {
      const text = optString(block[KEY_TEXT]);
      if (text !== undefined) events.push({ type: EVENT_TEXT, text });
    } else if (blockType === BLOCK_TOOL_USE) {
      events.push({
        type: EVENT_TOOL_USE,
        toolName: String(block[KEY_NAME] ?? ''),
        toolInput: isRecord(block[KEY_INPUT]) ? block[KEY_INPUT] : {},
        toolUseId: optString(block[KEY_ID]),
      });
    } else if (blockType === BLOCK_THINKING) {
      events.push({
        type: EVENT_THINKING,
        thinking: String(block[KEY_THINKING] ?? ''),
        signature: optString(block[KEY_SIGNATURE]),
      });
    } else if (blockType === BLOCK_REDACTED_THINKING) {
      events.push({
        type: EVENT_THINKING,
        thinking: String(block[KEY_DATA] ?? ''),
        redacted: true,
      });
    }
  }

  const contextUsage = json[KEY_CONTEXT_USAGE];
  if (isRecord(contextUsage)) {
    events.push({ type: EVENT_CONTEXT_USAGE, contextUsage: parseContextUsage(contextUsage) });
  }

  return events;
}

/**
 * A user message. In a `--print` run these carry tool results back into the
 * transcript — one `tool_result` block per tool call, so a parallel batch
 * answers with several in a single message and each becomes its own event.
 * A replayed user prompt (`--replay-user-messages`) has no `tool_result` block
 * and is forwarded untyped.
 */
function parseUserEvents(json: Record<string, unknown>): readonly StreamEvent[] {
  const message = json[KEY_MESSAGE];
  const blocks = isRecord(message) ? recordArray(message[KEY_CONTENT]) : [];
  const events: StreamEvent[] = [];

  for (const block of blocks) {
    if (block[KEY_TYPE] !== BLOCK_TOOL_RESULT) continue;
    events.push({
      type: EVENT_TOOL_RESULT,
      toolUseId: String(block[KEY_TOOL_USE_ID] ?? ''),
      content: mapToolResultContent(block[KEY_CONTENT]),
      isError: optBoolean(block[KEY_IS_ERROR]),
      toolUseResult: json[KEY_TOOL_USE_RESULT],
      parentToolUseId: optString(json[KEY_PARENT_TOOL_USE_ID]) ?? null,
      isReplay: optBoolean(json[KEY_IS_REPLAY]),
      isSynthetic: optBoolean(json[KEY_IS_SYNTHETIC]),
      subagentType: optString(json[KEY_SUBAGENT_TYPE]),
      taskDescription: optString(json[KEY_TASK_DESCRIPTION]),
      timestamp: optString(json[KEY_TIMESTAMP]),
      origin: json[KEY_ORIGIN] as MessageOrigin | undefined,
    });
  }

  return events.length > 0 ? events : [systemFallback(ROLE_USER, json)];
}

/** Quota state, from either the top-level event or its `system` twin. */
function parseRateLimitEvent(raw: unknown): StreamRateLimitEvent {
  const info = isRecord(raw) ? raw : {};
  return {
    type: EVENT_RATE_LIMIT,
    status: (info[KEY_STATUS] as StreamRateLimitEvent['status'] | undefined) ?? RATE_LIMIT_ALLOWED,
    resetsAt: optNumber(info[KEY_RESETS_AT]),
    rateLimitType: optString(info[KEY_RATE_LIMIT_TYPE]),
    utilization: optNumber(info[KEY_UTILIZATION]),
    overageStatus: info[KEY_OVERAGE_STATUS] as StreamRateLimitEvent['overageStatus'],
    overageResetsAt: optNumber(info[KEY_OVERAGE_RESETS_AT]),
    overageDisabledReason: optString(info[KEY_OVERAGE_DISABLED_REASON]),
    isUsingOverage: optBoolean(info[KEY_IS_USING_OVERAGE]),
    overageInUse: optBoolean(info[KEY_OVERAGE_IN_USE]),
    data: info,
  };
}

// ── payload mappers ───────────────────────────────────────────────

/** Main-loop token counts, including the cache and server-tool lines. */
function parseUsage(raw: unknown): TokenUsage {
  const usage = isRecord(raw) ? raw : {};
  const serverToolUse = isRecord(usage[KEY_SERVER_TOOL_USE]) ? usage[KEY_SERVER_TOOL_USE] : undefined;

  return {
    inputTokens: numberOr(usage[KEY_INPUT_TOKENS], 0),
    outputTokens: numberOr(usage[KEY_OUTPUT_TOKENS], 0),
    cacheCreationInputTokens: optNumber(usage[KEY_CACHE_CREATION_INPUT_TOKENS]),
    cacheReadInputTokens: optNumber(usage[KEY_CACHE_READ_INPUT_TOKENS]),
    serverToolUse: serverToolUse && {
      webSearchRequests: optNumber(serverToolUse[KEY_WEB_SEARCH_REQUESTS]),
      webFetchRequests: optNumber(serverToolUse[KEY_WEB_FETCH_REQUESTS]),
    },
    serviceTier: usage[KEY_SERVICE_TIER] as TokenUsage['serviceTier'],
  };
}

/**
 * Per-model totals across the whole pipeline — main loop, subagents, compaction.
 * The wire spells the cost field `costUSD`; the library spells it `costUsd`.
 */
function parseModelUsage(raw: unknown): Record<string, ModelUsageEntry> | undefined {
  if (!isRecord(raw)) return undefined;

  const usage: Record<string, ModelUsageEntry> = {};
  for (const [model, entry] of Object.entries(raw)) {
    if (!isRecord(entry)) continue;
    usage[model] = {
      inputTokens: numberOr(entry[KEY_INPUT_TOKENS_CAMEL], 0),
      outputTokens: numberOr(entry[KEY_OUTPUT_TOKENS_CAMEL], 0),
      cacheReadInputTokens: numberOr(entry[KEY_CACHE_READ_TOKENS_CAMEL], 0),
      cacheCreationInputTokens: numberOr(entry[KEY_CACHE_CREATION_TOKENS_CAMEL], 0),
      webSearchRequests: numberOr(entry[KEY_WEB_SEARCH_REQUESTS_CAMEL], 0),
      costUsd: numberOr(entry[KEY_COST_USD], 0),
      contextWindow: numberOr(entry[KEY_CONTEXT_WINDOW], 0),
      maxOutputTokens: numberOr(entry[KEY_MAX_OUTPUT_TOKENS], 0),
      canonicalModel: optString(entry[KEY_CANONICAL_MODEL]),
      provider: optString(entry[KEY_PROVIDER]),
      costBasis: entry[KEY_COST_BASIS] as ModelUsageEntry['costBasis'],
    };
  }
  return usage;
}

/** The authoritative record of tool calls denied during the turn. */
function parsePermissionDenials(raw: unknown): readonly PermissionDenial[] {
  return recordArray(raw).map((denial) => ({
    toolName: String(denial[KEY_TOOL_NAME] ?? ''),
    toolUseId: String(denial[KEY_TOOL_USE_ID] ?? ''),
    toolInput: isRecord(denial[KEY_TOOL_INPUT]) ? denial[KEY_TOOL_INPUT] : {},
  }));
}

/** A tool call handed back to the caller instead of being executed. */
function parseDeferredToolUse(raw: unknown): DeferredToolUse | null | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return null;
  return {
    id: String(raw[KEY_ID] ?? ''),
    name: String(raw[KEY_NAME] ?? ''),
    input: isRecord(raw[KEY_INPUT]) ? raw[KEY_INPUT] : {},
  };
}

/** Structured `/context` report carried on the assistant message wrapper. */
function parseContextUsage(raw: Record<string, unknown>): ContextUsage {
  const overLimit = isRecord(raw[KEY_OVER_LIMIT]) ? raw[KEY_OVER_LIMIT] : undefined;

  return {
    model: String(raw[KEY_MODEL] ?? ''),
    totalTokens: numberOr(raw[KEY_TOTAL_TOKENS], 0),
    rawMaxTokens: numberOr(raw[KEY_RAW_MAX_TOKENS], 0),
    percentage: numberOr(raw[KEY_PERCENTAGE], 0),
    overLimit: overLimit && {
      tokensOver: numberOr(overLimit[KEY_TOKENS_OVER], 0),
      kind: unionOr(overLimit[KEY_KIND], 'hard_limit'),
    },
    categories: recordArray(raw[KEY_CATEGORIES]).map((category) => ({
      name: String(category[KEY_NAME] ?? ''),
      tokens: numberOr(category[KEY_TOKENS], 0),
      kind: optString(category[KEY_KIND]) as ContextUsageCategory['kind'],
    })),
    // `mcp_tools`, `memory_files` and `agents` are required on the wire — an
    // empty list means "nothing contributed", so they are always mapped. Only
    // `skills` is documented as omitted when it would be empty.
    mcpTools: recordArray(raw[KEY_MCP_TOOLS]).map((tool) => ({
      name: String(tool[KEY_NAME] ?? ''),
      serverName: String(tool[KEY_SERVER_NAME] ?? ''),
      tokens: numberOr(tool[KEY_TOKENS], 0),
    })),
    memoryFiles: recordArray(raw[KEY_MEMORY_FILES]).map((file) => ({
      path: String(file[KEY_PATH] ?? ''),
      type: String(file[KEY_TYPE] ?? ''),
      tokens: numberOr(file[KEY_TOKENS], 0),
    })),
    agents: recordArray(raw[KEY_AGENTS]).map((agent) => ({
      agentType: String(agent[KEY_AGENT_TYPE] ?? ''),
      source: String(agent[KEY_SOURCE] ?? ''),
      tokens: numberOr(agent[KEY_TOKENS], 0),
    })),
    skills: Array.isArray(raw[KEY_SKILLS])
      ? recordArray(raw[KEY_SKILLS]).map((skill) => ({
          name: String(skill[KEY_NAME] ?? ''),
          source: String(skill[KEY_SOURCE] ?? ''),
          pluginName: optString(skill[KEY_PLUGIN_NAME]),
          tokens: numberOr(skill[KEY_TOKENS], 0),
        }))
      : undefined,
  };
}

/** Resource counters shared by the task progress and notification messages. */
function parseTaskUsage(raw: unknown): { totalTokens: number; toolUses: number; durationMs: number } {
  const usage = isRecord(raw) ? raw : {};
  return {
    totalTokens: numberOr(usage[KEY_TOTAL_TOKENS], 0),
    toolUses: numberOr(usage[KEY_TOOL_USES], 0),
    durationMs: numberOr(usage[KEY_DURATION], 0),
  };
}

/** API retry happening inside a subagent — reported on the tool progress line. */
function parseSubagentRetry(raw: unknown): {
  readonly agentId: string;
  readonly attempt: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly errorStatus: number | null;
  readonly errorCategory: string;
} | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    agentId: String(raw[KEY_AGENT_ID] ?? ''),
    attempt: numberOr(raw[KEY_ATTEMPT], 0),
    maxRetries: numberOr(raw[KEY_MAX_RETRIES], 0),
    retryDelayMs: numberOr(raw[KEY_RETRY_DELAY_MS], 0),
    errorStatus: optNumber(raw[KEY_ERROR_STATUS]) ?? null,
    errorCategory: String(raw[KEY_ERROR_CATEGORY] ?? ''),
  };
}

function parseSlashCommand(raw: Record<string, unknown>): SlashCommand {
  return {
    name: String(raw[KEY_NAME] ?? ''),
    description: String(raw[KEY_DESCRIPTION] ?? ''),
    argumentHint: String(raw[KEY_ARGUMENT_HINT] ?? ''),
    aliases: raw[KEY_ALIASES] === undefined ? undefined : stringArray(raw[KEY_ALIASES]),
  };
}

// ── utilities ─────────────────────────────────────────────────────

/** Anything the parser does not model reaches the consumer intact. */
function systemFallback(subtype: string, json: Record<string, unknown>): StreamEvent {
  return { type: EVENT_SYSTEM, subtype, data: json };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

/**
 * Narrow a wire value onto a closed union, falling back to the default the SDK
 * executor uses for the same field.
 *
 * Required union fields are the trap here: a raw `as` cast on a missing key
 * leaves `undefined` where the type promises a literal, and every consumer
 * `switch` then falls through. The fallback is type-checked against the field it
 * lands in, so a typo fails the build rather than the caller.
 */
function unionOr<T extends string>(value: unknown, fallback: T): T {
  return typeof value === 'string' ? (value as T) : fallback;
}

function optString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function optBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
