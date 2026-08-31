import { ValidationError } from '../errors/errors.js';
import {
  VALID_PERMISSION_MODES, VALID_EFFORT_LEVELS, PLUGIN_URL, PLUGIN_LOCAL, MCP_SDK,
  FLAG_SHORT_PREFIX, LIST_SEPARATOR, JSON_OBJECT_PREFIX, JSON_OBJECT_SUFFIX,
} from '../constants.js';
import type { ClientOptions, QueryOptions } from '../types/index.js';

/**
 * Validates client options at construction time.
 * Fails fast with descriptive error messages.
 *
 * Beyond per-field checks this rejects the combinations the SDK itself refuses
 * at option intake, so a misconfiguration surfaces here rather than as an opaque
 * subprocess error several turns later.
 */
export function validateClientOptions(options: ClientOptions): void {
  if (options.maxTurns !== undefined && (options.maxTurns < 1 || !Number.isInteger(options.maxTurns))) {
    throw new ValidationError('maxTurns', 'must be a positive integer');
  }
  if (options.maxBudget !== undefined && options.maxBudget <= 0) {
    throw new ValidationError('maxBudget', 'must be a positive number');
  }
  if (
    options.taskBudgetTokens !== undefined
    && (options.taskBudgetTokens < 1 || !Number.isInteger(options.taskBudgetTokens))
  ) {
    throw new ValidationError('taskBudgetTokens', 'must be a positive integer');
  }
  if (options.permissionMode !== undefined) {
    if (![...VALID_PERMISSION_MODES].includes(options.permissionMode)) {
      throw new ValidationError('permissionMode', `must be one of: ${VALID_PERMISSION_MODES.join(', ')}`);
    }
  }
  if (options.effortLevel !== undefined) {
    if (![...VALID_EFFORT_LEVELS].includes(options.effortLevel)) {
      throw new ValidationError('effortLevel', `must be one of: ${VALID_EFFORT_LEVELS.join(', ')}`);
    }
  }
  if (options.mcpConfig && options.useSdk !== false) {
    throw new ValidationError(
      'mcpConfig',
      'is not supported in SDK mode. Use mcpServers (inline definitions) instead, or set useSdk: false for CLI mode',
    );
  }

  // The SDK's own arg builder throws on any plugin type it does not know, and
  // it only knows `local` — so a url plugin would fail from deep inside the SDK
  // with no mention of which option caused it.
  if (options.plugins?.some((plugin) => plugin.type === PLUGIN_URL) && options.useSdk !== false) {
    throw new ValidationError(
      'plugins',
      `${PLUGIN_URL} plugins are CLI mode only (--plugin-url). Use a ${PLUGIN_LOCAL} plugin, or set useSdk: false`,
    );
  }

  // Both modes reject an agent without a prompt at option intake — the SDK from
  // inside its own arg builder, the CLI from the --agents JSON schema. The type
  // keeps `prompt` optional for backwards compatibility (it shipped that way in
  // 0.6.x), so the requirement is enforced here instead, where the error can
  // name the agent.
  for (const [name, agent] of Object.entries(options.agents ?? {})) {
    if (!agent.prompt) {
      throw new ValidationError('agents', `agent "${name}" needs a prompt`);
    }
  }

  // The SDK refuses both permission hooks at once ("canUseTool callback cannot
  // be used with permissionPromptToolName"), from deep inside its arg builder.
  // CLI mode has no `canUseTool` at all, so only SDK mode is a conflict.
  if (options.canUseTool && options.permissionPromptToolName && options.useSdk !== false) {
    throw new ValidationError(
      'canUseTool',
      'cannot be combined with permissionPromptToolName — use one or the other',
    );
  }

  // The SDK compares the resolved `--fallback-model` value against `--model`
  // and throws when they match. The binary accepts the pair (verified), so this
  // is an SDK-mode-only conflict.
  if (options.fallbackModel !== undefined && options.model !== undefined && options.useSdk !== false) {
    const fallback = Array.isArray(options.fallbackModel)
      ? options.fallbackModel.join(LIST_SEPARATOR)
      : (options.fallbackModel as string);
    if (fallback === options.model) {
      throw new ValidationError(
        'fallbackModel',
        `cannot be the same model as \`model\` (${options.model}) — a fallback that repeats the failing model buys nothing`,
      );
    }
  }

  // `sandbox` is folded into the flag-settings layer, which a settings *path*
  // already owns wholesale — the SDK cannot merge the two and throws. An inline
  // settings object (or an inline JSON string) merges fine.
  if (options.sandbox && typeof options.settings === 'string' && options.useSdk !== false) {
    const trimmed = options.settings.trim();
    const isInlineJson = trimmed.startsWith(JSON_OBJECT_PREFIX) && trimmed.endsWith(JSON_OBJECT_SUFFIX);
    if (!isInlineJson) {
      throw new ValidationError(
        'sandbox',
        'cannot be combined with a `settings` file path — move the sandbox configuration into that file, or pass `settings` as an inline object',
      );
    }
  }

  // Continuing the most recent conversation means asking the store which one it
  // is, and `listSessions` is optional on the interface. Resuming an explicit id
  // needs no listing, which is why the SDK exempts it.
  if (
    options.sessionStore
    && options.continueSession
    && options.resume === undefined
    && !options.sessionStore.listSessions
    && options.useSdk !== false
  ) {
    throw new ValidationError(
      'sessionStore',
      'requires listSessions() when combined with continueSession — implement it, or resume an explicit session id',
    );
  }

  // Checkpoint blobs live beside the local transcript and are not mirrored, so
  // rewindFiles() fails after a store-backed resume. The SDK refuses the pair.
  if (options.sessionStore && options.enableFileCheckpointing && options.useSdk !== false) {
    throw new ValidationError(
      'enableFileCheckpointing',
      'cannot be combined with sessionStore — checkpoint blobs are not mirrored, so rewindFiles() cannot work after a store-backed resume',
    );
  }

  // In-process MCP servers hold a live object; CLI mode serializes mcpServers
  // into --mcp-config, where that object throws on its own circular structure.
  if (options.mcpServers && options.useSdk === false) {
    const inProcess = Object.entries(options.mcpServers)
      .filter(([, config]) => config.type === MCP_SDK)
      .map(([name]) => name);
    if (inProcess.length > 0) {
      throw new ValidationError(
        'mcpServers',
        `in-process servers (${inProcess.join(', ')}) are SDK mode only — they cannot be serialized for the CLI`,
      );
    }
  }

  // ── Mutually exclusive combinations ─────────────────────────────

  // `sessionId` names a NEW conversation; continuing or resuming already names
  // one. Forking is the documented exception — it gives the fork a chosen id.
  if (options.sessionId !== undefined && !options.forkSession) {
    if (options.continueSession) {
      throw new ValidationError(
        'sessionId',
        'cannot be combined with continueSession unless forkSession is also set',
      );
    }
    if (options.resume !== undefined) {
      throw new ValidationError(
        'sessionId',
        'cannot be combined with resume unless forkSession is also set',
      );
    }
  }

  // The CLI treats an undeclared dialog kind as "cannot display" and fails
  // closed, so declaring kinds without a handler is always a mistake.
  if (options.supportedDialogKinds?.length && !options.onUserDialog) {
    throw new ValidationError(
      'supportedDialogKinds',
      'requires onUserDialog — declaring dialog kinds without a handler is rejected at option intake',
    );
  }

  // The store mirrors what the subprocess writes locally, so there is nothing
  // to mirror once local persistence is off.
  if (options.sessionStore && options.noSessionPersistence) {
    throw new ValidationError(
      'sessionStore',
      'cannot be combined with noSessionPersistence — the mirror runs after a successful local write',
    );
  }

  // Both modes build the flag as `--` + key. A key that already carries a dash,
  // is empty, or contains whitespace can only produce argv the CLI misreads —
  // and it misreads it silently, several turns later.
  if (options.extraArgs) {
    for (const key of Object.keys(options.extraArgs)) {
      if (key.trim() === '') {
        throw new ValidationError('extraArgs', 'keys must be non-empty flag names');
      }
      if (key.startsWith(FLAG_SHORT_PREFIX)) {
        throw new ValidationError(
          'extraArgs',
          `key ${JSON.stringify(key)} must be written without the leading dashes`,
        );
      }
      if (/\s/.test(key)) {
        throw new ValidationError(
          'extraArgs',
          `key ${JSON.stringify(key)} must not contain whitespace`,
        );
      }
    }
  }
}

/**
 * Validates per-query options.
 */
export function validateQueryOptions(options: QueryOptions): void {
  if (options.maxTurns !== undefined && (options.maxTurns < 1 || !Number.isInteger(options.maxTurns))) {
    throw new ValidationError('maxTurns', 'must be a positive integer');
  }
  if (options.maxBudget !== undefined && options.maxBudget <= 0) {
    throw new ValidationError('maxBudget', 'must be a positive number');
  }
  if (
    options.taskBudgetTokens !== undefined
    && (options.taskBudgetTokens < 1 || !Number.isInteger(options.taskBudgetTokens))
  ) {
    throw new ValidationError('taskBudgetTokens', 'must be a positive integer');
  }
}

/**
 * Validates that a prompt is non-empty.
 */
export function validatePrompt(prompt: string): void {
  if (!prompt || !prompt.trim()) {
    throw new ValidationError('prompt', 'must be a non-empty string');
  }
}
