import type { ClientOptions } from '../types/index.js';
import type { SdkExecutorOptions } from '../executor/sdk-executor.js';
import { buildSettingsPayload } from '../builder/args-builder.js';

/**
 * Project {@link ClientOptions} onto the options the persistent SDK session is
 * built from.
 *
 * This is the single place client options reach SDK mode, so a field missing
 * here is a silent drop, not a type error — every {@link SdkExecutorOptions}
 * field is listed below, in the order the SDK session consumes them.
 *
 * It lives in its own module because two callers need it: {@link Claude}, which
 * builds the client's session, and {@link Session.fork}, which builds a session
 * bound to the forked transcript.
 *
 * The CLI-only half of {@link ClientOptions} is deliberately absent, because
 * the SDK has no equivalent option and no equivalent flag: `mcpConfig`
 * (rejected in SDK mode by `validateClientOptions`), `systemPromptFile`,
 * `appendSystemPromptFile`, `appendSubagentSystemPrompt`, `autocompact`,
 * `disableSlashCommands`, `replayUserMessages`, `brief`,
 * `dangerouslySkipPermissions`, `safeMode` and `bare`. Reach those in SDK mode
 * through {@link ClientOptions.extraArgs}, which the SDK forwards to the same
 * CLI process verbatim.
 *
 * `useSdk` is absent for a different reason: it picks the transport, so the
 * {@link Claude} constructor consumes it and it never travels further.
 *
 * `hooks` is the one exception to the one-field-one-option shape: shell hooks
 * have no dedicated SDK option, but the settings file does carry them, so they
 * are folded into `settings` exactly as CLI mode folds them into `--settings`.
 *
 * The eleven CLI-only names, plus `useSdk`, are the whole of the omission —
 * every other {@link ClientOptions} field is assigned below, so the two
 * interfaces stay in step field for field and a newly added option is either
 * mapped here or named above. `tests/type-claims.test.ts` holds that line: it
 * fails a field that neither appears in this module nor says "CLI mode only".
 */
export function toSdkExecutorOptions(options: ClientOptions): SdkExecutorOptions {
  return {
    // ── Process & workspace ───────────────────────────────────────
    pathToClaudeCodeExecutable: options.executable,
    runtime: options.runtime,
    runtimeArgs: options.runtimeArgs,
    cwd: options.cwd,
    env: options.env,
    additionalDirs: options.additionalDirs ? [...options.additionalDirs] : undefined,
    // The SDK's own spawn hook is untyped here to keep `SpawnOptions` /
    // `SpawnedProcess` out of the executor's dependency surface.
    spawnClaudeCodeProcess: options.spawnClaudeCodeProcess as ((options: unknown) => unknown) | undefined,
    abortController: options.abortController,
    initTimeoutMs: options.initTimeoutMs,
    postResultDrainMs: options.postResultDrainMs,

    // ── Model & sampling ──────────────────────────────────────────
    model: options.model,
    fallbackModel: options.fallbackModel,
    effortLevel: options.effortLevel,
    thinking: options.thinking,
    maxThinkingTokens: options.maxThinkingTokens,
    maxTurns: options.maxTurns,
    maxBudget: options.maxBudget,
    taskBudgetTokens: options.taskBudgetTokens,
    betas: options.betas ? [...options.betas] : undefined,
    schema: options.schema,

    // ── System prompt ─────────────────────────────────────────────
    systemPrompt: options.systemPrompt,
    appendSystemPrompt: options.appendSystemPrompt,
    excludeDynamicSystemPromptSections: options.excludeDynamicSystemPromptSections,

    // ── Permissions ───────────────────────────────────────────────
    permissionMode: options.permissionMode,
    planModeInstructions: options.planModeInstructions,
    canUseTool: options.canUseTool,
    permissionPromptToolName: options.permissionPromptToolName,
    allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions,
    sandbox: options.sandbox,

    // ── Tools, agents & skills ────────────────────────────────────
    allowedTools: options.allowedTools ? [...options.allowedTools] : undefined,
    disallowedTools: options.disallowedTools ? [...options.disallowedTools] : undefined,
    // Passed by reference: the preset form is an object, not a list.
    tools: options.tools,
    toolAliases: options.toolAliases,
    toolConfig: options.toolConfig,
    skills: options.skills,
    agents: options.agents,
    agent: options.agent,
    agentProgressSummaries: options.agentProgressSummaries,
    forwardSubagentText: options.forwardSubagentText,
    perTaskStopAffordance: options.perTaskStopAffordance,
    enableFileCheckpointing: options.enableFileCheckpointing,

    // ── MCP ───────────────────────────────────────────────────────
    mcpServers: options.mcpServers,
    strictMcpConfig: options.strictMcpConfig,

    // ── Hooks & host callbacks ────────────────────────────────────
    hookCallbacks: options.hookCallbacks,
    includeHookEvents: options.includeHookEvents,
    onElicitation: options.onElicitation,
    onUserDialog: options.onUserDialog,
    supportedDialogKinds: options.supportedDialogKinds,
    stderr: options.stderr,

    // ── Session identity & persistence ────────────────────────────
    name: options.name,
    resume: options.resume,
    sessionId: options.sessionId,
    continueSession: options.continueSession,
    forkSession: options.forkSession,
    resumeSessionAt: options.resumeSessionAt,
    resumeDropsTurn: options.resumeDropsTurn,
    noSessionPersistence: options.noSessionPersistence,
    sessionStore: options.sessionStore,
    sessionStoreFlush: options.sessionStoreFlush,
    sessionStoreLoadTimeoutMs: options.sessionStoreLoadTimeoutMs,

    // ── Settings & plugins ────────────────────────────────────────
    settingSources: options.settingSources,
    settings: toSdkSettings(options),
    managedSettings: options.managedSettings,
    plugins: options.plugins,
    extraArgs: options.extraArgs,

    // ── Stream shape & diagnostics ────────────────────────────────
    includePartialMessages: options.includePartialMessages,
    promptSuggestions: options.promptSuggestions,
    debug: options.debug,
    debugFile: options.debugFile,
  };
}

/**
 * Fold {@link ClientOptions.hooks} into the value handed to the SDK's
 * `settings` option.
 *
 * Shell hooks have no SDK option of their own, but the SDK forwards `settings`
 * to the CLI's `--settings` flag, and the settings schema is where hooks live —
 * so the same payload {@link buildSettingsPayload} builds for CLI mode works
 * here unchanged, and both modes honour the same hooks.
 *
 * Always a string, never an object: the SDK stringifies the value on its way to
 * the flag, so an inline object would arrive as `[object Object]`. A `settings`
 * **path** is passed through untouched and `hooks` is not folded in — a path and
 * an inline object cannot share one flag, exactly as in CLI mode.
 */
function toSdkSettings(options: ClientOptions): string | undefined {
  return buildSettingsPayload(options.settings, options.hooks);
}
