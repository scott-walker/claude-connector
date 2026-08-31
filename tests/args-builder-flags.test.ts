import { describe, it, expect } from 'vitest';
import { buildArgs, buildSettingsPayload, mergeOptions } from '../src/builder/args-builder.js';
import type { ResolvedOptions } from '../src/builder/args-builder.js';
import type { ClientOptions, QueryOptions } from '../src/types/index.js';

/**
 * CLI-mode argv for the flags added by the 0.3.x parity work.
 *
 * Three rules get their own sections because they are easy to regress:
 * the stream-shaping flags are only legal under `--output-format stream-json`,
 * `--settings` may appear at most once (so hooks are folded into it), and every
 * hook entry needs the `type: 'command'` discriminator the settings schema
 * requires.
 */

/** Build argv the way the client does, from client + query options. */
function argv(
  client: ClientOptions,
  query?: QueryOptions,
  extra: Partial<Parameters<typeof mergeOptions>[2]> = {},
): string[] {
  return buildArgs(mergeOptions(client, query, {
    prompt: 'Test',
    outputFormat: 'json',
    ...extra,
  }));
}

/** Build argv from an already-resolved option set, for fields `mergeOptions` does not carry. */
function argvOf(overrides: Partial<ResolvedOptions>): string[] {
  return buildArgs({
    prompt: 'Test',
    outputFormat: 'json',
    cwd: '/repo',
    ...overrides,
  } as ResolvedOptions);
}

/** The value emitted directly after `flag`. */
function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/** Every value emitted directly after each occurrence of `flag`. */
function valuesAfter(args: readonly string[], flag: string): string[] {
  const values: string[] = [];
  args.forEach((arg, index) => {
    if (arg === flag && args[index + 1] !== undefined) values.push(args[index + 1]!);
  });
  return values;
}

describe('session identity flags', () => {
  it('emits --session-id for a caller-pinned new conversation', () => {
    const args = argv({ sessionId: 'a-uuid' });

    expect(valueAfter(args, '--session-id')).toBe('a-uuid');
    expect(args).not.toContain('--resume');
  });

  it('drops --session-id when the run already names a conversation', () => {
    const resumed = argv({ sessionId: 'a-uuid', resume: 'sess-1', forkSession: false });
    expect(resumed).not.toContain('--session-id');

    const continued = argv({ sessionId: 'a-uuid', continueSession: true });
    expect(continued).not.toContain('--session-id');
  });

  it('keeps --session-id alongside a resume when the run forks', () => {
    const args = argv({ sessionId: 'a-uuid', resume: 'sess-1', forkSession: true });

    expect(valueAfter(args, '--session-id')).toBe('a-uuid');
    expect(valueAfter(args, '--resume')).toBe('sess-1');
    expect(args).toContain('--fork-session');
  });

  it('emits --resume-session-at and --resume-drops-turn only against a resumed transcript', () => {
    const resumed = argv({
      resume: 'sess-1',
      resumeSessionAt: 'msg-42',
      resumeDropsTurn: 'msg-43',
    });
    expect(valueAfter(resumed, '--resume-session-at')).toBe('msg-42');
    expect(valueAfter(resumed, '--resume-drops-turn')).toBe('msg-43');

    const fresh = argv({ resumeSessionAt: 'msg-42', resumeDropsTurn: 'msg-43' });
    expect(fresh).not.toContain('--resume-session-at');
    expect(fresh).not.toContain('--resume-drops-turn');
  });

  it('accepts --resume-session-at against --continue too', () => {
    const args = argv({ continueSession: true, resumeSessionAt: 'msg-1' });

    expect(valueAfter(args, '--resume-session-at')).toBe('msg-1');
  });
});

describe('model and budget flags', () => {
  it('joins a fallback-model list with commas', () => {
    const args = argv({ fallbackModel: ['sonnet', 'haiku'] });

    expect(valueAfter(args, '--fallback-model')).toBe('sonnet,haiku');
  });

  it('emits a single fallback model unchanged', () => {
    const args = argv({ fallbackModel: 'haiku' });

    expect(valueAfter(args, '--fallback-model')).toBe('haiku');
  });

  it('emits --effort, including the xhigh level', () => {
    expect(valueAfter(argv({ effortLevel: 'xhigh' }), '--effort')).toBe('xhigh');
    expect(valueAfter(argv({ effortLevel: 'max' }), '--effort')).toBe('max');
  });

  it('emits --task-budget as a plain token count', () => {
    const args = argv({ taskBudgetTokens: 50_000 });

    expect(valueAfter(args, '--task-budget')).toBe('50000');
  });

  it('emits --autocompact for both the auto and threshold forms', () => {
    expect(valueAfter(argv({ autocompact: 'auto' }), '--autocompact')).toBe('auto');
    expect(valueAfter(argv({ autocompact: 500_000 }), '--autocompact')).toBe('500000');
  });

  it('emits --thinking plus the budget from the thinking config', () => {
    const args = argv({ thinking: { type: 'enabled', budgetTokens: 12_000 } });

    expect(valueAfter(args, '--thinking')).toBe('enabled');
    expect(valueAfter(args, '--max-thinking-tokens')).toBe('12000');
  });

  it('lets a thinking budget supersede maxThinkingTokens', () => {
    const args = argv({
      maxThinkingTokens: 8_000,
      thinking: { type: 'enabled', budgetTokens: 12_000 },
    });

    expect(valuesAfter(args, '--max-thinking-tokens')).toEqual(['12000']);
  });

  it('emits --max-thinking-tokens alone when there is no thinking config', () => {
    const args = argv({ maxThinkingTokens: 8_000 });

    expect(args).not.toContain('--thinking');
    expect(valueAfter(args, '--max-thinking-tokens')).toBe('8000');
  });

  it('emits --thinking without a budget for the adaptive and disabled modes', () => {
    expect(valueAfter(argv({ thinking: { type: 'adaptive' } }), '--thinking')).toBe('adaptive');
    expect(argv({ thinking: { type: 'adaptive' } })).not.toContain('--max-thinking-tokens');
    expect(valueAfter(argv({ thinking: { type: 'disabled' } }), '--thinking')).toBe('disabled');
  });
});

describe('permission flags', () => {
  it('emits --permission-prompt-tool', () => {
    const args = argv({ permissionPromptToolName: 'mcp__approvals__ask' });

    expect(valueAfter(args, '--permission-prompt-tool')).toBe('mcp__approvals__ask');
  });

  it('distinguishes the allow-flag from the skip-flag', () => {
    const allow = argv({ allowDangerouslySkipPermissions: true });
    expect(allow).toContain('--allow-dangerously-skip-permissions');
    expect(allow).not.toContain('--dangerously-skip-permissions');

    const skip = argv({ dangerouslySkipPermissions: true });
    expect(skip).toContain('--dangerously-skip-permissions');
    expect(skip).not.toContain('--allow-dangerously-skip-permissions');
  });

  it('passes the CLI-only permission mode "manual" straight through', () => {
    expect(valueAfter(argv({ permissionMode: 'manual' }), '--permission-mode')).toBe('manual');
  });
});

describe('tools flag', () => {
  it('emits an empty value for an empty tool list — "no built-in tools"', () => {
    const args = argv({ tools: [] });

    expect(valueAfter(args, '--tools')).toBe('');
  });

  it('emits each tool as its own argv token (the flag is variadic)', () => {
    const args = argv({ tools: ['Read', 'Bash'] });
    const index = args.indexOf('--tools');

    expect(args.slice(index, index + 3)).toEqual(['--tools', 'Read', 'Bash']);
  });

  it('never emits the SDK-only preset object', () => {
    const args = argv({ tools: { type: 'preset', preset: 'claude_code' } });

    expect(args).not.toContain('--tools');
  });
});

describe('system prompt flags', () => {
  it('folds an array-form system prompt into one --system-prompt value', () => {
    const args = argv({ systemPrompt: ['stable preamble', 'volatile tail'] });

    expect(valueAfter(args, '--system-prompt')).toBe('stable preamble\n\nvolatile tail');
  });

  it('emits the file forms of both system-prompt flags', () => {
    const args = argv({
      systemPromptFile: '/prompts/base.md',
      appendSystemPromptFile: '/prompts/extra.md',
    });

    expect(valueAfter(args, '--system-prompt-file')).toBe('/prompts/base.md');
    expect(valueAfter(args, '--append-system-prompt-file')).toBe('/prompts/extra.md');
  });

  it('emits --append-subagent-system-prompt', () => {
    const args = argv({ appendSubagentSystemPrompt: 'Never write files.' });

    expect(valueAfter(args, '--append-subagent-system-prompt')).toBe('Never write files.');
  });

  it('emits --exclude-dynamic-system-prompt-sections only when the preset is in play', () => {
    const preset = argv({ excludeDynamicSystemPromptSections: true });
    expect(preset).toContain('--exclude-dynamic-system-prompt-sections');

    // The CLI ignores it once the prompt is replaced wholesale.
    const replaced = argv({
      excludeDynamicSystemPromptSections: true,
      systemPrompt: 'You are a linter.',
    });
    expect(replaced).not.toContain('--exclude-dynamic-system-prompt-sections');
  });
});

describe('plugins, betas and files', () => {
  it('emits one --plugin-dir per local plugin and one --plugin-url per remote one', () => {
    const args = argv({
      plugins: [
        { type: 'local', path: '/plugins/a' },
        { type: 'url', url: 'https://example.com/p.zip' },
        { type: 'local', path: '/plugins/b' },
      ],
    });

    expect(valuesAfter(args, '--plugin-dir')).toEqual(['/plugins/a', '/plugins/b']);
    expect(valuesAfter(args, '--plugin-url')).toEqual(['https://example.com/p.zip']);
  });

  it('emits --betas for the typed beta list', () => {
    const args = argv({ betas: ['context-1m-2025-08-07'] });

    expect(valueAfter(args, '--betas')).toBe('context-1m-2025-08-07');
  });

  it('emits --betas variadically when several are resolved', () => {
    const args = argvOf({ betas: ['beta-a', 'beta-b'] });
    const index = args.indexOf('--betas');

    expect(args.slice(index, index + 3)).toEqual(['--betas', 'beta-a', 'beta-b']);
  });

  it('emits --file variadically from the per-query option', () => {
    const args = argv({}, { files: ['file_123:docs/a.pdf', 'file_456:docs/b.pdf'] });
    const index = args.indexOf('--file');

    expect(args.slice(index, index + 3)).toEqual([
      '--file',
      'file_123:docs/a.pdf',
      'file_456:docs/b.pdf',
    ]);
  });
});

describe('mode and isolation flags', () => {
  it('emits --bare before any context flag', () => {
    const args = argv({ bare: true });

    expect(args[0]).toBe('--print');
    expect(args[1]).toBe('--bare');
  });

  it('emits --safe-mode, --disable-slash-commands and --brief', () => {
    const args = argv({ safeMode: true, disableSlashCommands: true, brief: true });

    expect(args).toContain('--safe-mode');
    expect(args).toContain('--disable-slash-commands');
    expect(args).toContain('--brief');
  });

  it('emits --setting-sources as a comma-joined list', () => {
    const args = argv({ settingSources: ['user', 'project'] });

    expect(valueAfter(args, '--setting-sources')).toBe('user,project');
  });

  it('emits an empty --setting-sources for full isolation', () => {
    const args = argv({ settingSources: [] });

    expect(args).toContain('--setting-sources');
    expect(valueAfter(args, '--setting-sources')).toBe('');
  });

  it('never emits --background: the binary rejects it together with --print', () => {
    const args = argv({}, { background: true });

    expect(args).not.toContain('--background');
    expect(args).not.toContain('--bg');
    expect(args).toContain('--print');
  });
});

describe('diagnostics flags', () => {
  it('emits --debug bare for true and with the filter for a string', () => {
    const bare = argv({ debug: true });
    expect(bare).toContain('--debug');
    expect(valueAfter(bare, '--debug')).not.toBe('api,hooks');

    const filtered = argv({ debug: 'api,hooks' });
    expect(valueAfter(filtered, '--debug')).toBe('api,hooks');
  });

  it('omits --debug for false and for an empty filter', () => {
    expect(argv({ debug: false })).not.toContain('--debug');
    expect(argv({ debug: '' })).not.toContain('--debug');
  });

  it('emits --debug-file', () => {
    expect(valueAfter(argv({ debugFile: '/tmp/claude.log' }), '--debug-file'))
      .toBe('/tmp/claude.log');
  });
});

describe('stream-json gating', () => {
  const streaming: ClientOptions = {
    includeHookEvents: true,
    includePartialMessages: true,
    forwardSubagentText: true,
    replayUserMessages: true,
    promptSuggestions: true,
  };

  it('emits the stream-shaping flags under --output-format stream-json', () => {
    const args = buildArgs(mergeOptions(streaming, undefined, {
      prompt: 'Test',
      outputFormat: 'stream-json',
    }));

    expect(args).toContain('--include-hook-events');
    expect(args).toContain('--include-partial-messages');
    expect(args).toContain('--forward-subagent-text');
    expect(valueAfter(args, '--prompt-suggestions')).toBe('true');
  });

  it('suppresses every stream-shaping flag under --output-format json', () => {
    const args = argv(streaming);

    expect(args).not.toContain('--include-hook-events');
    expect(args).not.toContain('--include-partial-messages');
    expect(args).not.toContain('--forward-subagent-text');
    expect(args).not.toContain('--replay-user-messages');
    expect(args).not.toContain('--prompt-suggestions');
  });

  it('adds --verbose whenever the output format is stream-json', () => {
    const args = buildArgs(mergeOptions({}, undefined, {
      prompt: 'Test',
      outputFormat: 'stream-json',
    }));

    expect(args).toContain('--verbose');
  });

  it('needs stream-json on BOTH directions for --replay-user-messages', () => {
    const outputOnly = argvOf({
      outputFormat: 'stream-json',
      replayUserMessages: true,
    });
    expect(outputOnly).not.toContain('--replay-user-messages');

    const bothDirections = argvOf({
      outputFormat: 'stream-json',
      inputFormat: 'stream-json',
      replayUserMessages: true,
    });
    expect(bothDirections).toContain('--replay-user-messages');
    expect(valueAfter(bothDirections, '--input-format')).toBe('stream-json');
  });

  it('emits --prompt-suggestions WITH a value, including false', () => {
    const off = argvOf({ outputFormat: 'stream-json', promptSuggestions: false });

    expect(valueAfter(off, '--prompt-suggestions')).toBe('false');
  });
});

describe('--settings is emitted at most once', () => {
  it('emits nothing when neither settings nor hooks are set', () => {
    expect(argv({})).not.toContain('--settings');
    expect(buildSettingsPayload(undefined, undefined)).toBeUndefined();
    expect(buildSettingsPayload(undefined, {})).toBeUndefined();
  });

  it('emits a settings path verbatim', () => {
    const args = argv({ settings: '/etc/claude/settings.json' });

    expect(valuesAfter(args, '--settings')).toEqual(['/etc/claude/settings.json']);
  });

  it('does NOT fold hooks into a settings path — a path and an object cannot merge', () => {
    const payload = buildSettingsPayload('/etc/claude/settings.json', {
      Stop: [{ hooks: [{ command: 'say done' }] }],
    });

    expect(payload).toBe('/etc/claude/settings.json');
  });

  it('merges an inline settings object with hooks into ONE flag', () => {
    const args = argv({
      settings: { model: 'sonnet' },
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] },
    });

    expect(args.filter((arg) => arg === '--settings')).toHaveLength(1);
    expect(JSON.parse(valueAfter(args, '--settings')!)).toEqual({
      model: 'sonnet',
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] },
    });
  });

  it('lets the hooks option win per event over settings.hooks', () => {
    const payload = buildSettingsPayload(
      { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'from settings' }] }] } },
      { Stop: [{ hooks: [{ type: 'command', command: 'from hooks' }] }] },
    );

    expect(JSON.parse(payload!)).toEqual({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'from hooks' }] }] },
    });
  });

  it('keeps settings.hooks entries for events the hooks option does not mention', () => {
    const payload = buildSettingsPayload(
      { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'boot' }] }] } },
      { Stop: [{ hooks: [{ type: 'command', command: 'done' }] }] },
    );

    expect(Object.keys(JSON.parse(payload!).hooks).sort()).toEqual(['SessionStart', 'Stop']);
  });

  it('emits hooks alone as {"hooks":{…}}', () => {
    const payload = buildSettingsPayload(undefined, {
      Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
    });

    expect(JSON.parse(payload!)).toEqual({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] },
    });
  });

  it('emits an inline settings object with no hooks key when there are none', () => {
    const payload = buildSettingsPayload({ model: 'sonnet' }, undefined);

    expect(JSON.parse(payload!)).toEqual({ model: 'sonnet' });
  });
});

describe('hook entries get the type: "command" discriminator', () => {
  it('stamps type on an entry that relies on the default', () => {
    const payload = buildSettingsPayload(undefined, {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'audit.sh', timeout: 5 }] }],
    });

    expect(JSON.parse(payload!)).toEqual({
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'audit.sh', timeout: 5 }] },
        ],
      },
    });
  });

  it('leaves a non-command hook variant untouched', () => {
    const payload = buildSettingsPayload(undefined, {
      Stop: [{ hooks: [{ type: 'prompt', prompt: 'summarize' }] }],
    });

    expect(JSON.parse(payload!).hooks.Stop[0].hooks[0]).toEqual({
      type: 'prompt',
      prompt: 'summarize',
    });
  });

  it('stamps every entry of a multi-entry matcher', () => {
    const payload = buildSettingsPayload(undefined, {
      Stop: [{ hooks: [{ command: 'a' }, { command: 'b' }] }],
    });

    expect(JSON.parse(payload!).hooks.Stop[0].hooks).toEqual([
      { type: 'command', command: 'a' },
      { type: 'command', command: 'b' },
    ]);
  });

  it('passes a settings block using a newer schema through untouched', () => {
    const payload = buildSettingsPayload(undefined, {
      FutureEvent: 'not-an-array',
      Stop: [{ notAMatcher: true }],
    } as Record<string, unknown>);

    const parsed = JSON.parse(payload!);
    expect(parsed.hooks.FutureEvent).toBe('not-an-array');
    expect(parsed.hooks.Stop).toEqual([{ notAMatcher: true }]);
  });
});

describe('mergeOptions carries the new fields', () => {
  it('lets a query-level taskBudgetTokens override the client-level one', () => {
    const resolved = mergeOptions(
      { taskBudgetTokens: 1_000 },
      { taskBudgetTokens: 2_000 },
      { prompt: 'Test', outputFormat: 'json' },
    );

    expect(resolved.taskBudgetTokens).toBe(2_000);
  });

  it('carries the client-only fields the CLI still needs', () => {
    const resolved = mergeOptions(
      {
        includeHookEvents: true,
        forwardSubagentText: true,
        replayUserMessages: true,
        appendSubagentSystemPrompt: 'be terse',
        excludeDynamicSystemPromptSections: true,
        autocompact: 'auto',
        maxThinkingTokens: 8_000,
        bare: true,
        brief: true,
        safeMode: true,
        disableSlashCommands: true,
        permissionPromptToolName: 'mcp__x__ask',
        resumeSessionAt: 'msg-1',
        resumeDropsTurn: 'msg-2',
      },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );

    expect(resolved).toMatchObject({
      includeHookEvents: true,
      forwardSubagentText: true,
      replayUserMessages: true,
      appendSubagentSystemPrompt: 'be terse',
      excludeDynamicSystemPromptSections: true,
      autocompact: 'auto',
      maxThinkingTokens: 8_000,
      bare: true,
      brief: true,
      safeMode: true,
      disableSlashCommands: true,
      permissionPromptToolName: 'mcp__x__ask',
      resumeSessionAt: 'msg-1',
      resumeDropsTurn: 'msg-2',
    });
  });

  it('lets the caller-supplied session identity win over the client defaults', () => {
    const resolved = mergeOptions(
      { resume: 'client-session', sessionId: 'client-uuid', resumeSessionAt: 'client-msg' },
      undefined,
      {
        prompt: 'Test',
        outputFormat: 'json',
        sessionId: 'call-session',
        newSessionId: 'call-uuid',
        resumeSessionAt: 'call-msg',
      },
    );

    expect(resolved.sessionId).toBe('call-session');
    expect(resolved.newSessionId).toBe('call-uuid');
    expect(resolved.resumeSessionAt).toBe('call-msg');
  });
});
