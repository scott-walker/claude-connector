import type { ClientOptions, QueryOptions, PluginConfig, ThinkingConfig } from '../types/index.js';
import type { ToolsPresetConfig } from '../types/client.js';
import type { Settings } from '../types/settings.js';
import {
  FLAG_PRINT, FLAG_OUTPUT_FORMAT, FLAG_VERBOSE, FLAG_INPUT_FORMAT,
  FLAG_CONTINUE, FLAG_RESUME, FLAG_FORK_SESSION, FLAG_MODEL,
  FLAG_FALLBACK_MODEL, FLAG_EFFORT, FLAG_PERMISSION_MODE,
  FLAG_ALLOWED_TOOLS, FLAG_DISALLOWED_TOOLS, FLAG_TOOLS,
  FLAG_SYSTEM_PROMPT, FLAG_APPEND_SYSTEM_PROMPT, FLAG_MAX_TURNS,
  FLAG_MAX_BUDGET, FLAG_ADD_DIR, FLAG_MCP_CONFIG, FLAG_STRICT_MCP_CONFIG,
  FLAG_AGENTS, FLAG_AGENT, FLAG_JSON_SCHEMA, FLAG_WORKTREE,
  FLAG_NO_SESSION_PERSISTENCE, FLAG_NAME, FLAG_SETTINGS, FLAG_SESSION_ID,
  FLAG_RESUME_SESSION_AT, FLAG_RESUME_DROPS_TURN,
  FLAG_SETTING_SOURCES, FLAG_SAFE_MODE, FLAG_BARE,
  FLAG_INCLUDE_HOOK_EVENTS, FLAG_INCLUDE_PARTIAL_MESSAGES,
  FLAG_FORWARD_SUBAGENT_TEXT, FLAG_REPLAY_USER_MESSAGES, FLAG_PROMPT_SUGGESTIONS,
  FLAG_ALLOW_DANGEROUSLY_SKIP_PERMISSIONS, FLAG_DANGEROUSLY_SKIP_PERMISSIONS,
  FLAG_PERMISSION_PROMPT_TOOL, FLAG_PLUGIN_DIR, FLAG_PLUGIN_URL,
  FLAG_DEBUG, FLAG_DEBUG_FILE, FLAG_THINKING, FLAG_MAX_THINKING_TOKENS,
  FLAG_TASK_BUDGET, FLAG_AUTOCOMPACT, FLAG_SYSTEM_PROMPT_FILE,
  FLAG_APPEND_SYSTEM_PROMPT_FILE, FLAG_APPEND_SUBAGENT_SYSTEM_PROMPT,
  FLAG_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS, FLAG_BETAS,
  FLAG_DISABLE_SLASH_COMMANDS, FLAG_FILE, FLAG_BRIEF,
  FLAG_PLAN_MODE_INSTRUCTIONS, FLAG_PLUGIN_DIR_NO_MCP,
  FORMAT_STREAM_JSON, KEY_TYPE, TOOLS_NONE,
  SETTINGS_KEY_HOOKS, HOOK_ENTRY_TYPE_COMMAND, THINKING_ENABLED, PLUGIN_URL,
  LIST_SEPARATOR, SYSTEM_PROMPT_SEPARATOR, SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  FLAG_PREFIX, FLAG_SHORT_PREFIX, FLAG_VALUE_ASSIGN,
} from '../constants.js';

/**
 * Builds the CLI argument array from merged client + query options.
 *
 * ## Separation of concerns
 *
 * ArgsBuilder is purely functional — it takes options and returns `string[]`.
 * It has no side effects, no I/O, and no dependency on the executor.
 * This makes it trivially testable and replaceable.
 *
 * ## Merging strategy
 *
 * Query-level options override client-level options. Arrays are replaced, not merged.
 * This follows the principle of least surprise: if you set `allowedTools` per-query,
 * you get exactly those tools, not a union with client defaults.
 */

/** Merged options ready for argument building. */
export interface ResolvedOptions {
  readonly prompt?: string;
  readonly outputFormat: 'json' | 'stream-json';

  /** `'text'` is the CLI default; `'stream-json'` enables bidirectional streaming. */
  readonly inputFormat?: 'text' | 'stream-json';

  readonly cwd: string;
  readonly model?: string;
  readonly effortLevel?: string;

  /** Single model, or an ordered list tried left to right (`--fallback-model a,b`). */
  readonly fallbackModel?: string | readonly string[];

  readonly permissionMode?: string;

  /** Replacement body for the built-in plan-mode workflow. Consulted only in plan mode. */
  readonly planModeInstructions?: string;

  readonly allowedTools?: readonly string[];
  readonly disallowedTools?: readonly string[];

  /**
   * Already folded to a single string — an array-form system prompt is joined
   * on merge, with the {@link SYSTEM_PROMPT_DYNAMIC_BOUNDARY} element dropped
   * rather than joined (the CLI has no cache-boundary flag, so keeping the
   * marker would hand it to the model as literal prompt text).
   */
  readonly systemPrompt?: string;

  readonly appendSystemPrompt?: string;

  /** Path read into the system prompt. Takes precedence over the inline form on the CLI side. */
  readonly systemPromptFile?: string;

  /** Path appended to the system prompt. */
  readonly appendSystemPromptFile?: string;

  /** One instruction appended to every subagent's system prompt. */
  readonly appendSubagentSystemPrompt?: string;

  /** Move cwd/env/memory-paths/git-status into the first user message for prompt-cache stability. */
  readonly excludeDynamicSystemPromptSections?: boolean;

  readonly maxTurns?: number;
  readonly maxBudget?: number;

  /** Token allowance the model is made aware of (`--task-budget`). */
  readonly taskBudgetTokens?: number;

  /** When compaction fires: `'auto'`, or a token threshold such as `500_000` / `'500k'`. */
  readonly autocompact?: 'auto' | number | string;

  /** Extended-thinking configuration; drives `--thinking` and `--max-thinking-tokens`. */
  readonly thinking?: ThinkingConfig;

  /** Thinking token budget. Superseded by `thinking.budgetTokens` when both are set. */
  readonly maxThinkingTokens?: number;

  readonly additionalDirs?: readonly string[];
  readonly mcpConfig?: string | readonly string[];
  readonly mcpServers?: Readonly<Record<string, unknown>>;
  readonly agents?: Readonly<Record<string, unknown>>;
  readonly hooks?: Readonly<Record<string, unknown>>;

  /**
   * Settings file path, or an inline settings object. Object form is merged
   * with {@link ResolvedOptions.hooks} into the single `--settings` payload;
   * a path is emitted verbatim and hooks are then expected to live in that file.
   */
  readonly settings?: string | Settings | Readonly<Record<string, unknown>>;

  /** Which settings tiers to load. An empty array is emitted as full isolation. */
  readonly settingSources?: readonly string[];

  readonly noSessionPersistence?: boolean;
  readonly worktree?: boolean | string;

  /** Session to resume (`--resume`). */
  readonly sessionId?: string;

  /** Caller-chosen UUID for a NEW conversation (`--session-id`). Distinct from `sessionId`. */
  readonly newSessionId?: string;

  /** Truncate the resumed transcript at this message uuid. */
  readonly resumeSessionAt?: string;

  /** Drop the turn that starts at this message uuid when resuming. */
  readonly resumeDropsTurn?: string;

  readonly continueSession?: boolean;
  readonly forkSession?: boolean;
  readonly schema?: Record<string, unknown>;
  readonly agent?: string;

  /** Built-in tool set. The `{ type: 'preset' }` form is SDK-only and is not emitted. */
  readonly tools?: readonly string[] | ToolsPresetConfig;

  readonly name?: string;
  readonly strictMcpConfig?: boolean;

  /**
   * Plugins to load — one flag per entry: `--plugin-url` for the url form,
   * `--plugin-dir-no-mcp` for a local plugin with `skipMcpDiscovery`, and
   * `--plugin-dir` otherwise.
   */
  readonly plugins?: readonly PluginConfig[];

  /** Beta features to enable (API-key users only). */
  readonly betas?: readonly string[];

  /** Emit `hook_started` / `hook_progress` / `hook_response` (stream-json only). */
  readonly includeHookEvents?: boolean;

  /** Emit raw provider deltas as `stream_event` messages (stream-json only). */
  readonly includePartialMessages?: boolean;

  /** Emit subagent assistant text, not just its tool calls (stream-json only). */
  readonly forwardSubagentText?: boolean;

  /** Echo accepted user messages back (needs stream-json on BOTH input and output). */
  readonly replayUserMessages?: boolean;

  /** Emit a `prompt_suggestion` message after each turn. */
  readonly promptSuggestions?: boolean;

  /** Permit `permissionMode: 'bypassPermissions'` (`--allow-dangerously-skip-permissions`). */
  readonly allowDangerouslySkipPermissions?: boolean;

  /** Skip every permission prompt (`--dangerously-skip-permissions`). */
  readonly dangerouslySkipPermissions?: boolean;

  /** MCP tool that answers permission prompts — the CLI-mode counterpart of `canUseTool`. */
  readonly permissionPromptToolName?: string;

  /** Disable all slash commands and skills. */
  readonly disableSlashCommands?: boolean;

  /** Ignore CLAUDE.md, skills, plugins, hooks, MCP servers and custom agents. */
  readonly safeMode?: boolean;

  /** Embedded mode: no hooks, LSP, plugin sync, auto-memory or CLAUDE.md discovery. */
  readonly bare?: boolean;

  /** Enable the `SendUserMessage` tool so the agent can push messages mid-run. */
  readonly brief?: boolean;

  /**
   * Start as a background agent and return immediately.
   *
   * Not emitted by {@link buildArgs}: the binary refuses `--bg` together with
   * `--print`, and every argv built here is a `--print` run. Carried for SDK
   * mode and for a future launcher that does not print.
   */
  readonly background?: boolean;

  /** Files-API resources to download into the workspace, as `file_id:relative_path`. */
  readonly files?: readonly string[];

  /** `true` for all categories, or a filter such as `'api,hooks'` / `'!1p'`. */
  readonly debug?: boolean | string;

  /** Write the debug log to this path (implies debug). */
  readonly debugFile?: string;

  /**
   * Raw CLI flags this wrapper does not model yet, keyed without the leading
   * `--`. A `null` value emits a boolean flag. Emitted last, so an entry that
   * repeats a modelled flag wins wherever the CLI is last-occurrence-wins.
   */
  readonly extraArgs?: Readonly<Record<string, string | null>>;
}

/**
 * Merge client-level defaults with per-query overrides.
 *
 * `extra` carries what only the caller knows: the prompt, the wire format, and
 * the session identity for this particular call. Session-level values win over
 * the client-level ones so a {@link Session} can pin its own conversation.
 */
export function mergeOptions(
  client: ClientOptions,
  query: QueryOptions | undefined,
  extra: {
    prompt: string;
    outputFormat: 'json' | 'stream-json';
    sessionId?: string;
    /** Caller-chosen UUID for a new conversation (`--session-id`). */
    newSessionId?: string;
    /** Message uuid to truncate the resumed transcript at. */
    resumeSessionAt?: string;
    /** Message uuid whose turn is dropped on resume. */
    resumeDropsTurn?: string;
    continueSession?: boolean;
    forkSession?: boolean;
  },
): ResolvedOptions {
  return {
    prompt: extra.prompt,
    outputFormat: extra.outputFormat,
    cwd: query?.cwd ?? client.cwd ?? process.cwd(),
    model: query?.model ?? client.model,
    effortLevel: query?.effortLevel ?? client.effortLevel,
    fallbackModel: query?.fallbackModel ?? client.fallbackModel,
    permissionMode: query?.permissionMode ?? client.permissionMode,
    planModeInstructions: query?.planModeInstructions ?? client.planModeInstructions,
    allowedTools: query?.allowedTools ?? client.allowedTools,
    disallowedTools: query?.disallowedTools ?? client.disallowedTools,
    systemPrompt: joinSystemPrompt(query?.systemPrompt ?? client.systemPrompt),
    appendSystemPrompt: query?.appendSystemPrompt ?? client.appendSystemPrompt,
    systemPromptFile: query?.systemPromptFile ?? client.systemPromptFile,
    appendSystemPromptFile: query?.appendSystemPromptFile ?? client.appendSystemPromptFile,
    appendSubagentSystemPrompt: client.appendSubagentSystemPrompt,
    excludeDynamicSystemPromptSections: client.excludeDynamicSystemPromptSections,
    maxTurns: query?.maxTurns ?? client.maxTurns,
    maxBudget: query?.maxBudget ?? client.maxBudget,
    taskBudgetTokens: query?.taskBudgetTokens ?? client.taskBudgetTokens,
    autocompact: client.autocompact,
    thinking: query?.thinking ?? client.thinking,
    maxThinkingTokens: client.maxThinkingTokens,
    additionalDirs: query?.additionalDirs ?? client.additionalDirs,
    mcpConfig: client.mcpConfig,
    mcpServers: client.mcpServers,
    agents: client.agents,
    hooks: client.hooks,
    settings: client.settings,
    settingSources: client.settingSources,
    noSessionPersistence: client.noSessionPersistence,
    worktree: query?.worktree,
    sessionId: extra.sessionId ?? client.resume,
    newSessionId: extra.newSessionId ?? client.sessionId,
    resumeSessionAt: extra.resumeSessionAt ?? client.resumeSessionAt,
    resumeDropsTurn: extra.resumeDropsTurn ?? client.resumeDropsTurn,
    continueSession: extra.continueSession ?? client.continueSession,
    forkSession: extra.forkSession ?? client.forkSession,
    schema: query?.schema ?? client.schema,
    agent: query?.agent ?? client.agent,
    tools: query?.tools ?? client.tools,
    name: client.name,
    strictMcpConfig: client.strictMcpConfig,
    plugins: client.plugins,
    betas: client.betas,
    includeHookEvents: client.includeHookEvents,
    includePartialMessages: client.includePartialMessages,
    forwardSubagentText: client.forwardSubagentText,
    replayUserMessages: client.replayUserMessages,
    promptSuggestions: client.promptSuggestions,
    allowDangerouslySkipPermissions: client.allowDangerouslySkipPermissions,
    dangerouslySkipPermissions: client.dangerouslySkipPermissions,
    permissionPromptToolName: client.permissionPromptToolName,
    disableSlashCommands: client.disableSlashCommands,
    safeMode: client.safeMode,
    bare: client.bare,
    brief: client.brief,
    background: query?.background,
    files: query?.files,
    debug: client.debug,
    debugFile: client.debugFile,
    extraArgs: client.extraArgs,
  };
}

/**
 * Convert resolved options into a CLI argument array.
 *
 * Flags the `claude` binary only accepts in a particular wire mode are gated on
 * that mode: the stream-shaping flags need `--output-format stream-json`, and
 * `--replay-user-messages` additionally needs `--input-format stream-json`.
 *
 * {@link ResolvedOptions.extraArgs} is appended last, so an entry that repeats a
 * flag emitted above wins wherever the CLI takes the last occurrence.
 *
 * @returns Array of strings to pass to `spawn('claude', args)`.
 */
export function buildArgs(options: ResolvedOptions): string[] {
  const args: string[] = [FLAG_PRINT];

  // ── Mode switches (read before any context flag) ────────────────
  if (options.bare) {
    args.push(FLAG_BARE);
  }

  args.push(FLAG_OUTPUT_FORMAT, options.outputFormat);

  const isStreamOut = options.outputFormat === FORMAT_STREAM_JSON;
  const isStreamIn = options.inputFormat === FORMAT_STREAM_JSON;

  // BUG-1 fix: stream-json requires --verbose
  if (isStreamOut) {
    args.push(FLAG_VERBOSE);
  }

  // ── Input format (bidirectional streaming) ─────────────────────
  if (options.inputFormat) {
    args.push(FLAG_INPUT_FORMAT, options.inputFormat);
  }

  // ── Prompt ──────────────────────────────────────────────────────
  if (options.prompt) {
    args.push(options.prompt);
  }

  // ── Session ─────────────────────────────────────────────────────
  if (options.continueSession) {
    args.push(FLAG_CONTINUE);
  }
  if (options.sessionId) {
    args.push(FLAG_RESUME, options.sessionId);
  }
  // `--session-id` pins a NEW conversation id, so it may not combine with a
  // resume or a continue unless the run also forks. Dropped rather than emitted
  // into a combination the CLI rejects.
  if (options.newSessionId && (options.forkSession || !(options.sessionId || options.continueSession))) {
    args.push(FLAG_SESSION_ID, options.newSessionId);
  }
  if (options.forkSession) {
    args.push(FLAG_FORK_SESSION);
  }
  // Only meaningful against a transcript that is being resumed.
  if (options.sessionId || options.continueSession) {
    if (options.resumeSessionAt) {
      args.push(FLAG_RESUME_SESSION_AT, options.resumeSessionAt);
    }
    if (options.resumeDropsTurn) {
      args.push(FLAG_RESUME_DROPS_TURN, options.resumeDropsTurn);
    }
  }

  // ── Model ───────────────────────────────────────────────────────
  if (options.model) {
    args.push(FLAG_MODEL, options.model);
  }
  if (options.fallbackModel) {
    const fallbacks = Array.isArray(options.fallbackModel)
      ? options.fallbackModel
      : [options.fallbackModel as string];
    if (fallbacks.length > 0) {
      args.push(FLAG_FALLBACK_MODEL, fallbacks.join(LIST_SEPARATOR));
    }
  }
  if (options.effortLevel) {
    args.push(FLAG_EFFORT, options.effortLevel);
  }

  // ── Permissions ─────────────────────────────────────────────────
  if (options.permissionMode) {
    args.push(FLAG_PERMISSION_MODE, options.permissionMode);
  }
  // Emitted regardless of the mode, matching SDK mode: the binary keeps it on
  // the flag layer and only reads it once the run actually enters plan mode.
  if (options.planModeInstructions) {
    args.push(FLAG_PLAN_MODE_INSTRUCTIONS, options.planModeInstructions);
  }
  if (options.allowedTools?.length) {
    args.push(FLAG_ALLOWED_TOOLS, ...options.allowedTools);
  }
  if (options.disallowedTools?.length) {
    args.push(FLAG_DISALLOWED_TOOLS, ...options.disallowedTools);
  }
  if (options.permissionPromptToolName) {
    args.push(FLAG_PERMISSION_PROMPT_TOOL, options.permissionPromptToolName);
  }
  if (options.allowDangerouslySkipPermissions) {
    args.push(FLAG_ALLOW_DANGEROUSLY_SKIP_PERMISSIONS);
  }
  if (options.dangerouslySkipPermissions) {
    args.push(FLAG_DANGEROUSLY_SKIP_PERMISSIONS);
  }

  // ── Tools (built-in set restriction) ────────────────────────────
  // The `{ type: 'preset' }` form has no CLI spelling — SDK mode consumes it.
  if (Array.isArray(options.tools)) {
    if (options.tools.length === 0) {
      args.push(FLAG_TOOLS, TOOLS_NONE);
    } else {
      args.push(FLAG_TOOLS, ...options.tools);
    }
  }

  // ── System prompt ───────────────────────────────────────────────
  if (options.systemPrompt) {
    args.push(FLAG_SYSTEM_PROMPT, options.systemPrompt);
  }
  if (options.systemPromptFile) {
    args.push(FLAG_SYSTEM_PROMPT_FILE, options.systemPromptFile);
  }
  if (options.appendSystemPrompt) {
    args.push(FLAG_APPEND_SYSTEM_PROMPT, options.appendSystemPrompt);
  }
  if (options.appendSystemPromptFile) {
    args.push(FLAG_APPEND_SYSTEM_PROMPT_FILE, options.appendSystemPromptFile);
  }
  if (options.appendSubagentSystemPrompt) {
    args.push(FLAG_APPEND_SUBAGENT_SYSTEM_PROMPT, options.appendSubagentSystemPrompt);
  }
  // The CLI ignores it when the system prompt is replaced wholesale.
  if (options.excludeDynamicSystemPromptSections && !options.systemPrompt) {
    args.push(FLAG_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS);
  }

  // ── Limits ──────────────────────────────────────────────────────
  if (options.maxTurns !== undefined) {
    args.push(FLAG_MAX_TURNS, String(options.maxTurns));
  }
  if (options.maxBudget !== undefined) {
    args.push(FLAG_MAX_BUDGET, String(options.maxBudget));
  }
  if (options.taskBudgetTokens !== undefined) {
    args.push(FLAG_TASK_BUDGET, String(options.taskBudgetTokens));
  }
  if (options.autocompact !== undefined) {
    args.push(FLAG_AUTOCOMPACT, String(options.autocompact));
  }

  // ── Thinking ────────────────────────────────────────────────────
  if (options.thinking) {
    args.push(FLAG_THINKING, options.thinking.type);
  }
  const thinkingBudget =
    options.thinking?.type === THINKING_ENABLED ? options.thinking.budgetTokens : undefined;
  const maxThinkingTokens = thinkingBudget ?? options.maxThinkingTokens;
  if (maxThinkingTokens !== undefined) {
    args.push(FLAG_MAX_THINKING_TOKENS, String(maxThinkingTokens));
  }

  // ── Directories ─────────────────────────────────────────────────
  if (options.additionalDirs?.length) {
    for (const dir of options.additionalDirs) {
      args.push(FLAG_ADD_DIR, dir);
    }
  }

  // ── MCP ─────────────────────────────────────────────────────────
  if (options.mcpConfig) {
    const configs = Array.isArray(options.mcpConfig) ? options.mcpConfig : [options.mcpConfig];
    for (const cfg of configs) {
      args.push(FLAG_MCP_CONFIG, cfg);
    }
  }
  if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
    args.push(FLAG_MCP_CONFIG, JSON.stringify({ mcpServers: options.mcpServers }));
  }
  if (options.strictMcpConfig) {
    args.push(FLAG_STRICT_MCP_CONFIG);
  }

  // ── Agents ──────────────────────────────────────────────────────
  if (options.agents && Object.keys(options.agents).length > 0) {
    args.push(FLAG_AGENTS, JSON.stringify(options.agents));
  }
  if (options.agent) {
    args.push(FLAG_AGENT, options.agent);
  }

  // ── Plugins ─────────────────────────────────────────────────────
  if (options.plugins?.length) {
    for (const plugin of options.plugins) {
      if (plugin.type === PLUGIN_URL) {
        args.push(FLAG_PLUGIN_URL, plugin.url);
      } else if (plugin.skipMcpDiscovery) {
        // `--plugin-dir-no-mcp` REPLACES `--plugin-dir`; emitting both would
        // load the plugin twice.
        args.push(FLAG_PLUGIN_DIR_NO_MCP, plugin.path);
      } else {
        args.push(FLAG_PLUGIN_DIR, plugin.path);
      }
    }
  }

  // ── Structured output ───────────────────────────────────────────
  if (options.schema) {
    args.push(FLAG_JSON_SCHEMA, JSON.stringify(options.schema));
  }

  // ── Worktree ────────────────────────────────────────────────────
  if (options.worktree) {
    if (typeof options.worktree === 'string') {
      args.push(FLAG_WORKTREE, options.worktree);
    } else {
      args.push(FLAG_WORKTREE);
    }
  }

  // ── Stream shaping (stream-json only) ───────────────────────────
  if (isStreamOut) {
    if (options.includeHookEvents) {
      args.push(FLAG_INCLUDE_HOOK_EVENTS);
    }
    if (options.includePartialMessages) {
      args.push(FLAG_INCLUDE_PARTIAL_MESSAGES);
    }
    if (options.forwardSubagentText) {
      args.push(FLAG_FORWARD_SUBAGENT_TEXT);
    }
    // The CLI hard-errors unless BOTH directions are stream-json.
    if (options.replayUserMessages && isStreamIn) {
      args.push(FLAG_REPLAY_USER_MESSAGES);
    }
    if (options.promptSuggestions !== undefined) {
      // Declared `[value]`; always emitted WITH a value so argv stays unambiguous.
      args.push(FLAG_PROMPT_SUGGESTIONS, String(options.promptSuggestions));
    }
  }

  // ── Configuration sources ───────────────────────────────────────
  if (options.settingSources) {
    // An empty list is a request for full isolation, not a no-op.
    args.push(FLAG_SETTING_SOURCES, options.settingSources.join(LIST_SEPARATOR));
  }
  if (options.safeMode) {
    args.push(FLAG_SAFE_MODE);
  }

  // ── Misc ────────────────────────────────────────────────────────
  if (options.noSessionPersistence) {
    args.push(FLAG_NO_SESSION_PERSISTENCE);
  }
  if (options.name) {
    args.push(FLAG_NAME, options.name);
  }
  if (options.disableSlashCommands) {
    args.push(FLAG_DISABLE_SLASH_COMMANDS);
  }
  if (options.brief) {
    args.push(FLAG_BRIEF);
  }
  // `--background` is deliberately NOT emitted: the binary rejects it together
  // with `--print` ("--bg and --print conflict"), and every argv this builder
  // produces is a --print run. See {@link ResolvedOptions.background}.
  if (options.betas?.length) {
    args.push(FLAG_BETAS, ...options.betas);
  }
  if (options.files?.length) {
    args.push(FLAG_FILE, ...options.files);
  }

  // ── Diagnostics ─────────────────────────────────────────────────
  if (typeof options.debug === 'string' && options.debug) {
    args.push(FLAG_DEBUG, options.debug);
  } else if (options.debug === true) {
    args.push(FLAG_DEBUG);
  }
  if (options.debugFile) {
    args.push(FLAG_DEBUG_FILE, options.debugFile);
  }

  // ── Settings (single flag, hooks folded in) ─────────────────────
  const settings = buildSettingsPayload(options.settings, options.hooks);
  if (settings !== undefined) {
    args.push(FLAG_SETTINGS, settings);
  }

  // ── Escape hatch (last, so it wins on last-occurrence flags) ────
  if (options.extraArgs) {
    for (const [key, value] of Object.entries(options.extraArgs)) {
      pushExtraArg(args, key, value);
    }
  }

  return args;
}

/**
 * Build the single value for `--settings`.
 *
 * The CLI accepts the flag once — last occurrence wins — and it is also the only
 * transport for hook configuration, so both inputs are folded into one value:
 *
 * - `settings` as a **path**: the path is emitted verbatim and `hooks` is NOT
 *   folded in (a path and an inline object cannot be merged on one flag). Put
 *   the hooks into that file, or pass `settings` as an object instead.
 * - `settings` as an **object**: merged with `{ hooks }` into one JSON literal.
 *   The `hooks` option wins per event over `settings.hooks`.
 * - `hooks` alone: emitted as `{"hooks":{…}}`, as before.
 *
 * Every hook entry is normalized to carry the `type: 'command'` discriminator
 * the CLI settings schema requires.
 *
 * @returns The flag value, or `undefined` when there is nothing to emit.
 *
 * @example
 * ```ts
 * buildSettingsPayload('/etc/claude/settings.json', undefined)
 * // → '/etc/claude/settings.json'
 *
 * buildSettingsPayload({ model: 'sonnet' }, { Stop: [{ hooks: [{ command: 'say done' }] }] })
 * // → '{"model":"sonnet","hooks":{"Stop":[{"hooks":[{"type":"command","command":"say done"}]}]}}'
 * ```
 */
export function buildSettingsPayload(
  settings: string | Settings | Readonly<Record<string, unknown>> | undefined,
  hooks: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (typeof settings === 'string') {
    return settings;
  }

  const base = settings ? { ...(settings as Record<string, unknown>) } : undefined;
  const inlineHooks = hooks && Object.keys(hooks).length > 0 ? hooks : undefined;
  const baseHooks = base && isRecord(base[SETTINGS_KEY_HOOKS]) ? base[SETTINGS_KEY_HOOKS] : undefined;

  if (!base && !inlineHooks) {
    return undefined;
  }

  const payload: Record<string, unknown> = base ?? {};
  const mergedHooks = { ...baseHooks, ...inlineHooks };
  if (Object.keys(mergedHooks).length > 0) {
    payload[SETTINGS_KEY_HOOKS] = normalizeHookSettings(mergedHooks);
  }

  return JSON.stringify(payload);
}

/**
 * Resolve environment variables from client + query options.
 */
export function resolveEnv(
  client: ClientOptions,
  query: QueryOptions | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};

  if (client.env) {
    Object.assign(env, client.env);
  }
  if (query?.env) {
    Object.assign(env, query.env);
  }

  return env;
}

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Fold the array form of a system prompt into the single value the CLI takes.
 *
 * {@link SYSTEM_PROMPT_DYNAMIC_BOUNDARY} is dropped rather than joined. It is a
 * marker the SDK reads to split the prompt into a cacheable prefix and a
 * per-run suffix; `--system-prompt` has no such split, so joining it in would
 * put the literal sentinel in front of the model as prompt text.
 */
function joinSystemPrompt(prompt: string | readonly string[] | undefined): string | undefined {
  if (prompt === undefined) return undefined;
  if (!Array.isArray(prompt)) return prompt as string;
  return (prompt as readonly string[])
    .filter((part) => part !== SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
    .join(SYSTEM_PROMPT_SEPARATOR);
}

/**
 * Emit one `extraArgs` entry, spelled exactly as the SDK spells it.
 *
 * `null` is a boolean flag. A value that itself starts with `-` is emitted as
 * the single token `--key=value`, because the CLI's parser would otherwise read
 * a separate `-…` token as the next flag rather than as this flag's value.
 */
function pushExtraArg(args: string[], key: string, value: string | null): void {
  const flag = `${FLAG_PREFIX}${key}`;

  if (value === null) {
    args.push(flag);
    return;
  }
  // Coerced like the SDK does, so a JS caller passing a number lands on the
  // same argv a TS caller gets rather than crashing on `.startsWith`.
  const text = String(value);
  if (text.length > 1 && text.startsWith(FLAG_SHORT_PREFIX)) {
    args.push(`${flag}${FLAG_VALUE_ASSIGN}${text}`);
    return;
  }
  args.push(flag, text);
}

/**
 * Stamp `type: 'command'` on every hook entry that omits it.
 * Anything that does not look like the documented hook shape is passed through
 * untouched, so a settings block using a schema newer than this library survives.
 */
function normalizeHookSettings(hooks: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [event, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) {
      normalized[event] = matchers;
      continue;
    }
    normalized[event] = matchers.map((matcher) => {
      if (!isRecord(matcher) || !Array.isArray(matcher[SETTINGS_KEY_HOOKS])) return matcher;
      return {
        ...matcher,
        [SETTINGS_KEY_HOOKS]: (matcher[SETTINGS_KEY_HOOKS] as readonly unknown[]).map(withEntryType),
      };
    });
  }

  return normalized;
}

/** Add the `command` discriminator to a hook entry that relies on the default. */
function withEntryType(entry: unknown): unknown {
  if (!isRecord(entry) || typeof entry[KEY_TYPE] === 'string') return entry;
  return { [KEY_TYPE]: HOOK_ENTRY_TYPE_COMMAND, ...entry };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
