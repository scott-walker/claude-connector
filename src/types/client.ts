import type {
  PERMISSION_DEFAULT,
  PERMISSION_ACCEPT_EDITS,
  PERMISSION_PLAN,
  PERMISSION_DONT_ASK,
  PERMISSION_BYPASS,
  PERMISSION_AUTO,
  PERMISSION_MANUAL,
  EFFORT_LOW,
  EFFORT_MEDIUM,
  EFFORT_HIGH,
  EFFORT_XHIGH,
  EFFORT_MAX,
  MCP_STDIO,
  MCP_HTTP,
  MCP_SSE,
  MCP_SDK,
  MCP_CLAUDEAI_PROXY,
  BETA_CONTEXT_1M,
} from '../constants.js';
import type { HookEvent, HookCallbackMatcher, HooksConfig } from './hooks.js';
import type { SessionStore, SessionStoreFlush } from './session.js';
import type { Settings } from './settings.js';
import type { Readable, Writable } from 'node:stream';

/**
 * Configuration for the Claude client instance.
 *
 * Options set here act as defaults for all queries made through this client.
 * Per-query overrides are available via {@link QueryOptions}.
 */
export interface ClientOptions {
  /**
   * Path to the Claude Code CLI executable.
   * Defaults to 'claude' (resolved from PATH).
   *
   * **Not** the JS runtime — see {@link ClientOptions.runtime} for that.
   *
   * Useful when multiple CLI versions are installed:
   * @example
   * ```ts
   * new Claude({ executable: '/usr/local/bin/claude-2.0' })
   * ```
   */
  readonly executable?: string;

  /**
   * JS runtime used to run Claude Code. Defaults to the runtime that loaded
   * this library. SDK mode only.
   *
   * Distinct from {@link ClientOptions.executable}, which is the path to the
   * CLI bundle itself.
   *
   * @example
   * ```ts
   * new Claude({ runtime: 'bun' })
   * ```
   */
  readonly runtime?: 'bun' | 'deno' | 'node';

  /**
   * Extra argv passed to the JS runtime (not to Claude Code). SDK mode only.
   *
   * @example
   * ```ts
   * new Claude({ runtime: 'node', runtimeArgs: ['--max-old-space-size=8192'] })
   * ```
   */
  readonly runtimeArgs?: readonly string[];

  /**
   * Use the Claude Agent SDK (V2) instead of spawning CLI processes.
   * **Defaults to `true`.**
   *
   * Creates a persistent SDK session that stays warm.
   * First query requires initialization (~5-10s), but subsequent queries
   * are near-instant. Call `claude.init()` to warm up explicitly,
   * or let it auto-initialize on the first query.
   *
   * Set to `false` to use CLI mode (each query spawns a new process).
   *
   * Subscribe to initialization events:
   * ```ts
   * claude.on('init:stage', (stage, msg) => console.log(stage, msg))
   * claude.on('init:ready', () => console.log('Ready!'))
   * ```
   */
  readonly useSdk?: boolean;

  /**
   * Working directory for Claude Code operations.
   * Defaults to `process.cwd()`.
   */
  readonly cwd?: string;

  /** Model identifier: 'opus', 'sonnet', 'haiku', or a full model ID. */
  readonly model?: string;

  /** Thinking depth: 'low' | 'medium' | 'high' | 'xhigh' | 'max'. */
  readonly effortLevel?: EffortLevel;

  /**
   * Model(s) to fall back to if the primary model fails.
   * An array is tried in order (emitted as a comma-separated `--fallback-model`).
   */
  readonly fallbackModel?: string | readonly string[];

  /**
   * Permission mode controlling tool approval behavior.
   *
   * - `'default'`            — prompt on first use
   * - `'manual'`             — CLI spelling of `'default'`
   * - `'acceptEdits'`        — auto-accept file edits
   * - `'plan'`               — read-only, no modifications
   * - `'dontAsk'`            — never prompt, deny what is not pre-approved
   * - `'auto'`               — let the CLI decide per tool
   * - `'bypassPermissions'`  — skip all checks (dangerous)
   */
  readonly permissionMode?: PermissionMode;

  /**
   * Replace the body of the built-in plan-mode workflow.
   * Only applies while `permissionMode` is `'plan'`.
   */
  readonly planModeInstructions?: string;

  /** Tools that are auto-approved without prompting. Supports glob patterns. */
  readonly allowedTools?: readonly string[];

  /** Tools that are always denied. */
  readonly disallowedTools?: readonly string[];

  /**
   * Override the entire system prompt.
   *
   * An array is sent as a block list: include `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`
   * as a standalone element to split the cacheable static prefix from the
   * session-specific suffix.
   *
   * The block list is what SDK mode sends. CLI mode has one `--system-prompt`
   * value, so the array is folded into it with blank lines between the blocks
   * and the boundary element dropped — the prompt text is the same, the extra
   * cache breakpoint is not.
   *
   * @example
   * ```ts
   * import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from '@scottwalker/kraube-konnektor'
   *
   * new Claude({
   *   systemPrompt: [houseRules, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, `Repo: ${repo}`],
   * })
   * ```
   */
  readonly systemPrompt?: string | readonly string[];

  /** Append text to the default system prompt. */
  readonly appendSystemPrompt?: string;

  /**
   * Read the system prompt from a file instead of passing it through argv.
   * CLI mode only — the SDK takes the prompt text itself, so read the file and
   * pass {@link ClientOptions.systemPrompt} in SDK mode.
   */
  readonly systemPromptFile?: string;

  /**
   * Read the system-prompt suffix from a file instead of passing it through
   * argv. CLI mode only — see {@link ClientOptions.appendSystemPrompt} for the
   * SDK-mode spelling.
   */
  readonly appendSystemPromptFile?: string;

  /** Append one instruction to the system prompt of every subagent. CLI mode only. */
  readonly appendSubagentSystemPrompt?: string;

  /**
   * Move working directory, environment, memory paths and git status out of the
   * system prompt and into the first user message, so the prompt prefix stays
   * static and cacheable across users. Ignored when `systemPrompt` is set.
   *
   * Maps to the preset object's `excludeDynamicSections` in SDK mode and to
   * `--exclude-dynamic-system-prompt-sections` in CLI mode.
   */
  readonly excludeDynamicSystemPromptSections?: boolean;

  /** Maximum number of agentic turns per query. */
  readonly maxTurns?: number;

  /** Maximum spend in USD per query. */
  readonly maxBudget?: number;

  /**
   * Token budget for the turn. The model is told how much of it is left so it
   * can pace tool use and wrap up before the limit.
   *
   * The token-side sibling of {@link ClientOptions.maxBudget} (USD).
   *
   * @alpha
   */
  readonly taskBudgetTokens?: number;

  /**
   * Compaction threshold: `'auto'`, a token count (`200000`), or a shorthand
   * string (`'500k'`). Accepted range is 100k–1M. CLI mode only — the SDK
   * exposes no equivalent option.
   */
  readonly autocompact?: 'auto' | number | string;

  /** Additional working directories to include. */
  readonly additionalDirs?: readonly string[];

  /**
   * Path(s) to MCP config JSON files. CLI mode only — the SDK takes servers
   * inline, so `validateClientOptions` rejects this unless `useSdk: false`.
   * Use {@link ClientOptions.mcpServers} in SDK mode.
   */
  readonly mcpConfig?: string | readonly string[];

  /** Inline MCP server definitions. Supports SDK in-process servers. */
  readonly mcpServers?: Readonly<Record<string, McpServerConfig | McpSdkServerConfig>>;

  /** Custom subagent definitions. */
  readonly agents?: Readonly<Record<string, AgentConfig>>;

  /**
   * Lifecycle hooks, as shell commands.
   *
   * Honoured in both modes: hooks live in the CLI's settings schema, so they are
   * folded into the settings payload either way — `--settings` in CLI mode, the
   * SDK's `settings` option in SDK mode. A `settings` **path** is the exception:
   * a path and an inline object cannot share one flag, so put the hooks in that
   * file instead.
   *
   * For in-process JS callbacks use {@link ClientOptions.hookCallbacks}.
   */
  readonly hooks?: Readonly<HooksConfig>;

  /**
   * Lifecycle hook callbacks, as JS functions. SDK mode only: they run
   * in-process over the control protocol, which CLI mode has no channel for —
   * use the shell-command {@link ClientOptions.hooks} there.
   *
   * All 33 hook event types are supported — see {@link HookEvent}.
   *
   * @example
   * ```ts
   * new Claude({
   *   hookCallbacks: {
   *     PreToolUse: [{
   *       matcher: 'Bash',
   *       hooks: [async (input) => ({ continue: true })],
   *     }],
   *   },
   * })
   * ```
   */
  readonly hookCallbacks?: Partial<Record<HookEvent, readonly HookCallbackMatcher[]>>;

  /**
   * Emit `hook_started` / `hook_progress` / `hook_response` stream events.
   * Without this the SDK and CLI never send them, so the corresponding
   * `EVENT_HOOK_*` events never fire.
   *
   * In CLI mode requires stream-json output.
   */
  readonly includeHookEvents?: boolean;

  /**
   * Custom permission handler for controlling tool usage.
   * Called before each tool execution to determine if it should be allowed.
   * SDK mode only — see {@link ClientOptions.permissionPromptToolName} for the
   * CLI-mode counterpart.
   *
   * @example
   * ```ts
   * new Claude({
   *   canUseTool: async (toolName, input, { signal }) => {
   *     if (toolName === 'Bash' && String(input.command).includes('rm -rf'))
   *       return { behavior: 'deny', message: 'Dangerous command blocked' }
   *     return { behavior: 'allow' }
   *   },
   * })
   * ```
   */
  readonly canUseTool?: CanUseTool;

  /**
   * Name of the MCP tool that answers permission prompts.
   * The programmatic alternative to {@link ClientOptions.canUseTool}: works in
   * both modes and is the only way to answer an `ask` decision in CLI mode.
   * Use together with `mcpConfig` / `mcpServers`.
   */
  readonly permissionPromptToolName?: string;

  /**
   * Controls Claude's thinking/reasoning behavior.
   *
   * - `{ type: 'adaptive' }` — Claude decides when and how much to think
   * - `{ type: 'enabled', budgetTokens: number }` — fixed token budget
   * - `{ type: 'disabled' }` — no extended thinking
   */
  readonly thinking?: ThinkingConfig;

  /**
   * Fixed thinking-token budget.
   *
   * @deprecated Use {@link ClientOptions.thinking} instead; `thinking` wins when
   * both are set.
   */
  readonly maxThinkingTokens?: number;

  /**
   * Enable file checkpointing to track file changes during the session.
   * When enabled, files can be rewound using `claude.rewindFiles()`.
   * SDK mode only.
   */
  readonly enableFileCheckpointing?: boolean;

  /**
   * Callback for handling MCP elicitation requests.
   * Called when an MCP server requests user input. SDK mode only.
   */
  readonly onElicitation?: OnElicitation;

  /**
   * Callback for host-rendered blocking dialogs (e.g. a refusal fallback
   * prompt). SDK mode only.
   *
   * Required whenever {@link ClientOptions.supportedDialogKinds} is non-empty —
   * the SDK throws at option intake otherwise, and the CLI fails closed on an
   * absent handler.
   */
  readonly onUserDialog?: OnUserDialog;

  /**
   * Dialog kinds this host can render. Declaring a kind makes the CLI send it;
   * anything not listed is resolved with the dialog's default behavior.
   * Requires {@link ClientOptions.onUserDialog}, and therefore SDK mode only.
   */
  readonly supportedDialogKinds?: readonly string[];

  /** Extra environment variables passed to the CLI process. */
  readonly env?: Readonly<Record<string, string>>;

  /**
   * Disable session persistence (useful for CI/automation).
   * Mutually exclusive with {@link ClientOptions.sessionStore}.
   */
  readonly noSessionPersistence?: boolean;

  /**
   * Mirror the transcript into a custom store instead of (only) the local
   * session file. SDK mode only.
   *
   * @alpha
   */
  readonly sessionStore?: SessionStore;

  /**
   * When the mirrored transcript is flushed: `'batched'` (default, one write per
   * turn) or `'eager'` (one write per message). SDK mode only.
   *
   * @alpha
   */
  readonly sessionStoreFlush?: SessionStoreFlush;

  /**
   * Timeout in milliseconds for the initial `sessionStore.load()`.
   * Default: 60000. SDK mode only.
   *
   * @alpha
   */
  readonly sessionStoreLoadTimeoutMs?: number;

  /**
   * Resume an existing session by ID for the whole client.
   * Mutually exclusive with {@link ClientOptions.continueSession} unless
   * {@link ClientOptions.forkSession} is also set.
   */
  readonly resume?: string;

  /**
   * Pin the session ID of a new session. Must be a valid UUID.
   * Cannot be combined with `resume` / `continueSession` unless `forkSession`
   * is set.
   */
  readonly sessionId?: string;

  /** Continue the most recent session in `cwd`. Mutually exclusive with `resume`. */
  readonly continueSession?: boolean;

  /** Branch the resumed session into a new one instead of appending to it. */
  readonly forkSession?: boolean;

  /**
   * Chain-entry UUID: resume only up to and including this message.
   * The transcript-side half of `rewindFiles()`.
   */
  readonly resumeSessionAt?: string;

  /**
   * Prompt UUID of the turn a truncating resume intends to discard.
   * The CLI validates it and refuses with a message starting
   * `RESUME_REJECTED_PREFIX` — a refusal is deterministic, so route it to a
   * rewind-recovery path instead of retrying.
   */
  readonly resumeDropsTurn?: string;

  /**
   * Abort controller for the whole session. Aborting it tears the session down;
   * for a single query use {@link QueryOptions.signal}. SDK mode only — CLI
   * mode has no session to tear down, so use `claude.abort()` or a per-query
   * signal there.
   */
  readonly abortController?: AbortController;

  /**
   * Select a specific preconfigured agent for the session.
   * Overrides the default agent. Use with `agents` to define agents inline.
   */
  readonly agent?: string;

  /**
   * Restrict the set of built-in tools available to Claude.
   * Pass `{ type: 'preset', preset: 'claude_code' }` for all default tools,
   * `[]` to disable all, or specific names.
   *
   * **Different from `allowedTools`**: `tools` limits which tools *exist*,
   * while `allowedTools` controls which tools are *auto-approved*.
   *
   * The list form works in both modes; the `{ type: 'preset' }` form has no CLI
   * spelling and is dropped from argv, since omitting `--tools` already means
   * "every default tool".
   */
  readonly tools?: readonly string[] | ToolsPresetConfig;

  /**
   * Redirect built-in tools to MCP tools, e.g. `{ Bash: 'mcp__workspace__bash' }`.
   * Single-hop only — an alias target is never itself re-aliased.
   * Useful when the host runs tools in its own sandbox or container.
   * SDK mode only — the binary has no flag for it.
   */
  readonly toolAliases?: Readonly<Record<string, string>>;

  /** Per-tool configuration for built-in tools. SDK mode only. */
  readonly toolConfig?: ToolConfig;

  /**
   * Skills to load, by name, or `'all'`.
   * The only supported way to enable skills — passing `'Skill'` in
   * `allowedTools` is deprecated. SDK mode only.
   *
   * @example
   * ```ts
   * new Claude({ skills: ['pdf', 'docx'] })
   * ```
   */
  readonly skills?: readonly string[] | 'all';

  /** Disable every slash command (and therefore every skill). CLI mode only. */
  readonly disableSlashCommands?: boolean;

  /**
   * Run tool calls inside the OS sandbox, with an egress allowlist and
   * credential masking. SDK mode only — the binary reads its sandbox settings
   * from a settings file, so use `settings` in CLI mode.
   */
  readonly sandbox?: SandboxConfig;

  /** Display name for the session (shown in /resume and terminal title). */
  readonly name?: string;

  /** Only use MCP servers from `mcpConfig`, ignoring all other MCP configurations. */
  readonly strictMcpConfig?: boolean;

  /**
   * Enable beta features.
   * Currently supported: `'context-1m-2025-08-07'` (1M token context).
   */
  readonly betas?: readonly SdkBeta[];

  /**
   * Enable periodic AI-generated progress summaries for subagents.
   * SDK mode only.
   */
  readonly agentProgressSummaries?: boolean;

  /**
   * Forward subagent text and thinking blocks as regular messages carrying
   * `parent_tool_use_id`, so the nested transcript can be rendered.
   *
   * In CLI mode requires stream-json output.
   */
  readonly forwardSubagentText?: boolean;

  /**
   * Declare that the host renders a per-task stop control wired to
   * `claude.stopTask(taskId)`. Without it a stop request interrupts the whole
   * turn instead of a single background task. SDK mode only — `stopTask()`
   * itself is an SDK control request, and the binary has no flag for it.
   */
  readonly perTaskStopAffordance?: boolean;

  /**
   * Include partial/streaming message events.
   * When true, text deltas are emitted during streaming.
   *
   * In CLI mode requires stream-json output.
   */
  readonly includePartialMessages?: boolean;

  /**
   * Enable prompt suggestions after each turn.
   */
  readonly promptSuggestions?: boolean;

  /**
   * Replay each user message back on the stream as it is accepted.
   * CLI mode only, and only with stream-json input *and* output.
   */
  readonly replayUserMessages?: boolean;

  /**
   * Enable the `SendUserMessage` tool so the agent can push a message
   * mid-run instead of only at the result. CLI mode only.
   */
  readonly brief?: boolean;

  /**
   * Enable debug logging.
   * Pass a string to filter categories, e.g. `'api,hooks'` or `'!1p,!file'`.
   */
  readonly debug?: boolean | string;

  /**
   * Write debug logs to a file. Implies debug: true.
   */
  readonly debugFile?: string;

  /**
   * Callback for stderr output from the Claude Code process.
   * Useful for production monitoring and logging. SDK mode only.
   *
   * @example
   * ```ts
   * new Claude({
   *   stderr: (data) => logger.warn('[claude stderr]', data),
   * })
   * ```
   */
  readonly stderr?: (data: string) => void;

  /**
   * Must be set to `true` when using `permissionMode: 'bypassPermissions'`.
   * This is a safety measure to ensure intentional bypassing of permissions.
   */
  readonly allowDangerouslySkipPermissions?: boolean;

  /**
   * Skip every permission check for the whole run — the always-on form of
   * `permissionMode: 'bypassPermissions'`. CLI mode only, and dangerous.
   */
  readonly dangerouslySkipPermissions?: boolean;

  /**
   * Disable CLAUDE.md, skills, plugins, hooks, MCP servers, custom
   * commands/agents and output styles, and set `CLAUDE_CODE_SAFE_MODE=1`.
   * Makes a run independent of whatever the host machine's `~/.claude` holds.
   * CLI mode only — in effect mutually exclusive with `hooks`, `agents` and
   * `mcpServers`.
   */
  readonly safeMode?: boolean;

  /**
   * Embedded mode: skip hooks, LSP, plugin sync, attribution, auto-memory,
   * keychain reads and CLAUDE.md auto-discovery, and set `CLAUDE_CODE_SIMPLE=1`.
   * Auth is restricted to `ANTHROPIC_API_KEY` / `apiKeyHelper`. CLI mode only.
   */
  readonly bare?: boolean;

  /**
   * Control which filesystem settings to load.
   *
   * - `'user'`    — Global settings (`~/.claude/settings.json`)
   * - `'project'` — Project settings (`.claude/settings.json`)
   * - `'local'`   — Local settings (`.claude/settings.local.json`)
   *
   * **Important**: When omitted, SDK mode runs in isolation — no settings files
   * are loaded and **CLAUDE.md files are not read**. Include `'project'` to load
   * project instructions. CLI mode keeps its own default (all three tiers) until
   * this option names the tiers explicitly.
   *
   * An empty array is a request, not a no-op: both modes emit it and get full
   * isolation.
   *
   * @example
   * ```ts
   * // Load project settings + CLAUDE.md
   * new Claude({ settingSources: ['user', 'project'] })
   *
   * // Full isolation (default SDK behavior)
   * new Claude({ settingSources: [] })
   * ```
   */
  readonly settingSources?: readonly SettingSource[];

  /**
   * Additional settings to apply.
   * Accepts either a path to a settings JSON file or an inline settings object.
   * Loaded into the "flag settings" layer (highest priority).
   *
   * The {@link Settings} form is typed against the SDK schema; the plain record
   * form stays as an escape hatch for keys the schema does not model yet.
   *
   * @example
   * ```ts
   * // Inline permissions
   * new Claude({
   *   settings: {
   *     permissions: { allow: ['Bash(npm test)', 'Read(*)'] },
   *     model: 'claude-sonnet-4-6',
   *   },
   * })
   *
   * // Path to file
   * new Claude({ settings: '/path/to/settings.json' })
   * ```
   */
  readonly settings?: string | Settings | Readonly<Record<string, unknown>>;

  /**
   * Policy-tier settings, as handed down by a spawning parent.
   * Filtered restrictive-only: they can tighten the effective settings but
   * never loosen them. SDK mode only.
   */
  readonly managedSettings?: Settings | Readonly<Record<string, unknown>>;

  /**
   * Load plugins for this session. Plugins provide custom commands,
   * agents, skills, and hooks.
   *
   * @example
   * ```ts
   * new Claude({
   *   plugins: [
   *     { type: 'local', path: './my-plugin' },
   *     { type: 'url', url: 'https://example.com/plugin.tar.gz' },
   *   ],
   * })
   * ```
   */
  readonly plugins?: readonly PluginConfig[];

  /**
   * Custom function to spawn the Claude Code process.
   * Use this to run Claude Code in VMs, containers, or remote environments.
   * SDK mode only.
   *
   * @example
   * ```ts
   * new Claude({
   *   spawnClaudeCodeProcess: (options) => {
   *     // options: { command, args, cwd, env, signal }
   *     return myDockerProcess; // Must satisfy SpawnedProcess interface
   *   },
   * })
   * ```
   */
  readonly spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess;

  /**
   * Raw CLI flags this wrapper does not model yet, as `{ flag: value }`.
   * A `null` value emits a boolean flag. Keys are written without the leading
   * `--`. The escape hatch of last resort.
   *
   * Honoured in both modes: CLI mode appends the pairs to argv, and the SDK
   * forwards them verbatim to the same binary. That makes it the way to reach a
   * flag-only option — one the SDK models no option for — from SDK mode.
   *
   * @example
   * ```ts
   * new Claude({ extraArgs: { 'some-new-flag': null, 'another': 'value' } })
   *
   * // A CLI-mode-only option, reached from SDK mode:
   * new Claude({ extraArgs: { 'system-prompt-file': './prompt.md' } })
   * ```
   */
  readonly extraArgs?: Readonly<Record<string, string | null>>;

  /**
   * Timeout for SDK initialization in milliseconds.
   * Default: 120000 (2 minutes). SDK mode only.
   */
  readonly initTimeoutMs?: number;

  /**
   * How long to keep reading after a turn's `result` message, in milliseconds.
   * SDK mode only.
   *
   * `result` is not the last frame of a turn — `prompt_suggestion`, a trailing
   * `task_notification` and `session_state_changed` follow it — so the turn
   * drains what comes next before ending. `session_state_changed: 'idle'`
   * closes the window early, whatever this is set to.
   *
   * Default `0`: one event-loop turn, which picks up frames the transport has
   * already delivered and costs no measurable latency. Raise it when you rely
   * on `prompt_suggestion`, which the session produces with a separate model
   * call and can therefore arrive well after the result.
   *
   * @example
   * ```ts
   * const claude = new Claude({ promptSuggestions: true, postResultDrainMs: 250 })
   * ```
   */
  readonly postResultDrainMs?: number;

  /**
   * JSON Schema for structured output.
   * All responses will be validated JSON matching this schema.
   *
   * In SDK mode, this is set once at session initialization.
   * In CLI mode, this is passed as `--json-schema` to every query.
   *
   * For per-query schema overrides, use {@link QueryOptions.schema}.
   *
   * @example
   * ```ts
   * const claude = new Claude({
   *   schema: {
   *     type: 'object',
   *     properties: {
   *       endpoints: { type: 'array', items: { type: 'string' } },
   *     },
   *     required: ['endpoints'],
   *   },
   * })
   * ```
   */
  readonly schema?: Record<string, unknown>;
}

/**
 * Per-query options that override client defaults.
 *
 * Any field set here takes precedence over the corresponding {@link ClientOptions} field
 * for the duration of a single query.
 *
 * ## How far an override reaches
 *
 * CLI mode rebuilds argv for every query, so every field below that has a flag
 * takes effect there. SDK mode opens one persistent session when the client is
 * constructed, so only what a control request can change mid-turn is bridged —
 * applied before the turn, put back after it: `model`, `permissionMode`,
 * `thinking`, `effortLevel`, `fallbackModel`, `allowedTools`, `disallowedTools`
 * and `additionalDirs`. `systemPrompt` is prepended to the prompt text instead,
 * the session's own prompt being fixed.
 *
 * The rest — `cwd`, `env`, `input`, `planModeInstructions`,
 * `appendSystemPrompt`, `systemPromptFile`, `appendSystemPromptFile`,
 * `maxTurns`, `maxBudget`, `taskBudgetTokens`, `schema`, `worktree`, `agent`,
 * `tools` and `files` — is fixed at session construction in SDK mode and is
 * therefore ignored per query. Set those on {@link ClientOptions}, or run the
 * query with `useSdk: false`. `skills` and `background` are inert per query in
 * both modes; each says so below.
 */
export interface QueryOptions {
  /** Override working directory for this query. Ignored in SDK mode. */
  readonly cwd?: string;

  /** Override model for this query. Bridged in both modes. */
  readonly model?: string;

  /** Override the fallback model(s) for this query. Bridged in both modes. */
  readonly fallbackModel?: string | readonly string[];

  /** Override effort level for this query. Bridged in both modes. */
  readonly effortLevel?: EffortLevel;

  /** Override permission mode for this query. Bridged in both modes. */
  readonly permissionMode?: PermissionMode;

  /** Override the plan-mode workflow body for this query. Ignored in SDK mode. */
  readonly planModeInstructions?: string;

  /** Override allowed tools for this query. Bridged in both modes. */
  readonly allowedTools?: readonly string[];

  /** Override disallowed tools for this query. Bridged in both modes. */
  readonly disallowedTools?: readonly string[];

  /**
   * Override system prompt for this query.
   *
   * CLI mode emits it as `--system-prompt`; SDK mode cannot replace the running
   * session's prompt, so it is prepended to this turn's prompt text instead.
   */
  readonly systemPrompt?: string;

  /** Append to system prompt for this query. Ignored in SDK mode. */
  readonly appendSystemPrompt?: string;

  /** Read this query's system prompt from a file. CLI mode only. */
  readonly systemPromptFile?: string;

  /** Read this query's system-prompt suffix from a file. CLI mode only. */
  readonly appendSystemPromptFile?: string;

  /** Override max turns for this query. Ignored in SDK mode. */
  readonly maxTurns?: number;

  /** Override max budget for this query. Ignored in SDK mode. */
  readonly maxBudget?: number;

  /**
   * Token budget for this query. The model is told how much is left.
   * Ignored in SDK mode.
   *
   * @alpha
   */
  readonly taskBudgetTokens?: number;

  /**
   * Piped input — equivalent to `echo "data" | claude -p "prompt"`.
   * Provides additional context alongside the prompt. CLI mode only: the SDK
   * session has no stdin of its own, so put the data in the prompt there.
   */
  readonly input?: string;

  /**
   * JSON Schema for structured output.
   * Claude will return validated JSON matching this schema.
   * Ignored in SDK mode — set {@link ClientOptions.schema} instead.
   */
  readonly schema?: Record<string, unknown>;

  /**
   * Run in an isolated git worktree.
   * Pass `true` for auto-generated name, or a string for a specific name.
   * Ignored in SDK mode.
   */
  readonly worktree?: boolean | string;

  /** Additional directories for this query. Bridged in both modes. */
  readonly additionalDirs?: readonly string[];

  /** Extra environment variables for this query. Ignored in SDK mode. */
  readonly env?: Readonly<Record<string, string>>;

  /** Override agent for this query. Ignored in SDK mode. */
  readonly agent?: string;

  /**
   * Override available tools for this query.
   * Pass `{ type: 'preset', preset: 'claude_code' }` for all default tools.
   * Ignored in SDK mode; the preset form has no CLI spelling either.
   */
  readonly tools?: readonly string[] | ToolsPresetConfig;

  /**
   * Override the skills loaded for this query.
   *
   * **Inert in both modes.** The binary has no `--skills` flag and the SDK
   * fixes the skill set when the session opens, so nothing carries a per-query
   * value. Set {@link ClientOptions.skills} instead.
   *
   * @deprecated Declared but never wired: no execution path reads it, and no
   * released version ever honoured it. Slated for removal — set
   * {@link ClientOptions.skills} instead.
   */
  readonly skills?: readonly string[] | 'all';

  /**
   * Files-API resources to download into the workspace before the query runs.
   * Each entry is `file_id:relative_path`. CLI mode only.
   *
   * @example
   * ```ts
   * claude.query('Summarise the doc', { files: ['file_abc:doc.txt'] })
   * ```
   */
  readonly files?: readonly string[];

  /**
   * Start this query as a background agent and return immediately.
   *
   * **Inert in both modes.** `--background` cannot be emitted: the binary
   * refuses it together with `--print` ("--bg and --print conflict"), and every
   * argv this library builds is a `--print` run. SDK mode has no spelling for
   * it at all. Use {@link AgentConfig.background} to make a subagent run in the
   * background instead.
   *
   * @deprecated Declared but never wired: no execution path emits it, and no
   * released version ever honoured it. Slated for removal — use
   * {@link AgentConfig.background} for a subagent that runs in the background.
   */
  readonly background?: boolean;

  /**
   * AbortSignal for cancelling this specific query. Honoured in both modes:
   * CLI mode kills the process, SDK mode interrupts the turn and keeps the
   * session usable.
   *
   * More granular than `claude.abort()`, which kills the entire session.
   */
  readonly signal?: AbortSignal;

  /**
   * Override thinking config for this query. Bridged in both modes: CLI mode
   * emits `--thinking` (plus `--max-thinking-tokens` for the budget), SDK mode
   * applies it through the control protocol and restores it afterwards.
   */
  readonly thinking?: ThinkingConfig;
}

// ── Permission types ──────────────────────────────────────────────

export type PermissionMode =
  | typeof PERMISSION_DEFAULT
  | typeof PERMISSION_ACCEPT_EDITS
  | typeof PERMISSION_PLAN
  | typeof PERMISSION_DONT_ASK
  | typeof PERMISSION_BYPASS
  | typeof PERMISSION_AUTO
  | typeof PERMISSION_MANUAL;

export type PermissionBehavior = 'allow' | 'deny' | 'ask';

/**
 * How a permission decision should be remembered.
 *
 * - `'user_temporary'` — allow once, for this call only
 * - `'user_permanent'` — allow and persist a rule
 * - `'user_reject'`    — the user actively refused
 */
export type PermissionDecisionClassification =
  | 'user_temporary'
  | 'user_permanent'
  | 'user_reject';

export type PermissionResult =
  | {
      behavior: 'allow';
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
      decisionClassification?: PermissionDecisionClassification;
    }
  | {
      behavior: 'deny';
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
      decisionClassification?: PermissionDecisionClassification;
    };

export type PermissionRuleValue = {
  toolName: string;
  ruleContent?: string;
};

export type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg';

export type PermissionUpdate =
  | { type: 'addRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior; destination: PermissionUpdateDestination }
  | { type: 'replaceRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior; destination: PermissionUpdateDestination }
  | { type: 'removeRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior; destination: PermissionUpdateDestination }
  | { type: 'setMode'; mode: PermissionMode; destination: PermissionUpdateDestination }
  | { type: 'addDirectories'; directories: string[]; destination: PermissionUpdateDestination }
  | { type: 'removeDirectories'; directories: string[]; destination: PermissionUpdateDestination };

/**
 * Permission callback — programmatic control over tool usage.
 * Called before each tool execution in SDK mode.
 *
 * Return `null` **only** when the response has already been sent out of band
 * (echoing `options.requestId`). This is fail-closed: an accidental `null`
 * leaves the tool blocked forever, since permission prompts have no deadline.
 */
export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    /** Signalled when the request should be abandoned. */
    signal: AbortSignal;
    /** Permission rules that would stop this prompt from recurring this session. */
    suggestions?: PermissionUpdate[];
    /** Path that triggered the prompt, when the tool tried to escape the allowed dirs. */
    blockedPath?: string;
    /** Why this permission request was raised. */
    decisionReason?: string;
    /** Full prompt sentence rendered upstream, e.g. "Claude wants to read foo.txt". */
    title?: string;
    /** Short noun phrase for the action, e.g. "Read file" — good for buttons. */
    displayName?: string;
    /** Human-readable subtitle explaining what access is being granted. */
    description?: string;
    /** Identifies this tool call within the assistant message. */
    toolUseID: string;
    /** The subagent's ID, when the call happens inside one. */
    agentID?: string;
    /** Control-request id; an out-of-band response must echo it. */
    requestId: string;
    /** Set when a user-configured `permissions.ask` rule forced this prompt. */
    matchedAskRule?: {
      source: string;
      toolName: string;
      ruleContent?: string;
    };
  },
) => Promise<PermissionResult | null>;

// ── Thinking config ───────────────────────────────────────────────

/** How thinking blocks are surfaced: summarised, or hidden entirely. */
export type ThinkingDisplay = 'summarized' | 'omitted';

export type ThinkingAdaptive = { type: 'adaptive'; display?: ThinkingDisplay };
export type ThinkingEnabled = { type: 'enabled'; budgetTokens?: number; display?: ThinkingDisplay };
export type ThinkingDisabled = { type: 'disabled' };
export type ThinkingConfig = ThinkingAdaptive | ThinkingEnabled | ThinkingDisabled;

// ── Hook types ────────────────────────────────────────────────────

/**
 * Hooks live in `./hooks.js`, which is the single source of truth for every
 * hook event, input, output and callback shape. They are re-exported here so
 * `import { HookEvent } from './types/client.js'` keeps working.
 */
export type {
  HookEvent,
  HookInput,
  HookJSONOutput,
  SyncHookJSONOutput,
  AsyncHookJSONOutput,
  HookCallback,
  HookCallbackMatcher,
  HookEntry,
  HookMatcher,
  HooksConfig,
} from './hooks.js';

// ── Elicitation ───────────────────────────────────────────────────

/** Elicitation request from an MCP server. */
export interface ElicitationRequest {
  serverName: string;
  message: string;
  mode?: 'form' | 'url';
  url?: string;
  elicitationId?: string;
  requestedSchema?: Record<string, unknown>;

  /** Prompt header, from MCP `_meta['anthropic/permissionDisplay']`. */
  title?: string;

  /** Short tool/server label, from `_meta['anthropic/permissionDisplay'].displayName`. */
  displayName?: string;

  /** Prompt subtitle, from `_meta['anthropic/permissionDisplay'].description`. */
  description?: string;
}

/**
 * Answer to an {@link ElicitationRequest}.
 * `content` is the MCP wire shape, so only scalars and string arrays are valid.
 */
export type ElicitationResult = {
  _meta?: Record<string, unknown>;
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, string | number | boolean | string[]>;
};

/**
 * Callback for handling MCP elicitation requests.
 *
 * Return `null` **only** when the response has already been sent out of band
 * (echoing `options.requestId`); the elicitation otherwise stays parked until
 * the worker's deadline.
 */
export type OnElicitation = (
  request: ElicitationRequest,
  options: {
    /** Signalled when the request should be abandoned. */
    signal: AbortSignal;
    /** Control-request id; an out-of-band response must echo it. */
    requestId: string;
  },
) => Promise<ElicitationResult | null>;

// ── Host dialogs ─────────────────────────────────────────────────

/**
 * A blocking dialog the CLI asks the host to render.
 *
 * `dialogKind` is an open union — new kinds may appear without a protocol
 * bump, so answer anything unrecognised with `{ behavior: 'cancelled' }`.
 */
export type UserDialogRequest = {
  /** Which dialog to render, e.g. `'refusal_fallback_prompt'`. */
  dialogKind: string;

  /** Dialog-specific data; the shape is defined per `dialogKind`. */
  payload: Record<string, unknown>;

  /** Set when the dialog belongs to a tool call — same value as `canUseTool`'s. */
  toolUseID?: string;
};

/**
 * The host's answer to a {@link UserDialogRequest}.
 * On `'cancelled'` the CLI applies the dialog's default behavior.
 */
export type UserDialogResult =
  | { behavior: 'completed'; result: unknown }
  | { behavior: 'cancelled' };

/**
 * Callback for host-rendered blocking dialogs. SDK mode only.
 *
 * Return `null` **only** when the response has already been sent out of band
 * (echoing `options.requestId`); the dialog otherwise stays parked until the
 * worker's deadline.
 */
export type OnUserDialog = (
  request: UserDialogRequest,
  options: {
    /** Signalled when the dialog should be abandoned. */
    signal: AbortSignal;
    /** Control-request id; an out-of-band response must echo it. */
    requestId: string;
  },
) => Promise<UserDialogResult | null>;

// ── Effort ────────────────────────────────────────────────────────

export type EffortLevel =
  | typeof EFFORT_LOW
  | typeof EFFORT_MEDIUM
  | typeof EFFORT_HIGH
  | typeof EFFORT_XHIGH
  | typeof EFFORT_MAX;

// ── Betas ─────────────────────────────────────────────────────────

/** Beta features that can be enabled through `betas`. */
export type SdkBeta = typeof BETA_CONTEXT_1M;

// ── Tool config ───────────────────────────────────────────────────

/** The `{ type: 'preset' }` form of `tools` — every default Claude Code tool. */
export type ToolsPresetConfig = {
  readonly type: 'preset';
  readonly preset: 'claude_code';
};

/**
 * Per-tool configuration for built-in tools, for behaviour the CLI hardcodes.
 * SDK mode only.
 */
export interface ToolConfig {
  readonly askUserQuestion?: {
    /**
     * Content format for the `preview` field on question options.
     *
     * - `'markdown'` — Markdown/ASCII, rendered in a monospace box (default)
     * - `'html'`     — self-contained HTML fragments, for web hosts
     */
    readonly previewFormat?: 'markdown' | 'html';
  };
}

// ── MCP server configs ────────────────────────────────────────────

/** Per-tool permission policy for a remote MCP server. */
export type McpServerToolPolicy = {
  /** Tool name as advertised by the server. */
  name: string;

  /** How this tool is handled when called. */
  permission_policy?: 'always_allow' | 'always_ask' | 'always_deny';

  /** Org admin's ceiling — an `'ask'` cap forces a prompt even in auto mode. */
  org_max_permission?: 'allow' | 'ask' | 'blocked';
};

/** MCP server started as a child process and spoken to over stdio. */
export interface McpStdioServerConfig {
  /** Transport type. Defaults to stdio when omitted. */
  readonly type?: typeof MCP_STDIO;

  /** Command to start the server. */
  readonly command: string;

  /** Arguments for the command. */
  readonly args?: readonly string[];

  /** Environment variables for the server process. */
  readonly env?: Readonly<Record<string, string>>;

  /**
   * Per-call tool timeout in milliseconds. Overrides `MCP_TOOL_TIMEOUT` for
   * this server. Values below 1000 are ignored.
   */
  readonly timeout?: number;

  /**
   * Always include this server's tools in the prompt instead of deferring them
   * behind tool search. Blocks startup until the server connects.
   */
  readonly alwaysLoad?: boolean;
}

/** Remote MCP server over server-sent events. */
export interface McpSSEServerConfig {
  /** Transport type. */
  readonly type: typeof MCP_SSE;

  /** Server endpoint. */
  readonly url: string;

  /** HTTP headers sent with every request. */
  readonly headers?: Readonly<Record<string, string>>;

  /** Per-tool permission policies. */
  readonly tools?: readonly McpServerToolPolicy[];

  /**
   * Per-call tool timeout in milliseconds. Overrides `MCP_TOOL_TIMEOUT` for
   * this server. Values below 1000 are ignored.
   */
  readonly timeout?: number;

  /**
   * Always include this server's tools in the prompt instead of deferring them
   * behind tool search. Blocks startup until the server connects.
   */
  readonly alwaysLoad?: boolean;
}

/** Remote MCP server over streamable HTTP. */
export interface McpHttpServerConfig {
  /** Transport type. */
  readonly type: typeof MCP_HTTP;

  /** Server endpoint. */
  readonly url: string;

  /** HTTP headers sent with every request. */
  readonly headers?: Readonly<Record<string, string>>;

  /** Per-tool permission policies. */
  readonly tools?: readonly McpServerToolPolicy[];

  /**
   * Per-call tool timeout in milliseconds. Overrides `MCP_TOOL_TIMEOUT` for
   * this server. Values below 1000 are ignored.
   */
  readonly timeout?: number;

  /**
   * Always include this server's tools in the prompt instead of deferring them
   * behind tool search. Blocks startup until the server connects.
   */
  readonly alwaysLoad?: boolean;
}

/**
 * MCP server config, discriminated on `type`.
 * Omitting `type` means stdio, so `{ command: 'mcp-db' }` is still valid.
 */
export type McpServerConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig;

/**
 * The serializable half of an in-process MCP server config: what the CLI sends
 * back on a status row, where the live `instance` cannot travel over the wire.
 *
 * Configure servers with {@link McpSdkServerConfig} instead — this shape only
 * describes what comes *out* of `mcpServerStatus()`.
 */
export interface McpSdkServerStatusConfig {
  readonly type: typeof MCP_SDK;
  readonly name: string;

  /**
   * Per-call tool timeout in milliseconds. Applied when the server is first
   * registered — changing it later has no effect until the server is removed
   * and re-added. Values below 1000 are ignored.
   */
  readonly timeout?: number;
}

/**
 * In-process MCP server config (SDK mode only).
 * Created via `createSdkMcpServer()`.
 *
 * Carries a live `McpServer` object, so it is not serializable: a status row
 * reports the instance-less {@link McpSdkServerStatusConfig} instead.
 */
export interface McpSdkServerConfig extends McpSdkServerStatusConfig {
  readonly instance: unknown; // McpServer — opaque to avoid hard dependency
}

/**
 * SDK-side spelling of {@link McpSdkServerConfig}.
 *
 * The SDK reserves the bare `McpSdkServerConfig` name for the instance-less
 * shape (this library's {@link McpSdkServerStatusConfig}); this alias exists so
 * code written against the SDK's type names keeps compiling.
 */
export type McpSdkServerConfigWithInstance = McpSdkServerConfig;

/** MCP server proxied through claude.ai rather than connected to directly. */
export interface McpClaudeAIProxyServerConfig {
  readonly type: typeof MCP_CLAUDEAI_PROXY;

  /** Proxy endpoint. */
  readonly url: string;

  /** Connector id on the claude.ai side. */
  readonly id: string;

  /** Per-call tool timeout in milliseconds. Values below 1000 are ignored. */
  readonly timeout?: number;
}

/**
 * Any config that can appear on an MCP server *status* row — including the
 * claude.ai proxy transport, which is never something you configure yourself.
 *
 * The `sdk` member is the instance-less {@link McpSdkServerStatusConfig}: the
 * CLI reports the transport by name and never sends the live server object
 * back, so a status row is `{ type: 'sdk', name }` with no `instance`. Narrow
 * it with `Extract<McpServerStatusConfig, { type: 'sdk' }>` where a name for it
 * is handy.
 */
export type McpServerStatusConfig =
  | McpServerConfig
  | McpSdkServerStatusConfig
  | McpClaudeAIProxyServerConfig;

/**
 * Per-server permission mode override: `'auto'` to let the CLI decide,
 * `'default'` to always prompt, `null` to clear the override.
 */
export type McpPermissionModeOverride =
  | typeof PERMISSION_DEFAULT
  | typeof PERMISSION_AUTO
  | null;

/**
 * MCP servers granted to a subagent: either the name of a server already
 * configured on the client, or an inline definition map.
 */
export type AgentMcpServerSpec =
  | string
  | Readonly<Record<string, McpServerConfig | McpSdkServerConfig>>;

// ── Agent config ──────────────────────────────────────────────────

export interface AgentConfig {
  /** When to delegate to this agent. */
  readonly description: string;

  /**
   * The agent's system prompt.
   *
   * **Required in practice.** The SDK's `AgentDefinition.prompt` and the CLI's
   * `--agents` JSON both demand it, so `{ description }` alone typechecks here
   * and is then rejected at option intake — in either mode. It stays optional
   * only because making it required would break the existing public API, and
   * becomes required in the next major.
   */
  readonly prompt?: string;

  /** Model for this agent: 'opus', 'sonnet', 'haiku', 'inherit'. */
  readonly model?: string;

  /** Tools available to this agent. Inherits the parent's set when omitted. */
  readonly tools?: readonly string[];

  /**
   * Tools denied to this agent. Server-level specs (`mcp__server`,
   * `mcp__server__*`, `mcp__*`) remove every tool from that server.
   */
  readonly disallowedTools?: readonly string[];

  /** MCP servers this agent may use. */
  readonly mcpServers?: readonly AgentMcpServerSpec[];

  /** Skill names preloaded into the agent's context. */
  readonly skills?: readonly string[];

  /**
   * Auto-submitted as the first user turn when this agent is the main thread
   * agent. Slash commands are expanded; prepended to any user prompt.
   */
  readonly initialPrompt?: string;

  /** Permission mode for this agent. */
  readonly permissionMode?: PermissionMode;

  /** Max agentic turns. */
  readonly maxTurns?: number;

  /**
   * Where this agent's memory files are auto-loaded from:
   * `~/.claude/agent-memory/<type>/`, `.claude/agent-memory/<type>/`, or
   * `.claude/agent-memory-local/<type>/`.
   */
  readonly memory?: 'user' | 'project' | 'local';

  /** Reasoning effort for this agent — a named level or a raw integer. */
  readonly effort?: EffortLevel | number;

  /**
   * Agent type auto-spawned as a background observer while this agent runs.
   * The observer only reads activity digests; it never joins the task.
   */
  readonly observer?: string;

  /** Extra postamble appended to each activity digest sent to the observer. */
  readonly observerMessage?: string;

  /** Experimental: critical reminder added to the agent's system prompt. */
  readonly criticalSystemReminder_EXPERIMENTAL?: string;

  /**
   * Run in isolated git worktree.
   *
   * @deprecated Not part of the SDK's agent definition — it survives only in
   * the CLI-mode `--agents` JSON and is dropped in SDK mode.
   */
  readonly isolation?: 'worktree';

  /** Always run as background task. */
  readonly background?: boolean;
}

// ── Setting sources ──────────────────────────────────────────────

export type SettingSource = 'user' | 'project' | 'local';

/**
 * Settings applied at runtime to the flag layer (the highest-priority tier).
 *
 * Every key also accepts `null`, which clears it from that layer. `effortLevel`
 * additionally accepts `'max'`, which is session-scoped and never persisted.
 */
export type FlagSettings = {
  readonly [K in keyof Settings]?: (K extends 'effortLevel' ? EffortLevel : Settings[K]) | null;
};

// ── Plugin config ────────────────────────────────────────────────

/** Plugin loaded from a directory on disk. */
export interface LocalPluginConfig {
  /** Plugin type. */
  readonly type: 'local';

  /** Absolute or relative path to the plugin directory. */
  readonly path: string;

  /**
   * Skip MCP discovery for this plugin. Use when the host owns its own MCP
   * connections and does not want the plugin's servers connected too.
   */
  readonly skipMcpDiscovery?: boolean;
}

/** Plugin fetched from a URL. CLI mode only (`--plugin-url`). */
export interface UrlPluginConfig {
  /** Plugin type. */
  readonly type: 'url';

  /** URL of the plugin archive. */
  readonly url: string;
}

export type PluginConfig = LocalPluginConfig | UrlPluginConfig;

// ── Sandbox ──────────────────────────────────────────────────────

/** Egress rules for sandboxed tool calls. */
export interface SandboxNetworkConfig {
  /** Domains reachable from inside the sandbox. */
  readonly allowedDomains?: readonly string[];

  /** Domains explicitly blocked, even when otherwise allowed. */
  readonly deniedDomains?: readonly string[];

  /** Treat `allowedDomains` as exhaustive — anything else is refused. */
  readonly strictAllowlist?: boolean;

  /** Only allow domains that the managed (policy) settings list. */
  readonly allowManagedDomainsOnly?: boolean;

  /** Unix socket paths the sandbox may connect to. */
  readonly allowUnixSockets?: readonly string[];

  /** Allow every Unix socket. Wide open — prefer `allowUnixSockets`. */
  readonly allowAllUnixSockets?: boolean;

  /** Allow binding local ports (needed by dev servers under test). */
  readonly allowLocalBinding?: boolean;

  /** macOS Mach service names the sandbox may look up. */
  readonly allowMachLookup?: readonly string[];

  /** Port the sandbox's HTTP proxy listens on. */
  readonly httpProxyPort?: number;

  /** Port the sandbox's SOCKS proxy listens on. */
  readonly socksProxyPort?: number;

  /** Terminate TLS at the proxy so requests can be inspected. */
  readonly tlsTerminate?: {
    readonly caCertPath?: string;
    readonly caKeyPath?: string;
  };
}

/** Filesystem rules for sandboxed tool calls. */
export interface SandboxFilesystemConfig {
  /** Paths that stay writable inside the sandbox. */
  readonly allowWrite?: readonly string[];

  /** Paths that are never writable. */
  readonly denyWrite?: readonly string[];

  /** Paths that are never readable. */
  readonly denyRead?: readonly string[];

  /** Paths that stay readable inside the sandbox. */
  readonly allowRead?: readonly string[];

  /** Only allow reads under paths the managed (policy) settings list. */
  readonly allowManagedReadPathsOnly?: boolean;

  /** Turn filesystem isolation off while keeping network isolation. */
  readonly disabled?: boolean;
}

/** How one credential-bearing file is handled inside the sandbox. */
export interface SandboxCredentialFile {
  /** Path to the file. */
  readonly path: string;

  /** `'deny'` refuses access outright; `'mask'` hands over a redacted copy. */
  readonly mode: 'deny' | 'mask';

  /** Regex selecting the secret inside the file. */
  readonly extract?: string;

  /** What to do when `extract` matches nothing. */
  readonly onExtractNoMatch?: 'deny' | 'error' | 'warn';

  /** Decode the value before masking. */
  readonly decode?: 'jwt';

  /** Claims to mask once decoded. */
  readonly maskClaims?: readonly string[];

  /** Mask repeated occurrences of the same secret. */
  readonly maskDuplicates?: boolean;

  /** Hosts the unmasked value may be injected for. */
  readonly injectHosts?: readonly string[];
}

/** How one credential-bearing environment variable is handled. */
export interface SandboxCredentialEnvVar {
  /** Variable name. */
  readonly name: string;

  /** `'deny'` removes it; `'mask'` replaces the value with a redacted one. */
  readonly mode: 'deny' | 'mask';

  /** Regex selecting the secret inside the value. */
  readonly extract?: string;

  /** What to do when `extract` matches nothing. */
  readonly onExtractNoMatch?: 'deny' | 'error' | 'warn';

  /** Decode the value before masking. */
  readonly decode?: 'jwt';

  /** Claims to mask once decoded. */
  readonly maskClaims?: readonly string[];

  /** Hosts the unmasked value may be injected for. */
  readonly injectHosts?: readonly string[];
}

/** An AWS access-key/secret pair that must be masked together. */
export interface SandboxAwsCredentialPair {
  readonly accessKeyIdVar: string;
  readonly secretAccessKeyVar: string;
  readonly sessionTokenVar?: string;
}

/** How SigV4-signed requests are treated by the credential proxy. */
export interface SandboxSigv4Config {
  readonly streaming?: 'deny' | 'passthrough';
  readonly presigned?: 'deny' | 'passthrough';
  readonly sigv4a?: 'deny' | 'passthrough';
}

/** Credential masking rules for sandboxed tool calls. */
export interface SandboxCredentialsConfig {
  /** Credential files to deny or mask. */
  readonly files?: readonly SandboxCredentialFile[];

  /** Credential environment variables to deny or mask. */
  readonly envVars?: readonly SandboxCredentialEnvVar[];

  /** Allow injecting plaintext credentials into allowed hosts. */
  readonly allowPlaintextInject?: boolean;

  /** AWS key pairs that must be masked as a unit. */
  readonly awsPairs?: readonly SandboxAwsCredentialPair[];

  /** SigV4 request handling. */
  readonly sigv4?: SandboxSigv4Config;
}

/**
 * Sandbox settings — run tool calls under OS-level isolation with an egress
 * allowlist and credential masking.
 *
 * Hand-written structural copy of the SDK's schema-inferred `SandboxSettings`,
 * so no zod dependency leaks into this package.
 *
 * @example
 * ```ts
 * new Claude({
 *   sandbox: {
 *     enabled: true,
 *     network: { allowedDomains: ['registry.npmjs.org'], strictAllowlist: true },
 *     filesystem: { allowWrite: ['./build'] },
 *   },
 * })
 * ```
 */
export interface SandboxConfig {
  /** Turn sandboxing on. */
  readonly enabled?: boolean;

  /** Fail the run instead of silently continuing when no sandbox is available. */
  readonly failIfUnavailable?: boolean;

  /** Auto-approve Bash calls once they are known to be sandboxed. */
  readonly autoAllowBashIfSandboxed?: boolean;

  /** Still permit explicitly-approved commands to run outside the sandbox. */
  readonly allowUnsandboxedCommands?: boolean;

  /** Network rules. */
  readonly network?: SandboxNetworkConfig;

  /** Filesystem rules. */
  readonly filesystem?: SandboxFilesystemConfig;

  /** Credential masking rules. */
  readonly credentials?: SandboxCredentialsConfig;

  /** Violations to tolerate, keyed by command. */
  readonly ignoreViolations?: Readonly<Record<string, readonly string[]>>;

  /** Allow a weaker sandbox when already running inside one. */
  readonly enableWeakerNestedSandbox?: boolean;

  /** Allow weaker network isolation when the strong path is unavailable. */
  readonly enableWeakerNetworkIsolation?: boolean;

  /** macOS: allow Apple Events. */
  readonly allowAppleEvents?: boolean;

  /** Commands that are never sandboxed. */
  readonly excludedCommands?: readonly string[];

  /** Ripgrep binary used inside the sandbox. */
  readonly ripgrep?: {
    readonly command: string;
    readonly args?: readonly string[];
  };

  /** Linux: path to `bwrap`. */
  readonly bwrapPath?: string;

  /** Linux: path to `socat`. */
  readonly socatPath?: string;
}

/**
 * SDK-side spelling of {@link SandboxConfig}.
 *
 * @deprecated Prefer `SandboxConfig`; this alias exists so code written against
 * the SDK's type name keeps compiling.
 */
export type SandboxSettings = SandboxConfig;

// ── Custom spawn (VMs/containers) ────────────────────────────────

export interface SpawnOptions {
  /** Command to execute. */
  readonly command: string;

  /** Arguments for the command. */
  readonly args: readonly string[];

  /** Working directory. Omitted means "inherit from the parent process". */
  readonly cwd?: string;

  /** Environment variables. */
  readonly env: Record<string, string | undefined>;

  /** Abort signal — always provided, and must be honoured to support cancellation. */
  readonly signal: AbortSignal;
}

/**
 * A spawned Claude Code process, as seen by the SDK.
 * Node's `ChildProcess` already satisfies this interface.
 */
export interface SpawnedProcess {
  /** Standard output stream. */
  readonly stdout: Readable;

  /** Standard input stream. */
  readonly stdin: Writable;

  /**
   * Standard error stream.
   *
   * Not part of the SDK's interface — optional so a `ChildProcess` and a
   * minimal custom spawner both fit.
   */
  readonly stderr?: Readable | null;

  /** Whether the process has been killed. */
  readonly killed: boolean;

  /** Exit code once the process has exited, `null` while it is still running. */
  readonly exitCode: number | null;

  /**
   * Signal that terminated the process, if any. Optional: `ChildProcess`
   * provides it, custom spawners may omit it.
   */
  readonly signalCode?: NodeJS.Signals | null;

  /** Kill the process with the given signal. Returns whether the signal was sent. */
  kill(signal: NodeJS.Signals): boolean;

  /** Listen for process exit. */
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  /** Listen for spawn errors. */
  on(event: 'error', listener: (error: Error) => void): void;

  /** Listen for process exit once. */
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  /** Listen for a spawn error once. */
  once(event: 'error', listener: (error: Error) => void): void;

  /** Remove an exit listener. */
  off(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  /** Remove an error listener. */
  off(event: 'error', listener: (error: Error) => void): void;
}
