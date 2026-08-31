import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Claude } from '../src/client/claude.js';
import { SdkExecutor, type SdkExecutorOptions } from '../src/executor/sdk-executor.js';
import type { ClientOptions } from '../src/types/index.js';
import type { SessionStore } from '../src/types/session.js';
import { sdkMock } from './helpers/sdk-mock.js';

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock } = await import('./helpers/sdk-mock.js');
  return createSdkModuleMock();
});

/**
 * Every option added by the 0.3.x parity work, followed from `ClientOptions`
 * through `toSdkExecutorOptions()` into the object handed to the SDK's
 * `query()`.
 *
 * Client options are checked through {@link Claude} on purpose: a field dropped
 * in `toSdkExecutorOptions()` is a silent no-op, not a type error, so the only
 * assertion that catches it is one that starts where a user starts.
 */

/** Build the session the way a user would and return the SDK `query()` options. */
async function optionsFromClient(options: ClientOptions): Promise<Record<string, unknown>> {
  const claude = new Claude(options);
  await claude.init();
  claude.close();
  return sdkMock.lastOptions();
}

/** Same, but starting from the executor, for fields the client does not expose. */
async function optionsFromExecutor(options: SdkExecutorOptions): Promise<Record<string, unknown>> {
  const executor = new SdkExecutor(options);
  await executor.init();
  executor.close();
  return sdkMock.lastOptions();
}

beforeEach(() => {
  sdkMock.reset();
});

describe('tools, skills and aliases', () => {
  it('translates the legacy tools sentinel ["default"] to the preset object', async () => {
    const options = await optionsFromClient({ tools: ['default'] });

    expect(options['tools']).toEqual({ type: 'preset', preset: 'claude_code' });
  });

  it('passes the explicit preset object through', async () => {
    const options = await optionsFromClient({ tools: { type: 'preset', preset: 'claude_code' } });

    expect(options['tools']).toEqual({ type: 'preset', preset: 'claude_code' });
  });

  it('forwards a real tool list verbatim', async () => {
    const options = await optionsFromClient({ tools: ['Read', 'Bash'] });

    expect(options['tools']).toEqual(['Read', 'Bash']);
  });

  it('does not treat "default" inside a longer list as the sentinel', async () => {
    const options = await optionsFromClient({ tools: ['default', 'Read'] });

    expect(options['tools']).toEqual(['default', 'Read']);
  });

  it('leaves tools unset when the option is absent', async () => {
    const options = await optionsFromClient({});

    expect('tools' in options).toBe(false);
  });

  it('forwards skills as a list', async () => {
    const options = await optionsFromClient({ skills: ['pdf', 'xlsx'] });

    expect(options['skills']).toEqual(['pdf', 'xlsx']);
  });

  it('forwards skills: "all" as the literal', async () => {
    const options = await optionsFromClient({ skills: 'all' });

    expect(options['skills']).toBe('all');
  });

  it('forwards toolAliases as a plain object copy', async () => {
    const aliases = { Bash: 'mcp__workspace__bash' };
    const options = await optionsFromClient({ toolAliases: aliases });

    expect(options['toolAliases']).toEqual(aliases);
    expect(options['toolAliases']).not.toBe(aliases);
  });

  it('forwards toolConfig', async () => {
    const options = await optionsFromClient({
      toolConfig: { askUserQuestion: { previewFormat: 'html' } },
    });

    expect(options['toolConfig']).toEqual({ askUserQuestion: { previewFormat: 'html' } });
  });
});

describe('system prompt forms', () => {
  it('keeps a custom systemPrompt when appendSystemPrompt is also set', async () => {
    // Regression: the two used to overwrite each other, silently discarding the
    // custom prompt.
    const options = await optionsFromClient({
      systemPrompt: 'You are a linter.',
      appendSystemPrompt: 'Be terse.',
    });

    expect(options['systemPrompt']).toBe('You are a linter.');
  });

  it('keeps a custom systemPrompt when excludeDynamicSystemPromptSections is also set', async () => {
    const options = await optionsFromClient({
      systemPrompt: 'You are a linter.',
      excludeDynamicSystemPromptSections: true,
    });

    expect(options['systemPrompt']).toBe('You are a linter.');
  });

  it('forwards the array form as a copied array (cache-boundary split)', async () => {
    const prompt = ['stable preamble', 'volatile tail'];
    const options = await optionsFromClient({ systemPrompt: prompt });

    expect(options['systemPrompt']).toEqual(prompt);
    expect(options['systemPrompt']).not.toBe(prompt);
  });

  it('builds the preset object for appendSystemPrompt alone', async () => {
    const options = await optionsFromClient({ appendSystemPrompt: 'Be terse.' });

    expect(options['systemPrompt']).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'Be terse.',
    });
  });

  it('builds the preset object for excludeDynamicSystemPromptSections alone', async () => {
    const options = await optionsFromClient({ excludeDynamicSystemPromptSections: true });

    expect(options['systemPrompt']).toEqual({
      type: 'preset',
      preset: 'claude_code',
      excludeDynamicSections: true,
    });
  });

  it('combines append and excludeDynamicSections on one preset object', async () => {
    const options = await optionsFromClient({
      appendSystemPrompt: 'Be terse.',
      excludeDynamicSystemPromptSections: false,
    });

    expect(options['systemPrompt']).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'Be terse.',
      excludeDynamicSections: false,
    });
  });

  it('leaves systemPrompt unset when none of the three forms is used', async () => {
    const options = await optionsFromClient({});

    expect(options['systemPrompt']).toBeUndefined();
  });
});

describe('runtime, process and identity', () => {
  it('maps runtime to the SDK executable selector', async () => {
    const options = await optionsFromClient({ runtime: 'bun' });

    expect(options['executable']).toBe('bun');
  });

  it('maps runtimeArgs to executableArgs as a copy', async () => {
    const args = ['--max-old-space-size=8192'];
    const options = await optionsFromClient({ runtimeArgs: args });

    expect(options['executableArgs']).toEqual(args);
    expect(options['executableArgs']).not.toBe(args);
  });

  it('keeps executable mapped to pathToClaudeCodeExecutable, not executable', async () => {
    const options = await optionsFromClient({ executable: '/usr/local/bin/claude' });

    expect(options['pathToClaudeCodeExecutable']).toBe('/usr/local/bin/claude');
    expect(options['executable']).toBeUndefined();
  });

  it('maps name to title', async () => {
    const options = await optionsFromClient({ name: 'nightly audit' });

    expect(options['title']).toBe('nightly audit');
  });

  it('forwards the session-level abortController', async () => {
    const abortController = new AbortController();
    const options = await optionsFromClient({ abortController });

    expect(options['abortController']).toBe(abortController);
  });

  it('forwards spawnClaudeCodeProcess', async () => {
    const spawnClaudeCodeProcess = vi.fn();
    const options = await optionsFromClient({
      spawnClaudeCodeProcess: spawnClaudeCodeProcess as never,
    });

    expect(options['spawnClaudeCodeProcess']).toBe(spawnClaudeCodeProcess);
  });

  it('merges env over process.env', async () => {
    const options = await optionsFromClient({ env: { KRAUBE_TEST_FLAG: 'on' } });
    const env = options['env'] as Record<string, string>;

    expect(env['KRAUBE_TEST_FLAG']).toBe('on');
    expect(env['PATH']).toBe(process.env['PATH']);
  });
});

describe('permissions and sandboxing', () => {
  it('forwards planModeInstructions', async () => {
    const options = await optionsFromClient({
      permissionMode: 'plan',
      planModeInstructions: 'Draft a migration plan only.',
    });

    expect(options['planModeInstructions']).toBe('Draft a migration plan only.');
    expect(options['permissionMode']).toBe('plan');
  });

  it('translates permissionMode "manual" to the SDK spelling "default"', async () => {
    const options = await optionsFromClient({ permissionMode: 'manual' });

    expect(options['permissionMode']).toBe('default');
  });

  it('forwards the sandbox config object', async () => {
    const sandbox = {
      enabled: true,
      failIfUnavailable: true,
      network: { allowedDomains: ['api.anthropic.com'], strictAllowlist: true },
      filesystem: { denyWrite: ['/etc'] },
    };
    const options = await optionsFromClient({ sandbox });

    expect(options['sandbox']).toEqual(sandbox);
  });

  it('forwards permissionPromptToolName and allowDangerouslySkipPermissions', async () => {
    const options = await optionsFromClient({
      permissionPromptToolName: 'mcp__approvals__ask',
      allowDangerouslySkipPermissions: true,
    });

    expect(options['permissionPromptToolName']).toBe('mcp__approvals__ask');
    expect(options['allowDangerouslySkipPermissions']).toBe(true);
  });
});

describe('budgets and sampling', () => {
  it('wraps taskBudgetTokens in the SDK taskBudget object', async () => {
    const options = await optionsFromClient({ taskBudgetTokens: 50_000 });

    expect(options['taskBudget']).toEqual({ total: 50_000 });
  });

  it('leaves taskBudget unset when the option is absent', async () => {
    const options = await optionsFromClient({});

    expect(options['taskBudget']).toBeUndefined();
  });

  it('maps maxBudget to maxBudgetUsd and effortLevel to effort', async () => {
    const options = await optionsFromClient({ maxBudget: 2.5, effortLevel: 'xhigh' });

    expect(options['maxBudgetUsd']).toBe(2.5);
    expect(options['effort']).toBe('xhigh');
  });

  it('honours maxThinkingTokens only when thinking is unset', async () => {
    const withoutThinking = await optionsFromClient({ maxThinkingTokens: 8_000 });
    expect(withoutThinking['maxThinkingTokens']).toBe(8_000);

    sdkMock.reset();
    const withThinking = await optionsFromClient({
      maxThinkingTokens: 8_000,
      thinking: { type: 'enabled', budgetTokens: 12_000 },
    });
    expect(withThinking['maxThinkingTokens']).toBeUndefined();
    expect(withThinking['thinking']).toEqual({ type: 'enabled', budgetTokens: 12_000 });
  });

  it('joins a fallbackModel list the way --fallback-model takes it', async () => {
    const options = await optionsFromClient({ fallbackModel: ['sonnet', 'haiku'] });

    expect(options['fallbackModel']).toBe('sonnet,haiku');
  });
});

describe('session identity and persistence', () => {
  it('forwards resume', async () => {
    const options = await optionsFromClient({ resume: 'sess-1' });

    expect(options['resume']).toBe('sess-1');
  });

  it('forwards a pinned sessionId', async () => {
    const options = await optionsFromClient({ sessionId: 'a-uuid' });

    expect(options['sessionId']).toBe('a-uuid');
  });

  it('maps continueSession to continue', async () => {
    const options = await optionsFromClient({ continueSession: true });

    expect(options['continue']).toBe(true);
  });

  it('forwards forkSession alongside resume', async () => {
    const options = await optionsFromClient({ resume: 'sess-1', forkSession: true });

    expect(options['forkSession']).toBe(true);
    expect(options['resume']).toBe('sess-1');
  });

  it('forwards forkSession alongside a pinned sessionId', async () => {
    const options = await optionsFromClient({ sessionId: 'a-uuid', forkSession: true });

    expect(options['forkSession']).toBe(true);
  });

  it('drops forkSession when there is nothing to fork from', async () => {
    const options = await optionsFromClient({ forkSession: true });

    expect(options['forkSession']).toBeUndefined();
  });

  it('forwards resumeSessionAt and resumeDropsTurn', async () => {
    const options = await optionsFromClient({
      resume: 'sess-1',
      resumeSessionAt: 'msg-42',
      resumeDropsTurn: 'msg-43',
    });

    expect(options['resumeSessionAt']).toBe('msg-42');
    expect(options['resumeDropsTurn']).toBe('msg-43');
  });

  it('maps noSessionPersistence to persistSession: false', async () => {
    const options = await optionsFromClient({ noSessionPersistence: true });

    expect(options['persistSession']).toBe(false);
  });

  it('forwards the sessionStore adapter and its flush policy', async () => {
    const sessionStore: SessionStore = {
      append: async () => { /* mirror */ },
      load: async () => null,
    };
    const options = await optionsFromClient({
      sessionStore,
      sessionStoreFlush: 'eager',
      sessionStoreLoadTimeoutMs: 5_000,
    });

    expect(options['sessionStore']).toBe(sessionStore);
    expect(options['sessionStoreFlush']).toBe('eager');
    expect(options['loadTimeoutMs']).toBe(5_000);
  });
});

describe('settings, plugins and escape hatches', () => {
  it('forwards managedSettings separately from settings', async () => {
    const options = await optionsFromClient({
      settings: { model: 'sonnet' },
      managedSettings: { permissions: { deny: ['Bash'] } },
    });

    // `settings` is serialized on the way out, `managedSettings` is not: the
    // SDK folds `settings` into the flag map and stringifies the value there,
    // so an inline object would reach the CLI as "[object Object]".
    expect(JSON.parse(options['settings'] as string)).toEqual({ model: 'sonnet' });
    expect(options['managedSettings']).toEqual({ permissions: { deny: ['Bash'] } });
  });

  it('forwards settingSources, plugins and extraArgs', async () => {
    const options = await optionsFromClient({
      settingSources: ['user', 'project'],
      plugins: [{ type: 'local', path: '/plugins/ops', skipMcpDiscovery: true }],
      extraArgs: { 'some-new-flag': 'value', 'a-boolean-flag': null },
    });

    expect(options['settingSources']).toEqual(['user', 'project']);
    expect(options['plugins']).toEqual([
      { type: 'local', path: '/plugins/ops', skipMcpDiscovery: true },
    ]);
    expect(options['extraArgs']).toEqual({ 'some-new-flag': 'value', 'a-boolean-flag': null });
  });

  it('wraps schema in the json_schema output format', async () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
    const options = await optionsFromClient({ schema });

    expect(options['outputFormat']).toEqual({ type: 'json_schema', schema });
  });

  it('maps additionalDirs to additionalDirectories', async () => {
    const options = await optionsFromClient({ additionalDirs: ['/pkg-a', '/pkg-b'] });

    expect(options['additionalDirectories']).toEqual(['/pkg-a', '/pkg-b']);
  });
});

describe('stream shape and host callbacks', () => {
  it('forwards includeHookEvents so the hook_* events are actually emitted', async () => {
    const options = await optionsFromClient({ includeHookEvents: true });

    expect(options['includeHookEvents']).toBe(true);
  });

  it('forwards forwardSubagentText and perTaskStopAffordance', async () => {
    const options = await optionsFromClient({
      forwardSubagentText: true,
      perTaskStopAffordance: true,
    });

    expect(options['forwardSubagentText']).toBe(true);
    expect(options['perTaskStopAffordance']).toBe(true);
  });

  it('forwards onUserDialog together with supportedDialogKinds', async () => {
    const onUserDialog = vi.fn(async () => ({ behavior: 'cancelled' as const }));
    const options = await optionsFromClient({
      onUserDialog,
      supportedDialogKinds: ['plan_review', 'diff'],
    });

    expect(options['onUserDialog']).toBe(onUserDialog);
    expect(options['supportedDialogKinds']).toEqual(['plan_review', 'diff']);
  });

  it('forwards includePartialMessages, promptSuggestions and agentProgressSummaries', async () => {
    const options = await optionsFromClient({
      includePartialMessages: true,
      promptSuggestions: true,
      agentProgressSummaries: true,
    });

    expect(options['includePartialMessages']).toBe(true);
    expect(options['promptSuggestions']).toBe(true);
    expect(options['agentProgressSummaries']).toBe(true);
  });

  it('collapses a debug filter string to the SDK boolean', async () => {
    const options = await optionsFromClient({ debug: 'api,hooks', debugFile: '/tmp/claude.log' });

    expect(options['debug']).toBe(true);
    expect(options['debugFile']).toBe('/tmp/claude.log');
  });

  it('passes debug: false through as false', async () => {
    const options = await optionsFromClient({ debug: false });

    expect(options['debug']).toBe(false);
  });

  it('leaves debug unset when it was never given', async () => {
    const options = await optionsFromClient({});

    expect('debug' in options).toBe(false);
  });
});

describe('executor-level options with no client field', () => {
  it('forwards initTimeoutMs without leaking it into the SDK options', async () => {
    const options = await optionsFromExecutor({ model: 'sonnet', initTimeoutMs: 5_000 });

    expect(options['initTimeoutMs']).toBeUndefined();
    expect(options['model']).toBe('sonnet');
  });

  it('forwards stderr and strictMcpConfig', async () => {
    const stderr = vi.fn();
    const options = await optionsFromExecutor({ stderr, strictMcpConfig: true });

    expect(options['stderr']).toBe(stderr);
    expect(options['strictMcpConfig']).toBe(true);
  });

  it('forwards hookCallbacks as the SDK hooks option', async () => {
    const hookCallbacks = { PreToolUse: [{ hooks: [async () => ({ continue: true })] }] };
    const options = await optionsFromExecutor({ hookCallbacks });

    expect(options['hooks']).toBe(hookCallbacks);
  });
});

describe('one client carries every new field at once', () => {
  it('reaches query() without dropping any of them', async () => {
    const sessionStore: SessionStore = { append: async () => {}, load: async () => null };
    const onUserDialog = vi.fn(async () => ({ behavior: 'cancelled' as const }));

    const options = await optionsFromClient({
      skills: ['pdf'],
      toolAliases: { Bash: 'mcp__ws__bash' },
      toolConfig: { askUserQuestion: { previewFormat: 'html' } },
      sandbox: { enabled: true },
      permissionMode: 'plan',
      planModeInstructions: 'plan only',
      taskBudgetTokens: 1_000,
      managedSettings: { model: 'sonnet' },
      sessionStore,
      sessionStoreFlush: 'batched',
      sessionStoreLoadTimeoutMs: 1_234,
      resume: 'sess-1',
      forkSession: true,
      resumeSessionAt: 'msg-1',
      resumeDropsTurn: 'msg-2',
      runtime: 'node',
      runtimeArgs: ['--trace-warnings'],
      name: 'audit',
      includeHookEvents: true,
      forwardSubagentText: true,
      perTaskStopAffordance: true,
      onUserDialog,
      supportedDialogKinds: ['plan_review'],
      extraArgs: { 'new-flag': null },
    });

    expect(options).toMatchObject({
      skills: ['pdf'],
      toolAliases: { Bash: 'mcp__ws__bash' },
      toolConfig: { askUserQuestion: { previewFormat: 'html' } },
      sandbox: { enabled: true },
      planModeInstructions: 'plan only',
      taskBudget: { total: 1_000 },
      managedSettings: { model: 'sonnet' },
      sessionStore,
      sessionStoreFlush: 'batched',
      loadTimeoutMs: 1_234,
      resume: 'sess-1',
      forkSession: true,
      resumeSessionAt: 'msg-1',
      resumeDropsTurn: 'msg-2',
      executable: 'node',
      executableArgs: ['--trace-warnings'],
      title: 'audit',
      includeHookEvents: true,
      forwardSubagentText: true,
      perTaskStopAffordance: true,
      onUserDialog,
      supportedDialogKinds: ['plan_review'],
      extraArgs: { 'new-flag': null },
    });
  });

  it('builds exactly one session, however many options are set', async () => {
    await optionsFromClient({ skills: 'all', includeHookEvents: true });

    expect(sdkMock.queries).toHaveLength(1);
  });
});
