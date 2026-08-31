/**
 * Hook type surface — a faithful mirror of the Agent SDK hook protocol.
 *
 * Three vocabularies live here, and they do not share a naming convention:
 *
 * 1. **Hook inputs** — what the CLI sends *to* a hook. These come straight off
 *    the wire, so every field keeps the SDK's `snake_case` name
 *    (`tool_name`, `hook_event_name`, `old_cwd`).
 * 2. **Hook outputs** — what a hook returns. These are JSON the CLI parses back,
 *    and the protocol spells them `camelCase` (`hookEventName`,
 *    `additionalContext`, `permissionDecision`). The asymmetry is real: do not
 *    "fix" one side to match the other.
 * 3. **Shell-command hook config** ({@link HookEntry} and friends) — the
 *    `settings.json` shape used by CLI mode, where hooks are external processes,
 *    prompts, agents, HTTP endpoints or MCP tools rather than JS callbacks.
 *
 * @example
 * ```ts
 * import type { HookInput, HookJSONOutput } from 'kraube-konnektor'
 *
 * async function audit(input: HookInput): Promise<HookJSONOutput> {
 *   switch (input.hook_event_name) {
 *     case 'PreToolUse':
 *       // narrowed: tool_name / tool_input / tool_use_id are all typed here
 *       return input.tool_name === 'Bash'
 *         ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' } }
 *         : { continue: true }
 *     case 'FileChanged':
 *       return { hookSpecificOutput: { hookEventName: 'FileChanged', watchPaths: [input.file_path] } }
 *     default:
 *       return { continue: true }
 *   }
 * }
 * ```
 */

import type {
  HOOK_PRE_TOOL_USE,
  HOOK_POST_TOOL_USE,
  HOOK_POST_TOOL_USE_FAILURE,
  HOOK_POST_TOOL_BATCH,
  HOOK_NOTIFICATION,
  HOOK_USER_PROMPT_SUBMIT,
  HOOK_USER_PROMPT_EXPANSION,
  HOOK_SESSION_START,
  HOOK_SESSION_END,
  HOOK_STOP,
  HOOK_STOP_FAILURE,
  HOOK_SUBAGENT_START,
  HOOK_SUBAGENT_STOP,
  HOOK_PRE_COMPACT,
  HOOK_POST_COMPACT,
  HOOK_PRE_MODEL_SWITCH,
  HOOK_POST_MODEL_SWITCH,
  HOOK_PERMISSION_REQUEST,
  HOOK_PERMISSION_DENIED,
  HOOK_SETUP,
  HOOK_TEAMMATE_IDLE,
  HOOK_TASK_CREATED,
  HOOK_TASK_COMPLETED,
  HOOK_ELICITATION,
  HOOK_ELICITATION_RESULT,
  HOOK_CONFIG_CHANGE,
  HOOK_WORKTREE_CREATE,
  HOOK_WORKTREE_REMOVE,
  HOOK_INSTRUCTIONS_LOADED,
  HOOK_CWD_CHANGED,
  HOOK_FILE_CHANGED,
  HOOK_DIRECTORY_ADDED,
  HOOK_MESSAGE_DISPLAY,
  VALID_HOOK_EVENTS,
} from '../constants.js';
import type { PermissionUpdate } from './client.js';

// ── Hook events ───────────────────────────────────────────────────

/**
 * Every lifecycle event a hook can subscribe to (33 in SDK 0.3.x).
 *
 * Derived from `VALID_HOOK_EVENTS` in `src/constants.ts`, which is the single
 * source of truth for the event vocabulary.
 */
export type HookEvent = (typeof VALID_HOOK_EVENTS)[number];

/**
 * Verdict a `PreToolUse` hook can return for a tool call.
 *
 * `'allow'` skips the permission prompt, `'deny'` blocks the call, `'ask'`
 * forces the interactive prompt, and `'defer'` hands the decision back to the
 * normal permission pipeline (rules, then `canUseTool`, then the user).
 */
export type HookPermissionDecision = 'allow' | 'deny' | 'ask' | 'defer';

// ── Supporting types ──────────────────────────────────────────────

/**
 * In-flight background work reported to `Stop` / `SubagentStop` hooks.
 *
 * Lets a stop hook tell "the session is finished" from "the session is parked
 * waiting on background work that will wake it again".
 */
export interface BackgroundTaskSummary {
  /** Task identifier. */
  readonly id: string;

  /**
   * Friendly task-type label (e.g. `'shell'`, `'subagent'`, `'monitor'`,
   * `'workflow'`). Falls back to the raw discriminant for unknown types.
   */
  readonly type: string;

  /** Current task status. */
  readonly status: string;

  /**
   * Free-text description. Capped at 1000 chars; clipped values append an
   * in-string `"… [+N chars]"` marker.
   */
  readonly description: string;

  /** Shell command line. Only present for `'shell'` tasks, capped like `description`. */
  readonly command?: string;

  /** Subagent type name. Only present for `'subagent'` tasks. */
  readonly agent_type?: string;

  /** MCP server name. Only present for `'monitor'` / MCP tasks. */
  readonly server?: string;

  /** MCP tool name. Only present for `'monitor'` / MCP tasks. */
  readonly tool?: string;

  /** Workflow name. Only present for `'workflow'` tasks. */
  readonly name?: string;
}

/**
 * A session-scoped cron task (`CronCreate`, `ScheduleWakeup`, `/loop`) that will
 * wake the session later. Reported to `Stop` / `SubagentStop` hooks.
 */
export interface SessionCronSummary {
  /** Cron task identifier. */
  readonly id: string;

  /** Cron expression, e.g. `"0 9 * * 1-5"`. */
  readonly schedule: string;

  /**
   * `false` for one-shot wakeups whose cron field encodes a single fire time;
   * `true` for tasks that re-fire on every match.
   */
  readonly recurring: boolean;

  /**
   * Prompt text submitted when the cron fires. Capped at 1000 chars; clipped
   * values append an in-string `"… [+N chars]"` marker.
   */
  readonly prompt: string;
}

/** Why an assistant turn failed. Carried by {@link StopFailureHookInput}. */
export type SDKAssistantMessageError =
  | 'authentication_failed'
  | 'oauth_org_not_allowed'
  | 'account_on_hold'
  | 'billing_error'
  | 'rate_limit'
  | 'overloaded'
  | 'invalid_request'
  | 'model_not_found'
  | 'server_error'
  | 'unknown'
  | 'max_output_tokens';

/** Why a session ended. Carried by {@link SessionEndHookInput}. */
export type ExitReason = 'clear' | 'resume' | 'logout' | 'prompt_input_exit' | 'other';

/** One tool call inside a resolved batch, as reported to `PostToolBatch`. */
export interface PostToolBatchToolCall {
  /** Tool that was invoked (e.g. `'Read'`, `'Bash'`). */
  readonly tool_name: string;

  /** Raw tool input, shaped by the tool's own schema. */
  readonly tool_input: unknown;

  /** Correlation id shared with the matching `PreToolUse` / `PostToolUse` events. */
  readonly tool_use_id: string;

  /** Tool result. Absent when the call failed. */
  readonly tool_response?: unknown;
}

// ── Hook input: shared base ───────────────────────────────────────

/**
 * Fields present on every hook input, whatever the event.
 *
 * All names are the SDK's wire names — `snake_case`, not the library's usual
 * `camelCase` — because these objects are parsed verbatim from the CLI.
 */
export interface BaseHookInput {
  /** Session the hook fired in. */
  readonly session_id: string;

  /** Absolute path to the session transcript (JSONL). */
  readonly transcript_path: string;

  /** Working directory of the session. */
  readonly cwd: string;

  /**
   * UUID correlating a user prompt with every subsequent event until the next
   * prompt. Emitted on OpenTelemetry events as the `prompt.id` attribute, so
   * hook output can be joined to OTel data at prompt grain. Absent until the
   * first user input of the process lifetime.
   */
  readonly prompt_id?: string;

  /** Permission mode in force when the hook fired. */
  readonly permission_mode?: string;

  /**
   * Subagent identifier. Present only when the hook fires from inside a subagent
   * (e.g. a tool called by an AgentTool worker); absent on the main thread, even
   * in `--agent` sessions. Use this field — not `agent_type` — to tell subagent
   * calls from main-thread calls.
   */
  readonly agent_id?: string;

  /**
   * Agent type name (e.g. `"general-purpose"`, `"code-reviewer"`). Present when
   * the hook fires inside a subagent (alongside `agent_id`), or on the main
   * thread of a session started with `--agent` (without `agent_id`).
   */
  readonly agent_type?: string;

  /**
   * Reasoning effort applied to the current turn. Present for hooks that fire
   * within a tool-use context (`PreToolUse`, `PostToolUse`, `Stop`,
   * `SubagentStop`, …) on a model that supports effort; absent for
   * session-lifecycle hooks and models without effort support.
   */
  readonly effort?: {
    /**
     * Active effort level for the turn (`"low"` … `"max"`), after any silent
     * downgrade for the selected model. Also exposed to hook commands and Bash
     * as the `CLAUDE_EFFORT` environment variable.
     */
    readonly level: string;
  };
}

/**
 * Permissive escape hatch for hook payloads this version does not model yet.
 *
 * Deliberately **not** a member of {@link HookInput}: an index signature there
 * would defeat `switch (input.hook_event_name)` narrowing. Cast to this type
 * when you need to read a field from an event newer than the library.
 *
 * @example
 * ```ts
 * const raw = input as unknown as UnknownHookInput
 * const extra = raw['some_future_field']
 * ```
 */
export type UnknownHookInput = BaseHookInput & {
  /** Event name, unconstrained — may be an event this version predates. */
  readonly hook_event_name: string;

  /** Any other field the CLI sent. */
  readonly [key: string]: unknown;
};

// ── Hook inputs (per event) ───────────────────────────────────────

/** Fires before a tool runs, while the call can still be blocked or rewritten. */
export interface PreToolUseHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_PRE_TOOL_USE;

  /** Tool about to be invoked (e.g. `'Read'`, `'Bash'`). */
  readonly tool_name: string;

  /** Raw tool input, shaped by the tool's own schema. */
  readonly tool_input: unknown;

  /** Correlation id shared with the matching `PostToolUse` event. */
  readonly tool_use_id: string;
}

/** Fires after a tool succeeds, while its output can still be rewritten. */
export interface PostToolUseHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_POST_TOOL_USE;

  /** Tool that was invoked. */
  readonly tool_name: string;

  /** Raw tool input, shaped by the tool's own schema. */
  readonly tool_input: unknown;

  /** Tool result, about to be handed to the model. */
  readonly tool_response: unknown;

  /** Correlation id shared with the matching `PreToolUse` event. */
  readonly tool_use_id: string;

  /** Tool execution time in milliseconds. Excludes permission-prompt and hook time. */
  readonly duration_ms?: number;
}

/** Fires after a tool fails or is interrupted. */
export interface PostToolUseFailureHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_POST_TOOL_USE_FAILURE;

  /** Tool that was invoked. */
  readonly tool_name: string;

  /** Raw tool input, shaped by the tool's own schema. */
  readonly tool_input: unknown;

  /** Correlation id shared with the matching `PreToolUse` event. */
  readonly tool_use_id: string;

  /** Error message as the model will see it. */
  readonly error: string;

  /** `true` when the failure was a user interrupt rather than a tool error. */
  readonly is_interrupt?: boolean;

  /** Tool execution time in milliseconds. Excludes permission-prompt and hook time. */
  readonly duration_ms?: number;
}

/**
 * Fires once after every tool call in a batch has resolved, before the next
 * model request.
 *
 * `PostToolUse` fires per tool and may run concurrently for parallel calls;
 * `PostToolBatch` fires exactly once with the whole batch, which makes it the
 * only way to observe a batch atomically.
 */
export interface PostToolBatchHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_POST_TOOL_BATCH;

  /** Every call in the batch, in dispatch order. */
  readonly tool_calls: readonly PostToolBatchToolCall[];
}

/** Fires when a tool call is denied, before the denial reaches the model. */
export interface PermissionDeniedHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_PERMISSION_DENIED;

  /** Tool that was denied. */
  readonly tool_name: string;

  /** Raw tool input, shaped by the tool's own schema. */
  readonly tool_input: unknown;

  /** Correlation id of the denied call. */
  readonly tool_use_id: string;

  /** Why the call was denied. */
  readonly reason: string;
}

/** Fires when the CLI wants to notify the user (idle prompt, permission needed, …). */
export interface NotificationHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_NOTIFICATION;

  /** Notification body. */
  readonly message: string;

  /** Notification title, when the CLI supplies one. */
  readonly title?: string;

  /** CLI-defined notification kind. */
  readonly notification_type: string;
}

/** Fires when a prompt is submitted, before the model sees it. */
export interface UserPromptSubmitHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_USER_PROMPT_SUBMIT;

  /** The submitted prompt text. */
  readonly prompt: string;

  /**
   * Who authored or injected the prompt: `'user'` = interactive composer,
   * `'sdk'` = non-interactive entrypoint (`-p` / Agent SDK — what this library
   * produces), `'loop_wakeup'` = dynamic `/loop` wakeup, `'schedule_wakeup'` =
   * scheduled-task fire, `'system'` = other machine-injected turns,
   * `'poll_event'` = the poll-event channel enqueue-time pass. Payloads may omit
   * it while the field rolls out.
   */
  readonly source?: 'user' | 'sdk' | 'system' | 'loop_wakeup' | 'schedule_wakeup' | 'poll_event';

  /** Current session title, when one is set. */
  readonly session_title?: string;
}

/**
 * Fires when a slash command or MCP prompt is expanded into a prompt.
 *
 * This is the interception point `UserPromptSubmit` does not cover.
 */
export interface UserPromptExpansionHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_USER_PROMPT_EXPANSION;

  /** What is being expanded. */
  readonly expansion_type: 'slash_command' | 'mcp_prompt';

  /** Command name, without the leading slash. */
  readonly command_name: string;

  /** Raw argument string passed to the command. */
  readonly command_args: string;

  /** Where the command came from (plugin, project, user, MCP server). */
  readonly command_source?: string;

  /** The expanded prompt text. */
  readonly prompt: string;
}

/** Fires when a session starts, resumes, forks, or restarts after a compaction. */
export interface SessionStartHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_SESSION_START;

  /** What started the session. */
  readonly source: 'startup' | 'resume' | 'clear' | 'compact' | 'fork';

  /** Agent type for `--agent` sessions. */
  readonly agent_type?: string;

  /** Resolved model id the session starts on. */
  readonly model?: string;

  /** Session title, when one is already set (resume/fork). */
  readonly session_title?: string;

  /** resume/fork: seconds since the resumed transcript's last assistant response. */
  readonly seconds_since_last_response?: number;

  /**
   * resume/fork: the resumed transcript's last response input + cache_read +
   * cache_creation + output tokens.
   */
  readonly context_tokens?: number;

  /**
   * resume/fork: `seconds_since_last_response` exceeds the prompt-cache TTL, so
   * the first request re-caches `context_tokens`.
   */
  readonly prompt_cache_likely_expired?: boolean;

  /**
   * resume/fork: estimated cost of re-caching `context_tokens` on the session
   * model — the managed `modelPricing` when set, otherwise list price. Excludes
   * the response.
   */
  readonly estimated_cache_write_usd?: number;
}

/** Fires when a session ends. */
export interface SessionEndHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_SESSION_END;

  /** Why the session ended. */
  readonly reason: ExitReason;
}

/** Fires when the main loop is about to stop, while the turn can still continue. */
export interface StopHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_STOP;

  /** `true` when a stop hook already forced the turn to continue once. */
  readonly stop_hook_active: boolean;

  /**
   * Text of the last assistant message before stopping — saves reading and
   * parsing the transcript file.
   */
  readonly last_assistant_message?: string;

  /**
   * In-flight background work (running/pending + backgrounded) registered in
   * this session. Empty when nothing is in flight.
   */
  readonly background_tasks?: readonly BackgroundTaskSummary[];

  /** Session-scoped crons that will wake this session later. Empty when none. */
  readonly session_crons?: readonly SessionCronSummary[];
}

/** Fires when a turn ends in an error instead of a normal stop. */
export interface StopFailureHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_STOP_FAILURE;

  /** Error class that ended the turn. */
  readonly error: SDKAssistantMessageError;

  /** Provider or CLI error detail, when available. */
  readonly error_details?: string;

  /** Text of the last assistant message before the failure. */
  readonly last_assistant_message?: string;
}

/** Fires when a subagent starts. */
export interface SubagentStartHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_SUBAGENT_START;

  /** Identifier of the subagent being started. */
  readonly agent_id: string;

  /** Subagent type name (e.g. `"code-reviewer"`). */
  readonly agent_type: string;
}

/** Fires when a subagent is about to stop, while it can still be continued. */
export interface SubagentStopHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_SUBAGENT_STOP;

  /** `true` when a stop hook already forced this subagent to continue once. */
  readonly stop_hook_active: boolean;

  /** Identifier of the stopping subagent. */
  readonly agent_id: string;

  /** Absolute path to the subagent's own transcript. */
  readonly agent_transcript_path: string;

  /** Subagent type name. */
  readonly agent_type: string;

  /** Text of the subagent's last assistant message before stopping. */
  readonly last_assistant_message?: string;

  /**
   * In-flight background work (running/pending + backgrounded) registered in
   * this session. Empty when nothing is in flight.
   */
  readonly background_tasks?: readonly BackgroundTaskSummary[];

  /** Session-scoped crons that will wake this session later. Empty when none. */
  readonly session_crons?: readonly SessionCronSummary[];
}

/** Fires before the conversation is compacted. */
export interface PreCompactHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_PRE_COMPACT;

  /** `'manual'` for `/compact`, `'auto'` when the context window filled up. */
  readonly trigger: 'manual' | 'auto';

  /** Custom instructions passed to `/compact`, or `null`. */
  readonly custom_instructions: string | null;
}

/** Fires after the conversation has been compacted. */
export interface PostCompactHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_POST_COMPACT;

  /** `'manual'` for `/compact`, `'auto'` when the context window filled up. */
  readonly trigger: 'manual' | 'auto';

  /** The conversation summary produced by compaction. */
  readonly compact_summary: string;
}

/**
 * Fires before the session model changes — the only hook that can veto a switch.
 *
 * Its `source` union is narrower than {@link PostModelSwitchHookInput}'s: a
 * pre-switch hook never sees `'auto'` or `'resume'`.
 */
export interface PreModelSwitchHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_PRE_MODEL_SWITCH;

  /** Resolved model id the session was running before the switch. */
  readonly from_model: string;

  /** Resolved model id the session would run after the switch. */
  readonly to_model: string;

  /** What was asked for: an alias such as `"opus"`, a full id, or `null` for "default". */
  readonly requested_model: string | null;

  /**
   * `'command'` = `/model <name>`, the `/config` model row, or fast mode
   * promoting the model; `'picker'` = interactive model picker; `'sdk'` =
   * headless `set_model` (SDK, Remote Control, IDE).
   */
  readonly source: 'command' | 'picker' | 'sdk';

  /**
   * Prompt tokens the next request re-sends: the last main-thread response's
   * input + cache_read + cache_creation + output tokens (`0` before the first
   * response).
   */
  readonly context_tokens: number;

  /** Whether the current model's prompt cache is likely still warm — a switch forfeits it. */
  readonly prompt_cache_warm: boolean;

  /** TTL of the prompt cache being forfeited. */
  readonly cache_ttl: '5m' | '1h';

  /**
   * Estimated cost of re-caching `context_tokens` on `to_model` at its
   * cache-write rate — the managed `modelPricing` when set, otherwise list
   * price. Excludes the response.
   */
  readonly estimated_cache_write_usd: number;

  /**
   * `'configured'` = priced at the managed `modelPricing` setting;
   * `'catalog'` = list price; `'default'` = `to_model` unknown, default tier assumed.
   */
  readonly pricing: 'configured' | 'catalog' | 'default';
}

/** Fires after the session model has changed. */
export interface PostModelSwitchHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_POST_MODEL_SWITCH;

  /** Resolved model id the session was running before the switch. */
  readonly from_model: string;

  /** Resolved model id the session runs after the switch. */
  readonly to_model: string;

  /** What was asked for: an alias such as `"opus"`, a full id, or `null` for "default". */
  readonly requested_model: string | null;

  /**
   * As {@link PreModelSwitchHookInput.source}, plus `'auto'` (automatic fallback
   * or other programmatic change) and `'resume'` (model restored while resuming
   * a session).
   */
  readonly source: 'command' | 'picker' | 'sdk' | 'auto' | 'resume';

  /**
   * Prompt tokens the next request re-sends: the last main-thread response's
   * input + cache_read + cache_creation + output tokens (`0` before the first
   * response).
   */
  readonly context_tokens: number;

  /** Whether the previous model's prompt cache was likely still warm. */
  readonly prompt_cache_warm: boolean;

  /** TTL of the prompt cache that was forfeited. */
  readonly cache_ttl: '5m' | '1h';

  /**
   * Estimated cost of re-caching `context_tokens` on `to_model` at its
   * cache-write rate — the managed `modelPricing` when set, otherwise list
   * price. Excludes the response.
   */
  readonly estimated_cache_write_usd: number;

  /**
   * `'configured'` = priced at the managed `modelPricing` setting;
   * `'catalog'` = list price; `'default'` = `to_model` unknown, default tier assumed.
   */
  readonly pricing: 'configured' | 'catalog' | 'default';
}

/**
 * Fires when a tool needs a permission decision — the hook-side twin of
 * `canUseTool`.
 */
export interface PermissionRequestHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_PERMISSION_REQUEST;

  /** Tool awaiting a decision. */
  readonly tool_name: string;

  /** Raw tool input, shaped by the tool's own schema. */
  readonly tool_input: unknown;

  /** Permission updates the CLI would offer the user (e.g. "always allow"). */
  readonly permission_suggestions?: readonly PermissionUpdate[];
}

/** Fires on project setup — `claude init` and periodic maintenance passes. */
export interface SetupHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_SETUP;

  /** `'init'` for first-time setup, `'maintenance'` for a recurring pass. */
  readonly trigger: 'init' | 'maintenance';
}

/** Fires when a teammate session goes idle. */
export interface TeammateIdleHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_TEAMMATE_IDLE;

  /** Name of the idle teammate. */
  readonly teammate_name: string;

  /**
   * Session-derived team name.
   *
   * @deprecated Sessions have a single implicit team; this field will be removed
   * in a future SDK release.
   */
  readonly team_name: string;
}

/** Fires when a task is created on the session's task board. */
export interface TaskCreatedHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_TASK_CREATED;

  /** Task identifier. */
  readonly task_id: string;

  /** One-line task subject. */
  readonly task_subject: string;

  /** Longer task description, when one was given. */
  readonly task_description?: string;

  /** Teammate the task is assigned to. */
  readonly teammate_name?: string;

  /**
   * Session-derived team name.
   *
   * @deprecated Sessions have a single implicit team; this field will be removed
   * in a future SDK release.
   */
  readonly team_name?: string;
}

/** Fires when a task on the session's task board is completed. */
export interface TaskCompletedHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_TASK_COMPLETED;

  /** Task identifier. */
  readonly task_id: string;

  /** One-line task subject. */
  readonly task_subject: string;

  /** Longer task description, when one was given. */
  readonly task_description?: string;

  /** Teammate that completed the task. */
  readonly teammate_name?: string;

  /**
   * Session-derived team name.
   *
   * @deprecated Sessions have a single implicit team; this field will be removed
   * in a future SDK release.
   */
  readonly team_name?: string;
}

/**
 * Fires when an MCP server asks for user input, before the dialog is shown.
 *
 * Field names are the wire `snake_case` ones and are **not** interchangeable
 * with the camelCase `ElicitationRequest` used by the `onElicitation` callback.
 */
export interface ElicitationHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_ELICITATION;

  /** MCP server requesting input. */
  readonly mcp_server_name: string;

  /** Message to show the user. */
  readonly message: string;

  /** `'form'` for structured input, `'url'` for browser-based auth. */
  readonly mode?: 'form' | 'url';

  /** URL to open (`'url'` mode only). */
  readonly url?: string;

  /** Correlation id for URL elicitations. */
  readonly elicitation_id?: string;

  /** JSON Schema for the requested input (`'form'` mode only). */
  readonly requested_schema?: Readonly<Record<string, unknown>>;
}

/**
 * Fires after the user responds to an MCP elicitation, before the response is
 * sent back to the server.
 */
export interface ElicitationResultHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_ELICITATION_RESULT;

  /** MCP server the response is headed to. */
  readonly mcp_server_name: string;

  /** Correlation id for URL elicitations. */
  readonly elicitation_id?: string;

  /** `'form'` for structured input, `'url'` for browser-based auth. */
  readonly mode?: 'form' | 'url';

  /** What the user chose. */
  readonly action: 'accept' | 'decline' | 'cancel';

  /** Collected form values, for `'accept'`. */
  readonly content?: Readonly<Record<string, unknown>>;
}

/** Fires when a settings file or skill directory changes on disk. */
export interface ConfigChangeHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_CONFIG_CHANGE;

  /** Which settings layer changed. */
  readonly source:
    | 'user_settings'
    | 'project_settings'
    | 'local_settings'
    | 'policy_settings'
    | 'skills';

  /** Absolute path of the file that changed, when the change came from a file. */
  readonly file_path?: string;
}

/** Fires for each CLAUDE.md-style instruction file loaded into context. */
export interface InstructionsLoadedHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_INSTRUCTIONS_LOADED;

  /** Absolute path of the loaded file. */
  readonly file_path: string;

  /** Which memory tier the file belongs to. */
  readonly memory_type: 'User' | 'Project' | 'Local' | 'Managed';

  /** Why the file was loaded. */
  readonly load_reason:
    | 'session_start'
    | 'nested_traversal'
    | 'path_glob_match'
    | 'include'
    | 'compact';

  /** Globs that matched, for `'path_glob_match'`. */
  readonly globs?: readonly string[];

  /** File whose path triggered the glob match. */
  readonly trigger_file_path?: string;

  /** File that `@`-included this one, for `'include'`. */
  readonly parent_file_path?: string;
}

/** Fires when a git worktree is created. */
export interface WorktreeCreateHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_WORKTREE_CREATE;

  /** Requested worktree name. */
  readonly name: string;
}

/** Fires when a git worktree is removed. */
export interface WorktreeRemoveHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_WORKTREE_REMOVE;

  /** Absolute path of the removed worktree. */
  readonly worktree_path: string;
}

/** Fires when the session's working directory changes. */
export interface CwdChangedHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_CWD_CHANGED;

  /** Directory the session was in. */
  readonly old_cwd: string;

  /** Directory the session moved to. */
  readonly new_cwd: string;
}

/** Fires when a watched file changes on disk. */
export interface FileChangedHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_FILE_CHANGED;

  /** Absolute path of the file. */
  readonly file_path: string;

  /** What happened to it. The wire name is `event`, not `event_type`. */
  readonly event: 'change' | 'add' | 'unlink';
}

/** Fires when a directory is added to the session's workspace. */
export interface DirectoryAddedHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_DIRECTORY_ADDED;

  /** Absolute path of the directory that was added. */
  readonly directory: string;

  /** `'slash_command'` for `/add-dir`, `'register_repo_root'` for the SDK control request. */
  readonly source: 'slash_command' | 'register_repo_root';
}

/**
 * Fires with each batch of newly completed lines while an assistant message
 * streams.
 *
 * Display-only: the stored message and what the model sees are untouched, which
 * makes this the rewrite channel that pairs with `StreamTextEvent`.
 */
export interface MessageDisplayHookInput extends BaseHookInput {
  readonly hook_event_name: typeof HOOK_MESSAGE_DISPLAY;

  /** UUID of the current turn. */
  readonly turn_id: string;

  /**
   * UUID of the assistant message being displayed. Stable across every flush of
   * the same message — not the API `msg_…` id.
   */
  readonly message_id: string;

  /** Zero-based index of this delta within the message. Increments once per flush. */
  readonly index: number;

  /** `true` on the message's last flush. Exactly one flush per message has it. */
  readonly final: boolean;

  /**
   * Newly completed lines since the previous flush. Always whole lines, except
   * on the final flush, which may end mid-line and is empty when the message
   * ends on a newline — treat `final` as the end-of-message signal regardless.
   */
  readonly delta: string;
}

// ── HookInput union ───────────────────────────────────────────────

/**
 * Everything the CLI can send to a hook, as a discriminated union on
 * `hook_event_name`.
 *
 * @example
 * ```ts
 * function describe(input: HookInput): string {
 *   switch (input.hook_event_name) {
 *     case 'PreToolUse':
 *       return `about to run ${input.tool_name}`
 *     case 'SessionEnd':
 *       return `session ended: ${input.reason}`
 *     case 'MessageDisplay':
 *       return input.final ? 'message complete' : input.delta
 *     default:
 *       return input.hook_event_name
 *   }
 * }
 * ```
 */
export type HookInput =
  | PreToolUseHookInput
  | PostToolUseHookInput
  | PostToolUseFailureHookInput
  | PostToolBatchHookInput
  | PermissionDeniedHookInput
  | NotificationHookInput
  | UserPromptSubmitHookInput
  | UserPromptExpansionHookInput
  | SessionStartHookInput
  | SessionEndHookInput
  | StopHookInput
  | StopFailureHookInput
  | SubagentStartHookInput
  | SubagentStopHookInput
  | PreCompactHookInput
  | PostCompactHookInput
  | PreModelSwitchHookInput
  | PostModelSwitchHookInput
  | PermissionRequestHookInput
  | SetupHookInput
  | TeammateIdleHookInput
  | TaskCreatedHookInput
  | TaskCompletedHookInput
  | ElicitationHookInput
  | ElicitationResultHookInput
  | ConfigChangeHookInput
  | InstructionsLoadedHookInput
  | WorktreeCreateHookInput
  | WorktreeRemoveHookInput
  | CwdChangedHookInput
  | FileChangedHookInput
  | DirectoryAddedHookInput
  | MessageDisplayHookInput;

// ── Hook-specific outputs (per event) ─────────────────────────────

/**
 * `PreToolUse` result: decide the call, rewrite its input, or add context.
 *
 * Field names here are camelCase — hook *inputs* are snake_case, hook *outputs*
 * are camelCase, and that asymmetry is part of the protocol.
 */
export interface PreToolUseHookSpecificOutput {
  readonly hookEventName: typeof HOOK_PRE_TOOL_USE;

  /** Verdict for the call. Omit to leave the decision to the normal pipeline. */
  readonly permissionDecision?: HookPermissionDecision;

  /** Reason shown to the user and the model alongside the decision. */
  readonly permissionDecisionReason?: string;

  /** Replaces the tool input before the tool runs. */
  readonly updatedInput?: Readonly<Record<string, unknown>>;

  /** Extra context handed to the model with this tool call. */
  readonly additionalContext?: string;
}

/** `UserPromptSubmit` result: augment, retitle, or replace the submitted prompt. */
export interface UserPromptSubmitHookSpecificOutput {
  readonly hookEventName: typeof HOOK_USER_PROMPT_SUBMIT;

  /** Extra context prepended to the prompt the model sees. */
  readonly additionalContext?: string;

  /** Sets the session title. */
  readonly sessionTitle?: string;

  /** When `decision` is `'block'`, omit the original prompt from the block message. */
  readonly suppressOriginalPrompt?: boolean;
}

/** `UserPromptExpansion` result: augment or suppress an expanded command prompt. */
export interface UserPromptExpansionHookSpecificOutput {
  readonly hookEventName: typeof HOOK_USER_PROMPT_EXPANSION;

  /** Extra context prepended to the expanded prompt. */
  readonly additionalContext?: string;

  /** When `decision` is `'block'`, omit the original prompt from the block message. */
  readonly suppressOriginalPrompt?: boolean;
}

/** `SessionStart` result: seed the session with context, a title, or a first turn. */
export interface SessionStartHookSpecificOutput {
  readonly hookEventName: typeof HOOK_SESSION_START;

  /** Extra context added to the session before the first turn. */
  readonly additionalContext?: string;

  /** Submits this prompt as the session's first user message. */
  readonly initialUserMessage?: string;

  /** Sets the session title. */
  readonly sessionTitle?: string;

  /** Paths to watch for `FileChanged` events. */
  readonly watchPaths?: readonly string[];

  /**
   * Re-scan skill and command directories after `SessionStart` hooks complete,
   * so skills installed by the hook are usable in the same session.
   */
  readonly reloadSkills?: boolean;
}

/** `Setup` result: add context to the setup pass. */
export interface SetupHookSpecificOutput {
  readonly hookEventName: typeof HOOK_SETUP;

  /** Extra context handed to the model. */
  readonly additionalContext?: string;
}

/** `PreModelSwitch` result: allow, deny, or confirm the model switch. */
export interface PreModelSwitchHookSpecificOutput {
  readonly hookEventName: typeof HOOK_PRE_MODEL_SWITCH;

  /**
   * Same contract as `PreToolUse`: `'allow'` proceeds (skipping the interactive
   * cache-miss confirmation), `'deny'` cancels the switch, `'ask'` asks the user
   * to confirm (a headless session refuses instead).
   *
   * Deliberately narrower than {@link HookPermissionDecision} — there is no
   * `'defer'` for a model switch.
   */
  readonly permissionDecision?: 'allow' | 'deny' | 'ask';

  /** Reason shown alongside the decision. */
  readonly permissionDecisionReason?: string;
}

/** `PostModelSwitch` result: add context for the new model. */
export interface PostModelSwitchHookSpecificOutput {
  readonly hookEventName: typeof HOOK_POST_MODEL_SWITCH;

  /** Reaches the model with the first request the new model serves. */
  readonly additionalContext?: string;
}

/** `SubagentStart` result: add context to the starting subagent. */
export interface SubagentStartHookSpecificOutput {
  readonly hookEventName: typeof HOOK_SUBAGENT_START;

  /** Extra context handed to the subagent. */
  readonly additionalContext?: string;
}

/** `PostToolUse` result: rewrite the tool output or add context. */
export interface PostToolUseHookSpecificOutput {
  readonly hookEventName: typeof HOOK_POST_TOOL_USE;

  /** Extra context handed to the model with this tool result. */
  readonly additionalContext?: string;

  /**
   * Host-asserted context shown to the auto-mode permission classifier alongside
   * this tool result. Put only genuine user statements here — content placed in
   * this field reaches the classifier with host-application framing, so never
   * relay tool output or model text through it. Capped at 2000 UTF-16 code units
   * shared across all hooks contributing to one call, and honored on synchronous
   * hook responses only.
   */
  readonly classifierContext?: string;

  /** Replaces the tool output before it is sent to the model. */
  readonly updatedToolOutput?: unknown;

  /**
   * Replaces the output for MCP tools only. Prefer
   * {@link PostToolUseHookSpecificOutput.updatedToolOutput}, which works for all
   * tools.
   */
  readonly updatedMCPToolOutput?: unknown;
}

/** `PostToolUseFailure` result: add context to a failed tool call. */
export interface PostToolUseFailureHookSpecificOutput {
  readonly hookEventName: typeof HOOK_POST_TOOL_USE_FAILURE;

  /** Extra context handed to the model with the failure. */
  readonly additionalContext?: string;
}

/** `PostToolBatch` result: add context after a whole tool batch resolves. */
export interface PostToolBatchHookSpecificOutput {
  readonly hookEventName: typeof HOOK_POST_TOOL_BATCH;

  /** Extra context handed to the model before the next request. */
  readonly additionalContext?: string;
}

/**
 * `Stop` result: non-error feedback that keeps the turn going.
 *
 * The conversation continues so the model can act on `additionalContext` —
 * unlike `decision: 'block'`, which reads as an error.
 */
export interface StopHookSpecificOutput {
  readonly hookEventName: typeof HOOK_STOP;

  /** Feedback delivered to the model; the turn continues. */
  readonly additionalContext?: string;
}

/** `SubagentStop` result: non-error feedback that keeps the subagent going. */
export interface SubagentStopHookSpecificOutput {
  readonly hookEventName: typeof HOOK_SUBAGENT_STOP;

  /** Feedback delivered to the subagent; it continues so it can act on this. */
  readonly additionalContext?: string;
}

/** `PermissionDenied` result: optionally re-drive the denied tool call. */
export interface PermissionDeniedHookSpecificOutput {
  readonly hookEventName: typeof HOOK_PERMISSION_DENIED;

  /** Retry the denied call instead of reporting the denial to the model. */
  readonly retry?: boolean;
}

/** `Notification` result: add context to a notification. */
export interface NotificationHookSpecificOutput {
  readonly hookEventName: typeof HOOK_NOTIFICATION;

  /** Extra context handed to the model. */
  readonly additionalContext?: string;
}

/**
 * `PermissionRequest` result: answer the permission prompt from the hook.
 *
 * The `decision` object mirrors `PermissionResult`, so an allow branch may also
 * rewrite the tool input and persist permission rules.
 */
export interface PermissionRequestHookSpecificOutput {
  readonly hookEventName: typeof HOOK_PERMISSION_REQUEST;

  /** Verdict for the pending tool call. */
  readonly decision:
    | {
        readonly behavior: 'allow';

        /** Replaces the tool input before the tool runs. */
        readonly updatedInput?: Readonly<Record<string, unknown>>;

        /** Permission rules to persist alongside the decision. */
        readonly updatedPermissions?: readonly PermissionUpdate[];
      }
    | {
        readonly behavior: 'deny';

        /** Reason shown to the user and the model. */
        readonly message?: string;

        /** Interrupt the turn instead of returning the denial to the model. */
        readonly interrupt?: boolean;
      };
}

/** `Elicitation` result: answer an MCP elicitation without showing the dialog. */
export interface ElicitationHookSpecificOutput {
  readonly hookEventName: typeof HOOK_ELICITATION;

  /** Response on the user's behalf. */
  readonly action?: 'accept' | 'decline' | 'cancel';

  /** Form values to send, for `'accept'`. */
  readonly content?: Readonly<Record<string, unknown>>;
}

/** `ElicitationResult` result: override the response before it reaches the server. */
export interface ElicitationResultHookSpecificOutput {
  readonly hookEventName: typeof HOOK_ELICITATION_RESULT;

  /** Replaces the user's action. */
  readonly action?: 'accept' | 'decline' | 'cancel';

  /** Replaces the form values sent to the MCP server. */
  readonly content?: Readonly<Record<string, unknown>>;
}

/** `CwdChanged` result: re-arm the file watcher for the new directory. */
export interface CwdChangedHookSpecificOutput {
  readonly hookEventName: typeof HOOK_CWD_CHANGED;

  /** Paths to watch for `FileChanged` events from now on. */
  readonly watchPaths?: readonly string[];
}

/** `FileChanged` result: adjust the set of watched paths. */
export interface FileChangedHookSpecificOutput {
  readonly hookEventName: typeof HOOK_FILE_CHANGED;

  /** Paths to watch for `FileChanged` events from now on. */
  readonly watchPaths?: readonly string[];
}

/**
 * `WorktreeCreate` result: report where the worktree was created.
 *
 * `worktreePath` is the only required field in the whole
 * {@link HookSpecificOutput} union — a hook returning this variant must supply
 * it. Command hooks print the path on stdout instead.
 */
export interface WorktreeCreateHookSpecificOutput {
  readonly hookEventName: typeof HOOK_WORKTREE_CREATE;

  /** Absolute path of the created worktree directory. */
  readonly worktreePath: string;
}

/** `MessageDisplay` result: rewrite the delta on screen, display-only. */
export interface MessageDisplayHookSpecificOutput {
  readonly hookEventName: typeof HOOK_MESSAGE_DISPLAY;

  /**
   * Text displayed in place of the delta. Omit (or return the delta unchanged)
   * to display the original. The stored message is not affected.
   */
  readonly displayContent?: string;
}

/**
 * Event-specific half of a hook result, discriminated on `hookEventName`.
 *
 * Only 22 of the 33 events have one: `SessionEnd`, `PreCompact`, `PostCompact`,
 * `StopFailure`, `ConfigChange`, `InstructionsLoaded`, `TeammateIdle`,
 * `TaskCreated`, `TaskCompleted`, `WorktreeRemove` and `DirectoryAdded` are
 * observe-only, so this union is deliberately not `Record<HookEvent, …>`.
 */
export type HookSpecificOutput =
  | PreToolUseHookSpecificOutput
  | UserPromptSubmitHookSpecificOutput
  | UserPromptExpansionHookSpecificOutput
  | SessionStartHookSpecificOutput
  | SetupHookSpecificOutput
  | PreModelSwitchHookSpecificOutput
  | PostModelSwitchHookSpecificOutput
  | SubagentStartHookSpecificOutput
  | PostToolUseHookSpecificOutput
  | PostToolUseFailureHookSpecificOutput
  | PostToolBatchHookSpecificOutput
  | StopHookSpecificOutput
  | SubagentStopHookSpecificOutput
  | PermissionDeniedHookSpecificOutput
  | NotificationHookSpecificOutput
  | PermissionRequestHookSpecificOutput
  | ElicitationHookSpecificOutput
  | ElicitationResultHookSpecificOutput
  | CwdChangedHookSpecificOutput
  | FileChangedHookSpecificOutput
  | WorktreeCreateHookSpecificOutput
  | MessageDisplayHookSpecificOutput;

// ── Hook results ──────────────────────────────────────────────────

/**
 * Immediate hook result.
 *
 * Every field is optional: returning `{}` means "no opinion, carry on".
 *
 * @example
 * ```ts
 * // Block a tool call and tell the model why
 * const blocked: SyncHookJSONOutput = {
 *   decision: 'block',
 *   reason: 'Writes to /etc are not allowed in this project',
 * }
 *
 * // Rewrite a tool's input instead
 * const rewritten: SyncHookJSONOutput = {
 *   hookSpecificOutput: {
 *     hookEventName: 'PreToolUse',
 *     permissionDecision: 'allow',
 *     updatedInput: { command: 'ls -la' },
 *   },
 * }
 * ```
 */
export type SyncHookJSONOutput = {
  /** `false` stops the turn after this hook. */
  continue?: boolean;

  /** Hide this hook's stdout from the transcript. */
  suppressOutput?: boolean;

  /** Reason surfaced to the user when `continue` is `false`. */
  stopReason?: string;

  /** Coarse verdict for events that accept one — `'block'` rejects the action. */
  decision?: 'approve' | 'block';

  /** Message injected into the conversation as a system note. */
  systemMessage?: string;

  /**
   * A terminal escape sequence (e.g. an OSC 9 / OSC 777 desktop notification)
   * for the CLI to emit on your behalf. Only notification/title OSCs
   * (0, 1, 2, 9, 99, 777) and BEL are permitted; anything else is dropped.
   */
  terminalSequence?: string;

  /** Explanation that accompanies `decision`. */
  reason?: string;

  /** Event-specific half of the result. */
  hookSpecificOutput?: HookSpecificOutput;

  /** Forward-compat escape hatch for fields newer than this library. */
  [key: string]: unknown;
};

/**
 * Deferred hook result: acknowledge now, keep working in the background.
 *
 * The turn continues immediately; the hook's real result is delivered later.
 */
export type AsyncHookJSONOutput = {
  /** Marks the result as asynchronous. */
  async: true;

  /** Milliseconds to wait for the background work before giving up. */
  asyncTimeout?: number;
};

/** What a hook returns — an immediate result or an async acknowledgement. */
export type HookJSONOutput = SyncHookJSONOutput | AsyncHookJSONOutput;

/**
 * JS callback for hook events (SDK mode).
 *
 * Runs in-process, unlike the shell-command hooks configured through
 * {@link HooksConfig}.
 *
 * @example
 * ```ts
 * const denyRm: HookCallback = async (input) => {
 *   if (input.hook_event_name !== 'PreToolUse') return {}
 *   const cmd = String((input.tool_input as { command?: string }).command ?? '')
 *   return cmd.includes('rm -rf')
 *     ? { decision: 'block', reason: 'Destructive command blocked' }
 *     : { continue: true }
 * }
 * ```
 */
export type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<HookJSONOutput>;

/** A group of JS hook callbacks and the pattern that gates them (SDK mode). */
export interface HookCallbackMatcher {
  /**
   * Pattern matched against the tool name. Omit for events that carry no tool
   * name (`Stop`, `SessionStart`, `Notification`, …).
   */
  readonly matcher?: string;

  /** Callbacks to run when the matcher matches. */
  readonly hooks: readonly HookCallback[];

  /** Timeout in seconds for every hook in this matcher. */
  readonly timeout?: number;
}

// ── Shell-command hooks (CLI mode) ────────────────────────────────

/**
 * A hook that runs a shell command or an executable.
 *
 * The CLI settings schema requires `type: 'command'` on every entry, and drops
 * entries that omit it. It stays optional here only so existing configs like
 * `{ command: 'echo hi' }` keep compiling — always write it explicitly, and let
 * the settings serializer fill it in for older configs.
 *
 * @example
 * ```ts
 * const entry: CommandHookEntry = {
 *   type: 'command',
 *   command: 'npx',
 *   args: ['prettier', '--write', '.'],
 *   if: 'Bash(git commit *)',
 *   timeout: 30,
 * }
 * ```
 */
export interface CommandHookEntry {
  /** Discriminator. Defaults to `'command'` when omitted. */
  readonly type?: 'command';

  /**
   * Command to execute. Runs through a shell unless `args` is present, in which
   * case it is resolved as an executable and spawned directly.
   */
  readonly command: string;

  /**
   * Argument list for exec form. When present, `command` is spawned directly
   * with these arguments and no shell, so paths containing quotes, `$` or
   * backticks never reach a shell parser. Placeholders such as
   * `${CLAUDE_PLUGIN_ROOT}` are substituted per element as plain strings.
   */
  readonly args?: readonly string[];

  /**
   * Permission-rule syntax gating the hook (e.g. `"Bash(git *)"`). The hook only
   * runs when the tool call matches, which avoids spawning a process per
   * non-matching call.
   */
  readonly if?: string;

  /**
   * Shell interpreter. `'bash'` uses `$SHELL` (bash/zsh/sh), `'powershell'` uses
   * pwsh. Defaults to bash — powershell on Windows without Git Bash.
   */
  readonly shell?: 'bash' | 'powershell';

  /** Timeout in seconds for this command. */
  readonly timeout?: number;

  /** Status message shown in the spinner while the hook runs. */
  readonly statusMessage?: string;

  /** Run once, then remove this hook. */
  readonly once?: boolean;

  /** Run in the background without blocking the turn. */
  readonly async?: boolean;

  /**
   * Run in the background and wake the model on exit code 2 (blocking error).
   * Implies `async`.
   */
  readonly asyncRewake?: boolean;
}

/** A hook that evaluates a prompt with a small model and blocks on the verdict. */
export interface PromptHookEntry {
  /** Discriminator. */
  readonly type: 'prompt';

  /** Prompt to evaluate. Use the `$ARGUMENTS` placeholder for the hook input JSON. */
  readonly prompt: string;

  /** Permission-rule syntax gating the hook (e.g. `"Bash(git *)"`). */
  readonly if?: string;

  /** Timeout in seconds for this evaluation. */
  readonly timeout?: number;

  /** Model for this prompt hook. Defaults to the small fast model. */
  readonly model?: string;

  /**
   * Sets the `continue` value of the `decision: 'block'` produced when the
   * verdict is negative. Defaults to `false` (the turn ends).
   */
  readonly continueOnBlock?: boolean;

  /** Status message shown in the spinner while the hook runs. */
  readonly statusMessage?: string;

  /** Run once, then remove this hook. */
  readonly once?: boolean;
}

/** A hook that runs an agentic verifier with tool access. */
export interface AgentHookEntry {
  /** Discriminator. */
  readonly type: 'agent';

  /**
   * What to verify (e.g. `"Verify that unit tests ran and passed."`). Use the
   * `$ARGUMENTS` placeholder for the hook input JSON.
   */
  readonly prompt: string;

  /** Permission-rule syntax gating the hook (e.g. `"Bash(git *)"`). */
  readonly if?: string;

  /** Timeout in seconds for agent execution. Defaults to 60. */
  readonly timeout?: number;

  /** Model for this agent hook. Defaults to Haiku. */
  readonly model?: string;

  /** Status message shown in the spinner while the hook runs. */
  readonly statusMessage?: string;

  /** Run once, then remove this hook. */
  readonly once?: boolean;
}

/** A hook that POSTs the hook input JSON to an HTTP endpoint. */
export interface HttpHookEntry {
  /** Discriminator. */
  readonly type: 'http';

  /** URL that receives the hook input JSON. */
  readonly url: string;

  /** Permission-rule syntax gating the hook (e.g. `"Bash(git *)"`). */
  readonly if?: string;

  /** Timeout in seconds for the request. */
  readonly timeout?: number;

  /**
   * Extra request headers. Values may reference environment variables as
   * `$VAR_NAME` or `${VAR_NAME}` — only names listed in `allowedEnvVars` are
   * interpolated.
   */
  readonly headers?: Readonly<Record<string, string>>;

  /**
   * Environment variable names that may be interpolated into header values.
   * Required for interpolation to happen at all; every other `$VAR` reference
   * resolves to an empty string.
   */
  readonly allowedEnvVars?: readonly string[];

  /** Status message shown in the spinner while the hook runs. */
  readonly statusMessage?: string;

  /** Run once, then remove this hook. */
  readonly once?: boolean;
}

/** A hook that calls a tool on an already-configured MCP server. */
export interface McpToolHookEntry {
  /** Discriminator. */
  readonly type: 'mcp_tool';

  /** Name of an already-configured MCP server. */
  readonly server: string;

  /** Tool on that server to call. */
  readonly tool: string;

  /**
   * Arguments passed to the tool. String values support `${path}` interpolation
   * from the hook input JSON (e.g. `"${tool_input.file_path}"`).
   */
  readonly input?: Readonly<Record<string, unknown>>;

  /** Permission-rule syntax gating the hook (e.g. `"Bash(git *)"`). */
  readonly if?: string;

  /** Timeout in seconds for the tool call. */
  readonly timeout?: number;

  /** Status message shown in the spinner while the hook runs. */
  readonly statusMessage?: string;

  /** Run once, then remove this hook. */
  readonly once?: boolean;
}

/**
 * One configured hook, discriminated on `type`.
 *
 * An entry without `type` is a {@link CommandHookEntry}, which keeps older
 * `{ command, timeout }` configs valid.
 */
export type HookEntry =
  | CommandHookEntry
  | PromptHookEntry
  | AgentHookEntry
  | HttpHookEntry
  | McpToolHookEntry;

/** A group of configured hooks and the pattern that gates them (CLI mode). */
export interface HookMatcher {
  /**
   * Pattern matched against the tool name. Optional: non-tool events (`Stop`,
   * `SessionStart`, `SessionEnd`, `Notification`, …) have no tool name to match.
   */
  readonly matcher?: string;

  /** Hook entries to execute when the matcher matches. */
  readonly hooks: readonly HookEntry[];
}

/**
 * Shell-command hook configuration, keyed by hook event.
 *
 * All 33 {@link HookEvent} names are offered by completion, and the index
 * signature keeps events newer than this library usable. That escape hatch is
 * also why a misspelled event still compiles here — `PreToolUseX` is accepted,
 * serialised into the settings payload, and then silently ignored by the CLI.
 * To have the compiler reject unknown keys, annotate the object as
 * `Partial<Record<HookEvent, readonly HookMatcher[]>>` instead.
 *
 * @example
 * ```ts
 * const hooks: HooksConfig = {
 *   PreToolUse: [
 *     { matcher: 'Bash', hooks: [{ type: 'command', command: './scripts/audit.sh' }] },
 *   ],
 *   Stop: [
 *     { hooks: [{ type: 'command', command: 'notify-send "Claude finished"' }] },
 *   ],
 * }
 * ```
 */
export type HooksConfig = Readonly<Partial<Record<HookEvent, readonly HookMatcher[]>>> & {
  readonly [key: string]: readonly HookMatcher[] | undefined;
};
