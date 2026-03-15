import type { ClientOptions, QueryOptions } from '../types/index.js';

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
  readonly prompt: string;
  readonly outputFormat: 'json' | 'stream-json';
  readonly cwd: string;
  readonly model?: string;
  readonly effortLevel?: string;
  readonly fallbackModel?: string;
  readonly permissionMode?: string;
  readonly allowedTools?: readonly string[];
  readonly disallowedTools?: readonly string[];
  readonly systemPrompt?: string;
  readonly appendSystemPrompt?: string;
  readonly maxTurns?: number;
  readonly maxBudget?: number;
  readonly additionalDirs?: readonly string[];
  readonly mcpConfig?: string | readonly string[];
  readonly mcpServers?: Readonly<Record<string, unknown>>;
  readonly agents?: Readonly<Record<string, unknown>>;
  readonly hooks?: Readonly<Record<string, unknown>>;
  readonly noSessionPersistence?: boolean;
  readonly worktree?: boolean | string;
  readonly sessionId?: string;
  readonly continueSession?: boolean;
  readonly forkSession?: boolean;
  readonly schema?: Record<string, unknown>;
  readonly agent?: string;
  readonly tools?: readonly string[];
  readonly name?: string;
  readonly strictMcpConfig?: boolean;
}

/**
 * Merge client-level defaults with per-query overrides.
 */
export function mergeOptions(
  client: ClientOptions,
  query: QueryOptions | undefined,
  extra: {
    prompt: string;
    outputFormat: 'json' | 'stream-json';
    sessionId?: string;
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
    fallbackModel: client.fallbackModel,
    permissionMode: query?.permissionMode ?? client.permissionMode,
    allowedTools: query?.allowedTools ?? client.allowedTools,
    disallowedTools: query?.disallowedTools ?? client.disallowedTools,
    systemPrompt: query?.systemPrompt ?? client.systemPrompt,
    appendSystemPrompt: query?.appendSystemPrompt ?? client.appendSystemPrompt,
    maxTurns: query?.maxTurns ?? client.maxTurns,
    maxBudget: query?.maxBudget ?? client.maxBudget,
    additionalDirs: query?.additionalDirs ?? client.additionalDirs,
    mcpConfig: client.mcpConfig,
    mcpServers: client.mcpServers,
    agents: client.agents,
    hooks: client.hooks,
    noSessionPersistence: client.noSessionPersistence,
    worktree: query?.worktree,
    sessionId: extra.sessionId,
    continueSession: extra.continueSession,
    forkSession: extra.forkSession,
    schema: query?.schema,
    agent: query?.agent ?? client.agent,
    tools: query?.tools ?? client.tools,
    name: client.name,
    strictMcpConfig: client.strictMcpConfig,
  };
}

/**
 * Convert resolved options into a CLI argument array.
 *
 * @returns Array of strings to pass to `spawn('claude', args)`.
 */
export function buildArgs(options: ResolvedOptions): string[] {
  const args: string[] = ['--print', '--output-format', options.outputFormat];

  // BUG-1 fix: stream-json requires --verbose
  if (options.outputFormat === 'stream-json') {
    args.push('--verbose');
  }

  // ── Prompt ──────────────────────────────────────────────────────
  args.push(options.prompt);

  // ── Session ─────────────────────────────────────────────────────
  if (options.continueSession) {
    args.push('--continue');
  }
  if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }
  if (options.forkSession) {
    args.push('--fork-session');
  }

  // ── Model ───────────────────────────────────────────────────────
  if (options.model) {
    args.push('--model', options.model);
  }
  if (options.fallbackModel) {
    args.push('--fallback-model', options.fallbackModel);
  }
  if (options.effortLevel) {
    args.push('--effort', options.effortLevel);
  }

  // ── Permissions ─────────────────────────────────────────────────
  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode);
  }
  if (options.allowedTools?.length) {
    args.push('--allowedTools', ...options.allowedTools);
  }
  if (options.disallowedTools?.length) {
    args.push('--disallowedTools', ...options.disallowedTools);
  }

  // ── Tools (built-in set restriction) ────────────────────────────
  if (options.tools) {
    if (options.tools.length === 0) {
      args.push('--tools', '');
    } else {
      args.push('--tools', ...options.tools);
    }
  }

  // ── System prompt ───────────────────────────────────────────────
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }
  if (options.appendSystemPrompt) {
    args.push('--append-system-prompt', options.appendSystemPrompt);
  }

  // ── Limits ──────────────────────────────────────────────────────
  if (options.maxTurns !== undefined) {
    args.push('--max-turns', String(options.maxTurns));
  }
  if (options.maxBudget !== undefined) {
    args.push('--max-budget-usd', String(options.maxBudget));
  }

  // ── Directories ─────────────────────────────────────────────────
  if (options.additionalDirs?.length) {
    for (const dir of options.additionalDirs) {
      args.push('--add-dir', dir);
    }
  }

  // ── MCP ─────────────────────────────────────────────────────────
  if (options.mcpConfig) {
    const configs = Array.isArray(options.mcpConfig) ? options.mcpConfig : [options.mcpConfig];
    for (const cfg of configs) {
      args.push('--mcp-config', cfg);
    }
  }
  if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
    args.push('--mcp-config', JSON.stringify({ mcpServers: options.mcpServers }));
  }
  if (options.strictMcpConfig) {
    args.push('--strict-mcp-config');
  }

  // ── Agents ──────────────────────────────────────────────────────
  if (options.agents && Object.keys(options.agents).length > 0) {
    args.push('--agents', JSON.stringify(options.agents));
  }
  if (options.agent) {
    args.push('--agent', options.agent);
  }

  // ── Structured output ───────────────────────────────────────────
  if (options.schema) {
    args.push('--json-schema', JSON.stringify(options.schema));
  }

  // ── Worktree ────────────────────────────────────────────────────
  if (options.worktree) {
    if (typeof options.worktree === 'string') {
      args.push('--worktree', options.worktree);
    } else {
      args.push('--worktree');
    }
  }

  // ── Misc ────────────────────────────────────────────────────────
  if (options.noSessionPersistence) {
    args.push('--no-session-persistence');
  }
  if (options.name) {
    args.push('--name', options.name);
  }

  // ── Hooks (via --settings) ──────────────────────────────────────
  if (options.hooks && Object.keys(options.hooks).length > 0) {
    args.push('--settings', JSON.stringify({ hooks: options.hooks }));
  }

  return args;
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
