/**
 * Centralized constants — no magic strings in the codebase.
 *
 * Every string literal used as a discriminator, event name, CLI flag,
 * or protocol key is defined here.
 */

// ── Stream Event Types ──────────────────────────────────────────────

export const EVENT_TEXT = 'text' as const;
export const EVENT_TOOL_USE = 'tool_use' as const;
export const EVENT_RESULT = 'result' as const;
export const EVENT_ERROR = 'error' as const;
export const EVENT_SYSTEM = 'system' as const;

// ── Output / Input Formats ──────────────────────────────────────────

export const FORMAT_TEXT = 'text' as const;
export const FORMAT_JSON = 'json' as const;
export const FORMAT_STREAM_JSON = 'stream-json' as const;

// ── Permission Modes ────────────────────────────────────────────────

export const PERMISSION_DEFAULT = 'default' as const;
export const PERMISSION_ACCEPT_EDITS = 'acceptEdits' as const;
export const PERMISSION_PLAN = 'plan' as const;
export const PERMISSION_DONT_ASK = 'dontAsk' as const;
export const PERMISSION_BYPASS = 'bypassPermissions' as const;
export const PERMISSION_AUTO = 'auto' as const;

/**
 * CLI spelling of {@link PERMISSION_DEFAULT}. The `claude` binary accepts both;
 * the SDK only knows `'default'`, so normalize before forwarding to SDK mode.
 */
export const PERMISSION_MANUAL = 'manual' as const;

export const VALID_PERMISSION_MODES = [
  PERMISSION_DEFAULT,
  PERMISSION_ACCEPT_EDITS,
  PERMISSION_PLAN,
  PERMISSION_DONT_ASK,
  PERMISSION_BYPASS,
  PERMISSION_AUTO,
  PERMISSION_MANUAL,
] as const;

// ── Effort Levels ───────────────────────────────────────────────────

export const EFFORT_LOW = 'low' as const;
export const EFFORT_MEDIUM = 'medium' as const;
export const EFFORT_HIGH = 'high' as const;
export const EFFORT_XHIGH = 'xhigh' as const;
export const EFFORT_MAX = 'max' as const;

export const VALID_EFFORT_LEVELS = [
  EFFORT_LOW,
  EFFORT_MEDIUM,
  EFFORT_HIGH,
  EFFORT_XHIGH,
  EFFORT_MAX,
] as const;

// ── SDK Init Stages ─────────────────────────────────────────────────

export const INIT_IMPORTING = 'importing' as const;
export const INIT_CREATING = 'creating' as const;
export const INIT_CONNECTING = 'connecting' as const;
export const INIT_READY = 'ready' as const;

// ── Message Roles ───────────────────────────────────────────────────

export const ROLE_USER = 'user' as const;
export const ROLE_ASSISTANT = 'assistant' as const;

// ── Content Block Types ─────────────────────────────────────────────

export const BLOCK_TEXT = 'text' as const;
export const BLOCK_TOOL_USE = 'tool_use' as const;
export const BLOCK_TOOL_RESULT = 'tool_result' as const;
export const BLOCK_THINKING = 'thinking' as const;
export const BLOCK_REDACTED_THINKING = 'redacted_thinking' as const;

// ── Thinking Config Types ───────────────────────────────────────────

/** Discriminators of the `thinking` config union, also the `--thinking` values. */
export const THINKING_ADAPTIVE = 'adaptive' as const;
export const THINKING_ENABLED = 'enabled' as const;
export const THINKING_DISABLED = 'disabled' as const;

// ── Plugin Config Types ─────────────────────────────────────────────

/** Discriminators of the `plugins` config union. */
export const PLUGIN_LOCAL = 'local' as const;
export const PLUGIN_URL = 'url' as const;

// ── MCP Transport Types ─────────────────────────────────────────────

export const MCP_STDIO = 'stdio' as const;
export const MCP_HTTP = 'http' as const;
export const MCP_SSE = 'sse' as const;

/** In-process MCP server created with the SDK's `createSdkMcpServer()`. */
export const MCP_SDK = 'sdk' as const;

/** Connector proxied through claude.ai; reported by `mcpStatus()`, never configured directly. */
export const MCP_CLAUDEAI_PROXY = 'claudeai-proxy' as const;

export const VALID_MCP_TRANSPORTS = [
  MCP_STDIO,
  MCP_HTTP,
  MCP_SSE,
  MCP_SDK,
  MCP_CLAUDEAI_PROXY,
] as const;

// ── Chat Protocol ───────────────────────────────────────────────────

export const CHAT_USER_MESSAGE = 'user_message' as const;

// ── Task Event Types ────────────────────────────────────────────────

export const EVENT_TASK_STARTED = 'task_started' as const;
export const EVENT_TASK_PROGRESS = 'task_progress' as const;
export const EVENT_TASK_NOTIFICATION = 'task_notification' as const;
export const EVENT_TASK_UPDATED = 'task_updated' as const;
export const EVENT_BACKGROUND_TASKS_CHANGED = 'background_tasks_changed' as const;
export const EVENT_RATE_LIMIT = 'rate_limit' as const;
export const SDK_RATE_LIMIT_EVENT = 'rate_limit_event' as const;

// ── Tool Progress & Summary ─────────────────────────────────────────

export const EVENT_TOOL_PROGRESS = 'tool_progress' as const;
export const EVENT_TOOL_USE_SUMMARY = 'tool_use_summary' as const;

/** Emitted for each `tool_result` block carried on an SDK `user` message. */
export const EVENT_TOOL_RESULT = 'tool_result' as const;

// ── Auth Status ─────────────────────────────────────────────────────

export const EVENT_AUTH_STATUS = 'auth_status' as const;

// ── Hook Lifecycle ──────────────────────────────────────────────────

export const EVENT_HOOK_STARTED = 'hook_started' as const;
export const EVENT_HOOK_PROGRESS = 'hook_progress' as const;
export const EVENT_HOOK_RESPONSE = 'hook_response' as const;

// ── Hook Events ─────────────────────────────────────────────────────

/**
 * The 33 hook events the CLI can dispatch, in SDK declaration order.
 *
 * @example
 * ```ts
 * const claude = new Claude({
 *   hookCallbacks: { [HOOK_PRE_TOOL_USE]: async (input) => ({ continue: true }) },
 * });
 * ```
 */
export const HOOK_PRE_TOOL_USE = 'PreToolUse' as const;
export const HOOK_POST_TOOL_USE = 'PostToolUse' as const;
export const HOOK_POST_TOOL_USE_FAILURE = 'PostToolUseFailure' as const;
export const HOOK_POST_TOOL_BATCH = 'PostToolBatch' as const;
export const HOOK_NOTIFICATION = 'Notification' as const;
export const HOOK_USER_PROMPT_SUBMIT = 'UserPromptSubmit' as const;
export const HOOK_USER_PROMPT_EXPANSION = 'UserPromptExpansion' as const;
export const HOOK_SESSION_START = 'SessionStart' as const;
export const HOOK_SESSION_END = 'SessionEnd' as const;
export const HOOK_STOP = 'Stop' as const;
export const HOOK_STOP_FAILURE = 'StopFailure' as const;
export const HOOK_SUBAGENT_START = 'SubagentStart' as const;
export const HOOK_SUBAGENT_STOP = 'SubagentStop' as const;
export const HOOK_PRE_COMPACT = 'PreCompact' as const;
export const HOOK_POST_COMPACT = 'PostCompact' as const;
export const HOOK_PRE_MODEL_SWITCH = 'PreModelSwitch' as const;
export const HOOK_POST_MODEL_SWITCH = 'PostModelSwitch' as const;
export const HOOK_PERMISSION_REQUEST = 'PermissionRequest' as const;
export const HOOK_PERMISSION_DENIED = 'PermissionDenied' as const;
export const HOOK_SETUP = 'Setup' as const;
export const HOOK_TEAMMATE_IDLE = 'TeammateIdle' as const;
export const HOOK_TASK_CREATED = 'TaskCreated' as const;
export const HOOK_TASK_COMPLETED = 'TaskCompleted' as const;
export const HOOK_ELICITATION = 'Elicitation' as const;
export const HOOK_ELICITATION_RESULT = 'ElicitationResult' as const;
export const HOOK_CONFIG_CHANGE = 'ConfigChange' as const;
export const HOOK_WORKTREE_CREATE = 'WorktreeCreate' as const;
export const HOOK_WORKTREE_REMOVE = 'WorktreeRemove' as const;
export const HOOK_INSTRUCTIONS_LOADED = 'InstructionsLoaded' as const;
export const HOOK_CWD_CHANGED = 'CwdChanged' as const;
export const HOOK_FILE_CHANGED = 'FileChanged' as const;
export const HOOK_DIRECTORY_ADDED = 'DirectoryAdded' as const;
export const HOOK_MESSAGE_DISPLAY = 'MessageDisplay' as const;

export const VALID_HOOK_EVENTS = [
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
] as const;

// ── File Persistence ────────────────────────────────────────────────

export const EVENT_FILES_PERSISTED = 'files_persisted' as const;

// ── Context Compaction ──────────────────────────────────────────────

export const EVENT_COMPACT_BOUNDARY = 'compact_boundary' as const;

/** What started the compaction. `auto` is assumed when the metadata omits it. */
export const COMPACT_TRIGGER_AUTO = 'auto' as const;
export const COMPACT_TRIGGER_MANUAL = 'manual' as const;

/** Structured `/context` payload carried on the assistant message wrapper. */
export const EVENT_CONTEXT_USAGE = 'context_usage' as const;

// ── Local Command Output ────────────────────────────────────────────

export const EVENT_LOCAL_COMMAND_OUTPUT = 'local_command_output' as const;

// ── Assistant Reasoning ─────────────────────────────────────────────

/** Extended-thinking block (plain or redacted) lifted out of the assistant message. */
export const EVENT_THINKING = 'thinking' as const;

/** Running token estimate emitted while the model is thinking. */
export const EVENT_THINKING_TOKENS = 'thinking_tokens' as const;

// ── Model Refusal & API Retry ───────────────────────────────────────

export const EVENT_API_RETRY = 'api_retry' as const;
export const EVENT_MODEL_REFUSAL_FALLBACK = 'model_refusal_fallback' as const;
export const EVENT_MODEL_REFUSAL_NO_FALLBACK = 'model_refusal_no_fallback' as const;

// ── Session & Runtime Signals ───────────────────────────────────────

export const EVENT_SESSION_STATE_CHANGED = 'session_state_changed' as const;
export const EVENT_STATUS = 'status' as const;
export const EVENT_WORKER_SHUTTING_DOWN = 'worker_shutting_down' as const;
export const EVENT_CONVERSATION_RESET = 'conversation_reset' as const;
export const EVENT_MIRROR_ERROR = 'mirror_error' as const;

/** Typed form of the `system`/`init` handshake message. */
export const EVENT_INIT = 'init' as const;

// ── Permission & Notifications ──────────────────────────────────────

export const EVENT_PERMISSION_DENIED = 'permission_denied' as const;

/** Host-facing toast notification. Distinct from {@link EVENT_TASK_NOTIFICATION}. */
export const EVENT_NOTIFICATION = 'notification' as const;

export const EVENT_INFORMATIONAL = 'informational' as const;
export const EVENT_PROMPT_SUGGESTION = 'prompt_suggestion' as const;

// ── Partial Messages ────────────────────────────────────────────────

/** Library-side name for an SDK `stream_event` message (token-level deltas). */
export const EVENT_PARTIAL_MESSAGE = 'partial_message' as const;

// ── Memory, Commands & Plugins ──────────────────────────────────────

export const EVENT_MEMORY_RECALL = 'memory_recall' as const;
export const EVENT_COMMANDS_CHANGED = 'commands_changed' as const;
export const EVENT_PLUGIN_INSTALL = 'plugin_install' as const;

// ── Elicitation & Control Requests ──────────────────────────────────

export const EVENT_ELICITATION_COMPLETE = 'elicitation_complete' as const;
export const EVENT_CONTROL_REQUEST_PROGRESS = 'control_request_progress' as const;

// ── SDK Message Discriminators ──────────────────────────────────────

/** Top-level `type` of an SDK partial-assistant message, mapped to {@link EVENT_PARTIAL_MESSAGE}. */
export const SDK_STREAM_EVENT = 'stream_event' as const;

// ── Result Subtypes ─────────────────────────────────────────────────

export const RESULT_SUCCESS = 'success' as const;
export const RESULT_ERROR_DURING_EXECUTION = 'error_during_execution' as const;
export const RESULT_ERROR_MAX_TURNS = 'error_max_turns' as const;
export const RESULT_ERROR_MAX_BUDGET_USD = 'error_max_budget_usd' as const;
export const RESULT_ERROR_MAX_STRUCTURED_OUTPUT_RETRIES = 'error_max_structured_output_retries' as const;

export const VALID_RESULT_SUBTYPES = [
  RESULT_SUCCESS,
  RESULT_ERROR_DURING_EXECUTION,
  RESULT_ERROR_MAX_TURNS,
  RESULT_ERROR_MAX_BUDGET_USD,
  RESULT_ERROR_MAX_STRUCTURED_OUTPUT_RETRIES,
] as const;

// ── Terminal Reasons ────────────────────────────────────────────────

/** Why the turn stopped, as reported on the result message (`terminal_reason`). */
export const VALID_TERMINAL_REASONS = [
  'blocking_limit',
  'rapid_refill_breaker',
  'prompt_too_long',
  'image_error',
  'model_error',
  'api_error',
  'malformed_tool_use_exhausted',
  'aborted_streaming',
  'aborted_tools',
  'stop_hook_prevented',
  'hook_stopped',
  'tool_deferred',
  'max_turns',
  'background_requested',
  'completed',
  'budget_exhausted',
  'structured_output_retry_exhausted',
  'tool_deferred_unavailable',
  'turn_setup_failed',
] as const;

// ── Rate Limit Types ────────────────────────────────────────────────

/** Which quota window a `rate_limit_event` refers to. */
export const VALID_RATE_LIMIT_TYPES = [
  'five_hour',
  'seven_day',
  'seven_day_opus',
  'seven_day_sonnet',
  'seven_day_overage_included',
  'overage',
] as const;

/** Quota verdict on a `rate_limit_event`. `allowed` is assumed when it is absent. */
export const RATE_LIMIT_ALLOWED = 'allowed' as const;
export const RATE_LIMIT_ALLOWED_WARNING = 'allowed_warning' as const;
export const RATE_LIMIT_REJECTED = 'rejected' as const;

// ── System Event Subtypes ───────────────────────────────────────────

export const SYSTEM_STDERR = 'stderr' as const;
export const SYSTEM_INIT = 'init' as const;
export const SYSTEM_UNKNOWN = 'unknown' as const;

// ── Process Signals ─────────────────────────────────────────────────

export const SIGNAL_SIGTERM = 'SIGTERM' as const;

// ── Node Error Codes ────────────────────────────────────────────────

export const ERR_ENOENT = 'ENOENT' as const;

// ── Scheduler Events ────────────────────────────────────────────────

export const SCHED_RESULT = 'result' as const;
export const SCHED_ERROR = 'error' as const;
export const SCHED_TICK = 'tick' as const;
export const SCHED_STOP = 'stop' as const;

// ── Init Events ─────────────────────────────────────────────────────

export const INIT_EVENT_STAGE = 'init:stage' as const;
export const INIT_EVENT_READY = 'init:ready' as const;
export const INIT_EVENT_ERROR = 'init:error' as const;

// ── Interval Units ──────────────────────────────────────────────────

export const UNIT_SECONDS = 's' as const;
export const UNIT_MINUTES = 'm' as const;
export const UNIT_HOURS = 'h' as const;
export const UNIT_DAYS = 'd' as const;

export const INTERVAL_MULTIPLIERS: Record<string, number> = {
  [UNIT_SECONDS]: 1_000,
  [UNIT_MINUTES]: 60_000,
  [UNIT_HOURS]: 3_600_000,
  [UNIT_DAYS]: 86_400_000,
};

// ── CLI Flags ───────────────────────────────────────────────────────

export const FLAG_PRINT = '--print' as const;
export const FLAG_OUTPUT_FORMAT = '--output-format' as const;
export const FLAG_INPUT_FORMAT = '--input-format' as const;
export const FLAG_VERBOSE = '--verbose' as const;
export const FLAG_CONTINUE = '--continue' as const;
export const FLAG_RESUME = '--resume' as const;
export const FLAG_FORK_SESSION = '--fork-session' as const;
export const FLAG_MODEL = '--model' as const;
export const FLAG_FALLBACK_MODEL = '--fallback-model' as const;
export const FLAG_EFFORT = '--effort' as const;
export const FLAG_PERMISSION_MODE = '--permission-mode' as const;
export const FLAG_ALLOWED_TOOLS = '--allowedTools' as const;
export const FLAG_DISALLOWED_TOOLS = '--disallowedTools' as const;
export const FLAG_TOOLS = '--tools' as const;
export const FLAG_SYSTEM_PROMPT = '--system-prompt' as const;
export const FLAG_APPEND_SYSTEM_PROMPT = '--append-system-prompt' as const;
export const FLAG_MAX_TURNS = '--max-turns' as const;
export const FLAG_MAX_BUDGET = '--max-budget-usd' as const;
export const FLAG_ADD_DIR = '--add-dir' as const;
export const FLAG_MCP_CONFIG = '--mcp-config' as const;
export const FLAG_STRICT_MCP_CONFIG = '--strict-mcp-config' as const;
export const FLAG_AGENTS = '--agents' as const;
export const FLAG_AGENT = '--agent' as const;
export const FLAG_JSON_SCHEMA = '--json-schema' as const;
export const FLAG_WORKTREE = '--worktree' as const;
export const FLAG_NO_SESSION_PERSISTENCE = '--no-session-persistence' as const;
export const FLAG_NAME = '--name' as const;
export const FLAG_SETTINGS = '--settings' as const;
export const FLAG_SESSION_ID = '--session-id' as const;

// Session continuation (`--resume-session-at` / `--resume-drops-turn` are hidden but supported)
export const FLAG_RESUME_SESSION_AT = '--resume-session-at' as const;
export const FLAG_RESUME_DROPS_TURN = '--resume-drops-turn' as const;

// Configuration sources
export const FLAG_SETTING_SOURCES = '--setting-sources' as const;
export const FLAG_SAFE_MODE = '--safe-mode' as const;
export const FLAG_BARE = '--bare' as const;

// Stream shaping (all require `--output-format stream-json`)
export const FLAG_INCLUDE_HOOK_EVENTS = '--include-hook-events' as const;
export const FLAG_INCLUDE_PARTIAL_MESSAGES = '--include-partial-messages' as const;
export const FLAG_FORWARD_SUBAGENT_TEXT = '--forward-subagent-text' as const;
export const FLAG_REPLAY_USER_MESSAGES = '--replay-user-messages' as const;
export const FLAG_PROMPT_SUGGESTIONS = '--prompt-suggestions' as const;

// Permissions
export const FLAG_ALLOW_DANGEROUSLY_SKIP_PERMISSIONS = '--allow-dangerously-skip-permissions' as const;
export const FLAG_DANGEROUSLY_SKIP_PERMISSIONS = '--dangerously-skip-permissions' as const;
export const FLAG_PERMISSION_PROMPT_TOOL = '--permission-prompt-tool' as const;

/**
 * Replaces the body of the built-in plan-mode workflow. Hidden from `--help`
 * but accepted by the binary, and only consulted while the run is in plan mode.
 */
export const FLAG_PLAN_MODE_INSTRUCTIONS = '--plan-mode-instructions' as const;

// Plugins
export const FLAG_PLUGIN_DIR = '--plugin-dir' as const;

/**
 * Loads a plugin directory but leaves the MCP servers it declares unconnected.
 * The CLI spelling of `skipMcpDiscovery` — it replaces {@link FLAG_PLUGIN_DIR}
 * rather than accompanying it. Hidden from `--help`, accepted by the binary.
 */
export const FLAG_PLUGIN_DIR_NO_MCP = '--plugin-dir-no-mcp' as const;

export const FLAG_PLUGIN_URL = '--plugin-url' as const;

// Diagnostics
export const FLAG_DEBUG = '--debug' as const;
export const FLAG_DEBUG_FILE = '--debug-file' as const;

// Thinking & budgets
export const FLAG_THINKING = '--thinking' as const;
export const FLAG_MAX_THINKING_TOKENS = '--max-thinking-tokens' as const;
export const FLAG_TASK_BUDGET = '--task-budget' as const;
export const FLAG_AUTOCOMPACT = '--autocompact' as const;

// System prompt composition
export const FLAG_SYSTEM_PROMPT_FILE = '--system-prompt-file' as const;
export const FLAG_APPEND_SYSTEM_PROMPT_FILE = '--append-system-prompt-file' as const;
export const FLAG_APPEND_SUBAGENT_SYSTEM_PROMPT = '--append-subagent-system-prompt' as const;
export const FLAG_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS = '--exclude-dynamic-system-prompt-sections' as const;

// Misc
export const FLAG_BETAS = '--betas' as const;
export const FLAG_DISABLE_SLASH_COMMANDS = '--disable-slash-commands' as const;
export const FLAG_FILE = '--file' as const;
export const FLAG_BRIEF = '--brief' as const;
export const FLAG_BACKGROUND = '--background' as const;

// ── Flag Punctuation ────────────────────────────────────────────────

/** Prefix every long CLI flag carries. Prepended to bare `extraArgs` keys. */
export const FLAG_PREFIX = '--' as const;

/**
 * Single-dash prefix. A flag *value* that starts with it has to use the
 * one-token `--flag=value` spelling, or the CLI's parser reads it as the next
 * flag instead of as this flag's value.
 */
export const FLAG_SHORT_PREFIX = '-' as const;

/** Joins a flag to its value in the one-token `--flag=value` spelling. */
export const FLAG_VALUE_ASSIGN = '=' as const;

/** Separator for flags that take a comma-separated list (`--setting-sources`, `--fallback-model`). */
export const LIST_SEPARATOR = ',' as const;

// Flag values (the value a flag takes, as opposed to the flag name)

/**
 * Value of `--tools` that restricts the run to no built-in tools at all.
 * An empty `tools` array means "none", which the CLI spells as an empty string —
 * distinct from omitting the flag, which leaves the default set intact.
 */
export const TOOLS_NONE = '' as const;

/**
 * Flags that ALWAYS consume at least one following token (used by
 * `extractPrompt` in the SDK executor to skip flag values).
 *
 * Flags whose value is optional live in {@link FLAGS_WITH_OPTIONAL_VALUE};
 * flags that consume every following non-flag token live in {@link FLAGS_VARIADIC}.
 */
export const FLAGS_WITH_VALUE = [
  FLAG_OUTPUT_FORMAT, FLAG_MODEL, FLAG_FALLBACK_MODEL, FLAG_PERMISSION_MODE,
  FLAG_SYSTEM_PROMPT, FLAG_APPEND_SYSTEM_PROMPT, FLAG_MAX_TURNS, FLAG_MAX_BUDGET,
  FLAG_ADD_DIR, FLAG_MCP_CONFIG, FLAG_AGENTS, FLAG_JSON_SCHEMA,
  FLAG_RESUME, FLAG_SESSION_ID, FLAG_ALLOWED_TOOLS, FLAG_DISALLOWED_TOOLS,
  FLAG_AGENT, FLAG_TOOLS, FLAG_NAME, FLAG_SETTINGS, FLAG_EFFORT,
  FLAG_INPUT_FORMAT, FLAG_RESUME_SESSION_AT, FLAG_RESUME_DROPS_TURN,
  FLAG_SETTING_SOURCES, FLAG_PERMISSION_PROMPT_TOOL, FLAG_PLAN_MODE_INSTRUCTIONS,
  FLAG_PLUGIN_DIR, FLAG_PLUGIN_DIR_NO_MCP,
  FLAG_PLUGIN_URL, FLAG_DEBUG_FILE, FLAG_THINKING, FLAG_MAX_THINKING_TOKENS,
  FLAG_TASK_BUDGET, FLAG_AUTOCOMPACT, FLAG_SYSTEM_PROMPT_FILE,
  FLAG_APPEND_SYSTEM_PROMPT_FILE, FLAG_APPEND_SUBAGENT_SYSTEM_PROMPT,
  FLAG_BETAS, FLAG_FILE,
] as const;

/**
 * Flags declared as `[value]` by the CLI — the next token is a value only when
 * it does not start with `-`. `--worktree` is emitted bare for `worktree: true`,
 * so it must never be treated as unconditionally value-taking.
 */
export const FLAGS_WITH_OPTIONAL_VALUE = [
  FLAG_WORKTREE,
  FLAG_DEBUG,
  FLAG_PROMPT_SUGGESTIONS,
] as const;

/**
 * Flags declared as `<x...>` by the CLI — they consume every following token
 * until the next `-`-prefixed one, not just a single value.
 */
export const FLAGS_VARIADIC = [
  FLAG_ALLOWED_TOOLS,
  FLAG_DISALLOWED_TOOLS,
  FLAG_TOOLS,
  FLAG_BETAS,
  FLAG_ADD_DIR,
  FLAG_MCP_CONFIG,
  FLAG_FILE,
] as const;

// ── JSON Protocol Keys ──────────────────────────────────────────────

export const KEY_TYPE = 'type' as const;
export const KEY_RESULT = 'result' as const;
export const KEY_SESSION_ID = 'session_id' as const;
export const KEY_USAGE = 'usage' as const;
export const KEY_INPUT_TOKENS = 'input_tokens' as const;
export const KEY_OUTPUT_TOKENS = 'output_tokens' as const;
export const KEY_TOTAL_COST = 'total_cost_usd' as const;
export const KEY_DURATION = 'duration_ms' as const;
export const KEY_STRUCTURED_OUTPUT = 'structured_output' as const;
export const KEY_MESSAGES = 'messages' as const;
export const KEY_MESSAGE = 'message' as const;
export const KEY_CONTENT = 'content' as const;
export const KEY_ROLE = 'role' as const;
export const KEY_TEXT = 'text' as const;
export const KEY_NAME = 'name' as const;
export const KEY_ID = 'id' as const;
export const KEY_INPUT = 'input' as const;
export const KEY_ERROR = 'error' as const;

/**
 * Flag on an assistant wrapper whose turn was cancelled rather than completed.
 * Present only when true, so read it as `json[KEY_ABORTED] === true`.
 */
export const KEY_ABORTED = 'aborted' as const;

export const KEY_CODE = 'code' as const;
export const KEY_MODEL = 'model' as const;
export const KEY_TOOLS = 'tools' as const;
export const KEY_SUBTYPE = 'subtype' as const;

// Result message
export const KEY_IS_ERROR = 'is_error' as const;
export const KEY_STOP_REASON = 'stop_reason' as const;
export const KEY_NUM_TURNS = 'num_turns' as const;
export const KEY_ERRORS = 'errors' as const;
export const KEY_TERMINAL_REASON = 'terminal_reason' as const;
export const KEY_PERMISSION_DENIALS = 'permission_denials' as const;
export const KEY_DEFERRED_TOOL_USE = 'deferred_tool_use' as const;
export const KEY_DURATION_API = 'duration_api_ms' as const;
export const KEY_QUEUED_TURN_COUNT = 'queued_turn_count' as const;
export const KEY_TTFT_MS = 'ttft_ms' as const;
export const KEY_API_ERROR_STATUS = 'api_error_status' as const;
export const KEY_FAST_MODE_STATE = 'fast_mode_state' as const;
export const KEY_FAST_MODE_DISABLED_REASON = 'fast_mode_disabled_reason' as const;
export const KEY_ORIGIN = 'origin' as const;
export const KEY_UUID = 'uuid' as const;
export const KEY_USER_MESSAGE_UUID = 'user_message_uuid' as const;

// Usage accounting
/** Per-model totals. camelCase on the wire, unlike its snake_case siblings. */
export const KEY_MODEL_USAGE = 'modelUsage' as const;
export const KEY_CACHE_CREATION_INPUT_TOKENS = 'cache_creation_input_tokens' as const;
export const KEY_CACHE_READ_INPUT_TOKENS = 'cache_read_input_tokens' as const;
export const KEY_SERVER_TOOL_USE = 'server_tool_use' as const;
export const KEY_SERVICE_TIER = 'service_tier' as const;
export const KEY_TOTAL_TOKENS = 'total_tokens' as const;
export const KEY_TOOL_USES = 'tool_uses' as const;
export const KEY_WEB_SEARCH_REQUESTS = 'web_search_requests' as const;
export const KEY_WEB_FETCH_REQUESTS = 'web_fetch_requests' as const;

// Per-model usage entry (every key inside `modelUsage` is camelCase on the wire)
export const KEY_INPUT_TOKENS_CAMEL = 'inputTokens' as const;
export const KEY_OUTPUT_TOKENS_CAMEL = 'outputTokens' as const;
export const KEY_CACHE_READ_TOKENS_CAMEL = 'cacheReadInputTokens' as const;
export const KEY_CACHE_CREATION_TOKENS_CAMEL = 'cacheCreationInputTokens' as const;
export const KEY_WEB_SEARCH_REQUESTS_CAMEL = 'webSearchRequests' as const;
export const KEY_COST_USD = 'costUSD' as const;
export const KEY_CONTEXT_WINDOW = 'contextWindow' as const;
export const KEY_MAX_OUTPUT_TOKENS = 'maxOutputTokens' as const;
export const KEY_CANONICAL_MODEL = 'canonicalModel' as const;
export const KEY_PROVIDER = 'provider' as const;
export const KEY_COST_BASIS = 'costBasis' as const;

// Tool identity
export const KEY_TOOL_NAME = 'tool_name' as const;
export const KEY_TOOL_USE_ID = 'tool_use_id' as const;
export const KEY_TOOL_INPUT = 'tool_input' as const;
export const KEY_TOOL_USE_RESULT = 'tool_use_result' as const;
export const KEY_PARENT_TOOL_USE_ID = 'parent_tool_use_id' as const;
export const KEY_IS_REPLAY = 'isReplay' as const;
export const KEY_IS_SYNTHETIC = 'isSynthetic' as const;
export const KEY_TIMESTAMP = 'timestamp' as const;
export const KEY_ELAPSED_TIME_SECONDS = 'elapsed_time_seconds' as const;
export const KEY_PRECEDING_TOOL_USE_IDS = 'preceding_tool_use_ids' as const;

// Task lifecycle
export const KEY_TASK_ID = 'task_id' as const;
export const KEY_TASK_TYPE = 'task_type' as const;
export const KEY_TASKS = 'tasks' as const;
export const KEY_PATCH = 'patch' as const;
export const KEY_DESCRIPTION = 'description' as const;
export const KEY_SUBAGENT_TYPE = 'subagent_type' as const;
export const KEY_SUBAGENT_RETRY = 'subagent_retry' as const;
export const KEY_IS_BACKGROUNDED = 'is_backgrounded' as const;
export const KEY_SPAWN_DEPTH = 'spawn_depth' as const;
export const KEY_WORKFLOW_NAME = 'workflow_name' as const;
export const KEY_SKIP_TRANSCRIPT = 'skip_transcript' as const;
export const KEY_AMBIENT = 'ambient' as const;
export const KEY_END_TIME = 'end_time' as const;
export const KEY_TOTAL_PAUSED_MS = 'total_paused_ms' as const;
export const KEY_HEARTBEAT = 'heartbeat' as const;
export const KEY_TASK_DESCRIPTION = 'task_description' as const;
export const KEY_LAST_TOOL_NAME = 'last_tool_name' as const;
export const KEY_OUTPUT_FILE = 'output_file' as const;
export const KEY_SUMMARY = 'summary' as const;
export const KEY_PROMPT = 'prompt' as const;

// Hook lifecycle (only present with `--include-hook-events`)
export const KEY_HOOK_ID = 'hook_id' as const;
export const KEY_HOOK_NAME = 'hook_name' as const;
export const KEY_HOOK_EVENT = 'hook_event' as const;
export const KEY_STDOUT = 'stdout' as const;
export const KEY_STDERR = 'stderr' as const;
export const KEY_OUTPUT = 'output' as const;
export const KEY_EXIT_CODE = 'exit_code' as const;
export const KEY_OUTCOME = 'outcome' as const;

// File persistence
export const KEY_FILES = 'files' as const;
export const KEY_FAILED = 'failed' as const;
export const KEY_FILENAME = 'filename' as const;
export const KEY_FILE_ID = 'file_id' as const;
export const KEY_PROCESSED_AT = 'processed_at' as const;

// Retries & refusals
export const KEY_ATTEMPT = 'attempt' as const;
export const KEY_MAX_RETRIES = 'max_retries' as const;
export const KEY_RETRY_DELAY_MS = 'retry_delay_ms' as const;
export const KEY_ERROR_STATUS = 'error_status' as const;
export const KEY_ERROR_CATEGORY = 'error_category' as const;
export const KEY_REQUEST_ID = 'request_id' as const;
export const KEY_DIRECTION = 'direction' as const;
export const KEY_SCOPE = 'scope' as const;
export const KEY_ORIGINAL_MODEL = 'original_model' as const;
export const KEY_FALLBACK_MODEL = 'fallback_model' as const;
export const KEY_API_REFUSAL_CATEGORY = 'api_refusal_category' as const;
export const KEY_API_REFUSAL_EXPLANATION = 'api_refusal_explanation' as const;
export const KEY_RETRACTED_MESSAGE_UUIDS = 'retracted_message_uuids' as const;
export const KEY_REFUSED_USER_MESSAGE_UUID = 'refused_user_message_uuid' as const;

// Permissions & informational
export const KEY_AGENT_ID = 'agent_id' as const;
export const KEY_DECISION_REASON = 'decision_reason' as const;
export const KEY_DECISION_REASON_TYPE = 'decision_reason_type' as const;
export const KEY_LEVEL = 'level' as const;
export const KEY_PREVENT_CONTINUATION = 'prevent_continuation' as const;
export const KEY_PRIORITY = 'priority' as const;
export const KEY_COLOR = 'color' as const;
export const KEY_TIMEOUT_MS = 'timeout_ms' as const;
export const KEY_KEY = 'key' as const;
export const KEY_SUGGESTION = 'suggestion' as const;

// Session & runtime
export const KEY_STATE = 'state' as const;
export const KEY_STATUS = 'status' as const;
export const KEY_REASON = 'reason' as const;
export const KEY_MODE = 'mode' as const;
export const KEY_NEW_CONVERSATION_ID = 'new_conversation_id' as const;
export const KEY_MEMORIES = 'memories' as const;
export const KEY_COMMANDS = 'commands' as const;
export const KEY_PATH = 'path' as const;
export const KEY_VERSION = 'version' as const;
export const KEY_MCP_SERVER_NAME = 'mcp_server_name' as const;
export const KEY_ELICITATION_ID = 'elicitation_id' as const;
export const KEY_IS_AUTHENTICATING = 'isAuthenticating' as const;

// Transcript mirror key (camelCase on the wire)
export const KEY_PROJECT_KEY = 'projectKey' as const;

/** camelCase twin of {@link KEY_SESSION_ID}, used inside the mirror key object. */
export const KEY_SESSION_ID_CAMEL = 'sessionId' as const;

export const KEY_SUBPATH = 'subpath' as const;

// Slash commands (camelCase on the wire)
export const KEY_ARGUMENT_HINT = 'argumentHint' as const;
export const KEY_ALIASES = 'aliases' as const;

// Thinking
export const KEY_THINKING = 'thinking' as const;
export const KEY_SIGNATURE = 'signature' as const;
export const KEY_DATA = 'data' as const;
export const KEY_ESTIMATED_TOKENS = 'estimated_tokens' as const;
export const KEY_ESTIMATED_TOKENS_DELTA = 'estimated_tokens_delta' as const;

// Partial messages
export const KEY_EVENT = 'event' as const;

// Compaction
export const KEY_COMPACT_METADATA = 'compact_metadata' as const;
export const KEY_TRIGGER = 'trigger' as const;
export const KEY_PRE_TOKENS = 'pre_tokens' as const;
export const KEY_POST_TOKENS = 'post_tokens' as const;
export const KEY_PRESERVED_SEGMENT = 'preserved_segment' as const;
export const KEY_PRESERVED_MESSAGES = 'preserved_messages' as const;
export const KEY_COMPACT_RESULT = 'compact_result' as const;
export const KEY_COMPACT_ERROR = 'compact_error' as const;
export const KEY_ANCHOR_UUID = 'anchor_uuid' as const;
export const KEY_HEAD_UUID = 'head_uuid' as const;
export const KEY_TAIL_UUID = 'tail_uuid' as const;
export const KEY_UUIDS = 'uuids' as const;

// Init handshake (`apiKeySource` and `permissionMode` are camelCase on the wire)
export const KEY_CWD = 'cwd' as const;
export const KEY_API_KEY_SOURCE = 'apiKeySource' as const;
export const KEY_PERMISSION_MODE = 'permissionMode' as const;
export const KEY_CLAUDE_CODE_VERSION = 'claude_code_version' as const;
export const KEY_SLASH_COMMANDS = 'slash_commands' as const;
export const KEY_TERMINAL_SLASH_COMMANDS = 'terminal_slash_commands' as const;
export const KEY_MCP_SERVERS = 'mcp_servers' as const;
export const KEY_OUTPUT_STYLE = 'output_style' as const;
export const KEY_SKILLS = 'skills' as const;
export const KEY_PLUGINS = 'plugins' as const;
export const KEY_AGENTS = 'agents' as const;
export const KEY_BETAS = 'betas' as const;
export const KEY_EFFORT = 'effort' as const;
export const KEY_CAPABILITIES = 'capabilities' as const;

// Context usage
export const KEY_CONTEXT_USAGE = 'context_usage' as const;
export const KEY_RAW_MAX_TOKENS = 'raw_max_tokens' as const;
export const KEY_PERCENTAGE = 'percentage' as const;
export const KEY_OVER_LIMIT = 'over_limit' as const;
export const KEY_TOKENS_OVER = 'tokens_over' as const;
export const KEY_KIND = 'kind' as const;
export const KEY_CATEGORIES = 'categories' as const;
export const KEY_MCP_TOOLS = 'mcp_tools' as const;
export const KEY_MEMORY_FILES = 'memory_files' as const;
export const KEY_TOKENS = 'tokens' as const;
export const KEY_SERVER_NAME = 'server_name' as const;
export const KEY_AGENT_TYPE = 'agent_type' as const;
export const KEY_SOURCE = 'source' as const;
export const KEY_PLUGIN_NAME = 'plugin_name' as const;

// Rate limits (camelCase on the wire, inside `rate_limit_info`)
export const KEY_RATE_LIMIT_INFO = 'rate_limit_info' as const;
export const KEY_RATE_LIMIT_TYPE = 'rateLimitType' as const;
export const KEY_RESETS_AT = 'resetsAt' as const;
export const KEY_UTILIZATION = 'utilization' as const;
export const KEY_OVERAGE_STATUS = 'overageStatus' as const;
export const KEY_OVERAGE_RESETS_AT = 'overageResetsAt' as const;
export const KEY_OVERAGE_DISABLED_REASON = 'overageDisabledReason' as const;
export const KEY_IS_USING_OVERAGE = 'isUsingOverage' as const;
export const KEY_OVERAGE_IN_USE = 'overageInUse' as const;

// ── Settings Payload Keys ───────────────────────────────────────────

/** Key of the hooks block inside a `--settings` payload. */
export const SETTINGS_KEY_HOOKS = 'hooks' as const;

/**
 * Discriminator the CLI settings schema requires on every hook entry.
 * The library's `HookEntry` type leaves it optional, so it is injected during
 * serialization of the `--settings` payload.
 */
export const HOOK_ENTRY_TYPE_COMMAND = 'command' as const;

/**
 * Opening brace of a JSON object literal. `settings` accepts both a file path
 * and an inline JSON string, and the two are told apart exactly the way the SDK
 * tells them apart: a trimmed value wrapped in braces is inline JSON, anything
 * else is a path.
 */
export const JSON_OBJECT_PREFIX = '{' as const;

/** Closing brace of a JSON object literal. Pairs with {@link JSON_OBJECT_PREFIX}. */
export const JSON_OBJECT_SUFFIX = '}' as const;

// ── System Prompt Composition ───────────────────────────────────────

/**
 * Marker element for the array form of `systemPrompt`. Everything before it is
 * cacheable prefix, everything after is per-run context.
 *
 * @example
 * ```ts
 * systemPrompt: ['You are a reviewer.', SYSTEM_PROMPT_DYNAMIC_BOUNDARY, `Repo: ${repo}`]
 * ```
 */
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__' as const;

/**
 * Separator used to fold the array form of `systemPrompt` into the single value
 * `--system-prompt` takes. {@link SYSTEM_PROMPT_DYNAMIC_BOUNDARY} is dropped
 * before the join — the CLI has no cache-boundary flag, so leaving the marker
 * in would hand it to the model as literal prompt text.
 */
export const SYSTEM_PROMPT_SEPARATOR = '\n\n' as const;

// ── Resume Guards ───────────────────────────────────────────────────

/**
 * Prefix of the CLI's refusal when `--resume-drops-turn` does not match the
 * turn being discarded. Deterministic — route to a rewind path, never retry.
 */
export const RESUME_REJECTED_PREFIX = 'Resume rejected by --resume-drops-turn:' as const;

// ── Beta Headers ────────────────────────────────────────────────────

export const BETA_CONTEXT_1M = 'context-1m-2025-08-07' as const;

// ── Error Class Names ───────────────────────────────────────────────

export const ERR_NAME_BASE = 'KraubeKonnektorError' as const;
export const ERR_NAME_NOT_FOUND = 'CliNotFoundError' as const;
export const ERR_NAME_EXECUTION = 'CliExecutionError' as const;
export const ERR_NAME_TIMEOUT = 'CliTimeoutError' as const;
export const ERR_NAME_PARSE = 'ParseError' as const;
export const ERR_NAME_VALIDATION = 'ValidationError' as const;

// ── Error Messages ──────────────────────────────────────────────────

/** Rejection message used when an `AbortSignal` cancels a run. */
export const ABORT_MESSAGE = 'Query aborted' as const;

/** Fallback text for an `error` stream line that carries neither `message` nor `error`. */
export const UNKNOWN_ERROR_MESSAGE = 'Unknown error' as const;

// ── Default Values ──────────────────────────────────────────────────

export const DEFAULT_EXECUTABLE = 'claude' as const;
export const DEFAULT_MODEL = 'sonnet' as const;
export const DEFAULT_TIMEOUT_MS = 600_000;
export const DEFAULT_INIT_TIMEOUT_MS = 120_000;

/**
 * How often an aborted SDK turn is re-interrupted, and how many times.
 *
 * A cancel that lands before the CLI picks the turn up has nothing to
 * interrupt, so one call is not enough — see `startCancelRetries`.
 */
// ── SDK Protocol Vocabulary ─────────────────────────────────────────

/**
 * Legacy spelling of "give me every default tool", from the days when `tools`
 * was CLI-shaped. The SDK wants `{ type: 'preset', preset: 'claude_code' }`.
 */
export const TOOLS_PRESET_SENTINEL = 'default' as const;

/** The `{ type: 'preset' }` object both `tools` and `systemPrompt` use. */
export const PRESET_TYPE = 'preset' as const;
export const PRESET_CLAUDE_CODE = 'claude_code' as const;

/** Settings keys the flag layer understands, as `applyFlagSettings()` spells them. */
export const SETTINGS_EFFORT_LEVEL = 'effortLevel' as const;
export const SETTINGS_FALLBACK_MODEL = 'fallbackModel' as const;
export const SETTINGS_PERMISSIONS = 'permissions' as const;

/** Sub-keys of `Settings.permissions` a per-query override writes. */
export const PERMISSIONS_ALLOW = 'allow' as const;
export const PERMISSIONS_DENY = 'deny' as const;
export const PERMISSIONS_ADDITIONAL_DIRECTORIES = 'additionalDirectories' as const;

/** Session state that closes a post-result drain — the SDK's turn-over signal. */
export const SESSION_STATE_IDLE = 'idle' as const;

export const CANCEL_RETRY_INTERVAL_MS = 250;
export const CANCEL_RETRY_LIMIT = 20;
export const DEFAULT_MAX_BUFFER_BYTES = 100 * 1024 * 1024; // 100 MB

// ── SDK Usage-Limit Prefixes ────────────────────────────────────────

/** Shape of the lazily-loaded SDK module, for type positions only. */
type SdkModule = typeof import('@anthropic-ai/claude-agent-sdk');

/**
 * The four prefix tables the SDK publishes for bucketing the rate-limit text
 * this library surfaces as `StreamRateLimitEvent`. Keyed by their SDK names so
 * a destructure reads exactly like the SDK's own import.
 */
export interface UsageLimitPrefixes {
  /** The message says the account is out of usage — a hard stop, not a warning. */
  readonly USAGE_LIMIT_ERROR_PREFIXES: SdkModule['USAGE_LIMIT_ERROR_PREFIXES'];

  /** The message warns that a limit is approaching; the run continues. */
  readonly USAGE_WARNING_PREFIXES: SdkModule['USAGE_WARNING_PREFIXES'];

  /** The message announces a switch to a different allocation, e.g. extra usage. */
  readonly USAGE_TRANSITION_PREFIXES: SdkModule['USAGE_TRANSITION_PREFIXES'];

  /** The message reports an org policy block rather than an exhausted budget. */
  readonly ORG_POLICY_LIMIT_PREFIXES: SdkModule['ORG_POLICY_LIMIT_PREFIXES'];
}

/**
 * Resolve the SDK's usage-limit prefix tables.
 *
 * They are SDK **runtime** values, not literals, so they are fetched through a
 * dynamic `import()` instead of being re-exported from this module. Every other
 * SDK reference in this package is either type-only or lazily imported; a static
 * re-export here would make this the one eager one, and because nearly every
 * module imports `constants.ts`, it would drag the whole SDK module graph into
 * CLI-mode consumers and the `bin/` entry point — which today never load it, and
 * which keep working when the SDK install is broken. Copying the 22 literals by
 * hand was the other option and guarantees drift, so the cost is paid here: one
 * `await` at the call site.
 *
 * @returns The four tables, exactly as the installed SDK declares them.
 *
 * @example
 * ```ts
 * const { USAGE_LIMIT_ERROR_PREFIXES } = await getUsageLimitPrefixes()
 * const isHardStop = USAGE_LIMIT_ERROR_PREFIXES.some((p) => message.startsWith(p))
 * ```
 */
export async function getUsageLimitPrefixes(): Promise<UsageLimitPrefixes> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return {
    USAGE_LIMIT_ERROR_PREFIXES: sdk.USAGE_LIMIT_ERROR_PREFIXES,
    USAGE_WARNING_PREFIXES: sdk.USAGE_WARNING_PREFIXES,
    USAGE_TRANSITION_PREFIXES: sdk.USAGE_TRANSITION_PREFIXES,
    ORG_POLICY_LIMIT_PREFIXES: sdk.ORG_POLICY_LIMIT_PREFIXES,
  };
}
