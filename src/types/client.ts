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
   * Useful when multiple CLI versions are installed:
   * @example
   * ```ts
   * new Claude({ executable: '/usr/local/bin/claude-2.0' })
   * ```
   */
  readonly executable?: string;

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

  /** Thinking depth: 'low' | 'medium' | 'high'. */
  readonly effortLevel?: EffortLevel;

  /** Model to fall back to if the primary model fails. */
  readonly fallbackModel?: string;

  /**
   * Permission mode controlling tool approval behavior.
   *
   * - `'default'`            — prompt on first use
   * - `'acceptEdits'`        — auto-accept file edits
   * - `'plan'`               — read-only, no modifications
   * - `'bypassPermissions'`  — skip all checks (dangerous)
   */
  readonly permissionMode?: PermissionMode;

  /** Tools that are auto-approved without prompting. Supports glob patterns. */
  readonly allowedTools?: readonly string[];

  /** Tools that are always denied. */
  readonly disallowedTools?: readonly string[];

  /** Override the entire system prompt. */
  readonly systemPrompt?: string;

  /** Append text to the default system prompt. */
  readonly appendSystemPrompt?: string;

  /** Maximum number of agentic turns per query. */
  readonly maxTurns?: number;

  /** Maximum spend in USD per query. */
  readonly maxBudget?: number;

  /** Additional working directories to include. */
  readonly additionalDirs?: readonly string[];

  /** Path(s) to MCP config JSON files. */
  readonly mcpConfig?: string | readonly string[];

  /** Inline MCP server definitions. */
  readonly mcpServers?: Readonly<Record<string, McpServerConfig>>;

  /** Custom subagent definitions. */
  readonly agents?: Readonly<Record<string, AgentConfig>>;

  /** Lifecycle hooks. */
  readonly hooks?: Readonly<HooksConfig>;

  /** Extra environment variables passed to the CLI process. */
  readonly env?: Readonly<Record<string, string>>;

  /** Disable session persistence (useful for CI/automation). */
  readonly noSessionPersistence?: boolean;
}

/**
 * Per-query options that override client defaults.
 *
 * Any field set here takes precedence over the corresponding {@link ClientOptions} field
 * for the duration of a single query.
 */
export interface QueryOptions {
  /** Override working directory for this query. */
  readonly cwd?: string;

  /** Override model for this query. */
  readonly model?: string;

  /** Override effort level for this query. */
  readonly effortLevel?: EffortLevel;

  /** Override permission mode for this query. */
  readonly permissionMode?: PermissionMode;

  /** Override allowed tools for this query. */
  readonly allowedTools?: readonly string[];

  /** Override disallowed tools for this query. */
  readonly disallowedTools?: readonly string[];

  /** Override system prompt for this query. */
  readonly systemPrompt?: string;

  /** Append to system prompt for this query. */
  readonly appendSystemPrompt?: string;

  /** Override max turns for this query. */
  readonly maxTurns?: number;

  /** Override max budget for this query. */
  readonly maxBudget?: number;

  /**
   * Piped input — equivalent to `echo "data" | claude -p "prompt"`.
   * Provides additional context alongside the prompt.
   */
  readonly input?: string;

  /**
   * JSON Schema for structured output.
   * Claude will return validated JSON matching this schema.
   */
  readonly schema?: Record<string, unknown>;

  /**
   * Run in an isolated git worktree.
   * Pass `true` for auto-generated name, or a string for a specific name.
   */
  readonly worktree?: boolean | string;

  /** Additional directories for this query. */
  readonly additionalDirs?: readonly string[];

  /** Extra environment variables for this query. */
  readonly env?: Readonly<Record<string, string>>;
}

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'dontAsk'
  | 'bypassPermissions';

export type EffortLevel = 'low' | 'medium' | 'high';

export interface McpServerConfig {
  /** Transport type. */
  readonly type?: 'stdio' | 'http' | 'sse';

  /** Command to start stdio server. */
  readonly command?: string;

  /** Arguments for stdio server command. */
  readonly args?: readonly string[];

  /** URL for http/sse server. */
  readonly url?: string;

  /** Environment variables for the server process. */
  readonly env?: Readonly<Record<string, string>>;

  /** HTTP headers for http/sse servers. */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface AgentConfig {
  /** When to delegate to this agent. */
  readonly description: string;

  /** Initial prompt / instructions for the agent. */
  readonly prompt?: string;

  /** Model for this agent: 'opus', 'sonnet', 'haiku', 'inherit'. */
  readonly model?: string;

  /** Tools available to this agent. */
  readonly tools?: readonly string[];

  /** Tools denied to this agent. */
  readonly disallowedTools?: readonly string[];

  /** Permission mode for this agent. */
  readonly permissionMode?: PermissionMode;

  /** Max agentic turns. */
  readonly maxTurns?: number;

  /** Run in isolated git worktree. */
  readonly isolation?: 'worktree';

  /** Always run as background task. */
  readonly background?: boolean;
}

export interface HookEntry {
  /** Shell command to execute. */
  readonly command: string;

  /** Timeout in seconds. */
  readonly timeout?: number;
}

export interface HookMatcher {
  /** Regex pattern to match tool names. */
  readonly matcher: string;

  /** Hook entries to execute when matched. */
  readonly hooks: readonly HookEntry[];
}

export interface HooksConfig {
  readonly PreToolUse?: readonly HookMatcher[];
  readonly PostToolUse?: readonly HookMatcher[];
  readonly Stop?: readonly HookMatcher[];
  readonly [key: string]: readonly HookMatcher[] | undefined;
}
