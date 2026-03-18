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

export const FORMAT_JSON = 'json' as const;
export const FORMAT_STREAM_JSON = 'stream-json' as const;

// ── Permission Modes ────────────────────────────────────────────────

export const PERMISSION_DEFAULT = 'default' as const;
export const PERMISSION_ACCEPT_EDITS = 'acceptEdits' as const;
export const PERMISSION_PLAN = 'plan' as const;
export const PERMISSION_DONT_ASK = 'dontAsk' as const;
export const PERMISSION_BYPASS = 'bypassPermissions' as const;
export const PERMISSION_AUTO = 'auto' as const;

export const VALID_PERMISSION_MODES = [
  PERMISSION_DEFAULT,
  PERMISSION_ACCEPT_EDITS,
  PERMISSION_PLAN,
  PERMISSION_DONT_ASK,
  PERMISSION_BYPASS,
  PERMISSION_AUTO,
] as const;

// ── Effort Levels ───────────────────────────────────────────────────

export const EFFORT_LOW = 'low' as const;
export const EFFORT_MEDIUM = 'medium' as const;
export const EFFORT_HIGH = 'high' as const;
export const EFFORT_MAX = 'max' as const;

export const VALID_EFFORT_LEVELS = [
  EFFORT_LOW,
  EFFORT_MEDIUM,
  EFFORT_HIGH,
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

// ── MCP Transport Types ─────────────────────────────────────────────

export const MCP_STDIO = 'stdio' as const;
export const MCP_HTTP = 'http' as const;
export const MCP_SSE = 'sse' as const;

// ── Chat Protocol ───────────────────────────────────────────────────

export const CHAT_USER_MESSAGE = 'user_message' as const;

// ── Task Event Types ────────────────────────────────────────────────

export const EVENT_TASK_STARTED = 'task_started' as const;
export const EVENT_TASK_PROGRESS = 'task_progress' as const;
export const EVENT_TASK_NOTIFICATION = 'task_notification' as const;
export const EVENT_RATE_LIMIT = 'rate_limit' as const;
export const SDK_RATE_LIMIT_EVENT = 'rate_limit_event' as const;

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

// Flags that take a value argument (used by extractPrompt in SDK executor)
export const FLAGS_WITH_VALUE = [
  FLAG_OUTPUT_FORMAT, FLAG_MODEL, FLAG_FALLBACK_MODEL, FLAG_PERMISSION_MODE,
  FLAG_SYSTEM_PROMPT, FLAG_APPEND_SYSTEM_PROMPT, FLAG_MAX_TURNS, FLAG_MAX_BUDGET,
  FLAG_ADD_DIR, FLAG_MCP_CONFIG, FLAG_AGENTS, FLAG_JSON_SCHEMA, FLAG_WORKTREE,
  FLAG_RESUME, FLAG_SESSION_ID, FLAG_ALLOWED_TOOLS, FLAG_DISALLOWED_TOOLS,
  FLAG_AGENT, FLAG_TOOLS, FLAG_NAME, FLAG_SETTINGS, FLAG_EFFORT,
  FLAG_INPUT_FORMAT,
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
export const KEY_INPUT = 'input' as const;
export const KEY_ERROR = 'error' as const;
export const KEY_CODE = 'code' as const;
export const KEY_MODEL = 'model' as const;
export const KEY_TOOLS = 'tools' as const;
export const KEY_SUBTYPE = 'subtype' as const;

// ── Error Class Names ───────────────────────────────────────────────

export const ERR_NAME_BASE = 'ClaudeConnectorError' as const;
export const ERR_NAME_NOT_FOUND = 'CliNotFoundError' as const;
export const ERR_NAME_EXECUTION = 'CliExecutionError' as const;
export const ERR_NAME_TIMEOUT = 'CliTimeoutError' as const;
export const ERR_NAME_PARSE = 'ParseError' as const;
export const ERR_NAME_VALIDATION = 'ValidationError' as const;

// ── Default Values ──────────────────────────────────────────────────

export const DEFAULT_EXECUTABLE = 'claude' as const;
export const DEFAULT_MODEL = 'sonnet' as const;
export const DEFAULT_TIMEOUT_MS = 600_000;
export const DEFAULT_INIT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_BUFFER_BYTES = 100 * 1024 * 1024; // 100 MB
