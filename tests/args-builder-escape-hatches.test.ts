import { describe, it, expect } from 'vitest';
import { buildArgs, mergeOptions } from '../src/builder/args-builder.js';
import { validateClientOptions } from '../src/utils/validation.js';
import { ValidationError } from '../src/errors/errors.js';
import {
  FLAGS_WITH_VALUE,
  FLAG_PLAN_MODE_INSTRUCTIONS,
  FLAG_PLUGIN_DIR,
  FLAG_PLUGIN_DIR_NO_MCP,
  FLAG_PLUGIN_URL,
  FLAG_PREFIX,
  FLAG_SETTINGS,
  FLAG_SHORT_PREFIX,
  FLAG_SYSTEM_PROMPT,
  FLAG_VALUE_ASSIGN,
  LIST_SEPARATOR,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  SYSTEM_PROMPT_SEPARATOR,
  getUsageLimitPrefixes,
} from '../src/constants.js';
import type { ClientOptions, QueryOptions } from '../src/types/index.js';

/** Build the argv a CLI-mode run would spawn with. */
function argv(client: ClientOptions, query?: QueryOptions): string[] {
  return buildArgs(mergeOptions(client, query, { prompt: 'Hi', outputFormat: 'json' }));
}

/** The token following `flag`, or `undefined` when the flag is absent. */
function valueOf(args: readonly string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe('extraArgs in CLI mode', () => {
  it('emits a --key value pair for a string value', () => {
    const args = argv({ extraArgs: { 'some-new-flag': 'value' } });

    expect(args).toContain('--some-new-flag');
    expect(valueOf(args, '--some-new-flag')).toBe('value');
  });

  it('emits a bare boolean flag for a null value', () => {
    const args = argv({ extraArgs: { 'a-boolean-flag': null } });
    const at = args.indexOf('--a-boolean-flag');

    expect(at).toBeGreaterThan(-1);
    // Nothing was consumed as its value: the flag is the final token.
    expect(args[at + 1]).toBeUndefined();
  });

  it('uses the --key=value spelling when the value itself starts with a dash', () => {
    // A separate `-1` token would be read by the CLI parser as the next flag.
    const args = argv({ extraArgs: { 'some-offset': '-1' } });

    expect(args).toContain('--some-offset=-1');
    expect(args).not.toContain('--some-offset');
  });

  it('keeps a single dash as an ordinary value', () => {
    // `-` alone is the conventional stdin placeholder, not a flag.
    const args = argv({ extraArgs: { 'read-from': '-' } });

    expect(valueOf(args, '--read-from')).toBe('-');
  });

  it('emits every entry, in insertion order', () => {
    const args = argv({ extraArgs: { first: 'a', second: null, third: 'c' } });

    expect(args.indexOf('--first')).toBeLessThan(args.indexOf('--second'));
    expect(args.indexOf('--second')).toBeLessThan(args.indexOf('--third'));
  });

  it('emits nothing for an empty record', () => {
    expect(argv({ extraArgs: {} })).toEqual(argv({}));
  });

  it('emits nothing when the option is absent', () => {
    expect(argv({}).some((token) => token.startsWith('--some'))).toBe(false);
  });

  it('places the entries last, so they win on last-occurrence flags', () => {
    const args = argv({ settings: '/etc/claude/settings.json', extraArgs: { override: 'x' } });

    expect(args.indexOf('--override')).toBeGreaterThan(args.indexOf(FLAG_SETTINGS));
    expect(args[args.length - 1]).toBe('x');
  });

  it('prefixes the key with exactly two dashes', () => {
    const args = argv({ extraArgs: { key: null } });

    expect(args).toContain(`${FLAG_PREFIX}key`);
  });
});

describe('extraArgs key validation', () => {
  it('rejects a key that already carries the leading dashes', () => {
    // `--` + `--foo` would spawn `----foo`.
    expect(() => validateClientOptions({ extraArgs: { '--foo': 'bar' } })).toThrow(ValidationError);
    expect(() => validateClientOptions({ extraArgs: { '-f': 'bar' } })).toThrow(/without the leading dashes/);
  });

  it('rejects an empty or blank key', () => {
    // A bare `--` ends option parsing and silently swallows the rest of argv.
    expect(() => validateClientOptions({ extraArgs: { '': null } })).toThrow(/non-empty flag names/);
    expect(() => validateClientOptions({ extraArgs: { '   ': null } })).toThrow(/non-empty flag names/);
  });

  it('rejects a key containing whitespace', () => {
    expect(() => validateClientOptions({ extraArgs: { 'two words': null } })).toThrow(/whitespace/);
  });

  it('accepts ordinary flag names', () => {
    expect(() =>
      validateClientOptions({ extraArgs: { 'some-new-flag': 'value', another: null } }),
    ).not.toThrow();
  });

  it('names the offending option', () => {
    try {
      validateClientOptions({ extraArgs: { '--foo': null } });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ValidationError).message).toContain('extraArgs');
    }
  });
});

describe('array-form systemPrompt in CLI mode', () => {
  const houseRules = 'You are a reviewer.';
  const perRun = 'Repo: kraube-konnektor';

  it('drops the dynamic boundary instead of joining it into the prompt', () => {
    const args = argv({ systemPrompt: [houseRules, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, perRun] });

    expect(valueOf(args, FLAG_SYSTEM_PROMPT)).toBe(`${houseRules}${SYSTEM_PROMPT_SEPARATOR}${perRun}`);
    expect(valueOf(args, FLAG_SYSTEM_PROMPT)).not.toContain(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);
  });

  it('joins the remaining parts with a blank line', () => {
    const args = argv({ systemPrompt: ['a', 'b'] });

    expect(valueOf(args, FLAG_SYSTEM_PROMPT)).toBe('a\n\nb');
  });

  it('drops every occurrence of the boundary, not just the first', () => {
    const args = argv({
      systemPrompt: ['a', SYSTEM_PROMPT_DYNAMIC_BOUNDARY, 'b', SYSTEM_PROMPT_DYNAMIC_BOUNDARY, 'c'],
    });

    expect(valueOf(args, FLAG_SYSTEM_PROMPT)).toBe('a\n\nb\n\nc');
  });

  it('emits no flag at all when the array holds nothing but the boundary', () => {
    const args = argv({ systemPrompt: [SYSTEM_PROMPT_DYNAMIC_BOUNDARY] });

    expect(args).not.toContain(FLAG_SYSTEM_PROMPT);
  });

  it('passes a plain string through untouched', () => {
    const args = argv({ systemPrompt: 'Be terse.' });

    expect(valueOf(args, FLAG_SYSTEM_PROMPT)).toBe('Be terse.');
  });

  it('does not strip a boundary that a plain string happens to contain', () => {
    // Only the array form assigns the sentinel a meaning.
    const args = argv({ systemPrompt: SYSTEM_PROMPT_DYNAMIC_BOUNDARY });

    expect(valueOf(args, FLAG_SYSTEM_PROMPT)).toBe(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);
  });

  it('honours the per-query array form too', () => {
    const args = argv(
      { systemPrompt: 'client' },
      { systemPrompt: ['query', SYSTEM_PROMPT_DYNAMIC_BOUNDARY, 'tail'] },
    );

    expect(valueOf(args, FLAG_SYSTEM_PROMPT)).toBe('query\n\ntail');
  });
});

describe('planModeInstructions in CLI mode', () => {
  const body = 'Draft a migration plan, then stop.';

  it('emits --plan-mode-instructions from the client level', () => {
    const args = argv({ permissionMode: 'plan', planModeInstructions: body });

    expect(valueOf(args, FLAG_PLAN_MODE_INSTRUCTIONS)).toBe(body);
  });

  it('lets a per-query value override the client one', () => {
    const args = argv({ planModeInstructions: 'client' }, { planModeInstructions: 'query' });

    expect(valueOf(args, FLAG_PLAN_MODE_INSTRUCTIONS)).toBe('query');
  });

  it('falls back to the client value when the query omits it', () => {
    const args = argv({ planModeInstructions: 'client' }, { model: 'opus' });

    expect(valueOf(args, FLAG_PLAN_MODE_INSTRUCTIONS)).toBe('client');
  });

  it('emits the flag even outside plan mode, matching SDK mode', () => {
    // The binary parks it on the flag layer and reads it only in plan mode.
    const args = argv({ planModeInstructions: body });

    expect(args).toContain(FLAG_PLAN_MODE_INSTRUCTIONS);
  });

  it('emits nothing when unset', () => {
    expect(argv({})).not.toContain(FLAG_PLAN_MODE_INSTRUCTIONS);
  });

  it('is registered as a value-taking flag', () => {
    // extractPrompt skips a flag's value only when the flag is listed here.
    expect(FLAGS_WITH_VALUE).toContain(FLAG_PLAN_MODE_INSTRUCTIONS);
  });
});

describe('PluginConfig.skipMcpDiscovery in CLI mode', () => {
  it('emits --plugin-dir-no-mcp instead of --plugin-dir', () => {
    const args = argv({ plugins: [{ type: 'local', path: '/p', skipMcpDiscovery: true }] });

    expect(valueOf(args, FLAG_PLUGIN_DIR_NO_MCP)).toBe('/p');
    // Both would load the plugin twice.
    expect(args).not.toContain(FLAG_PLUGIN_DIR);
  });

  it('emits --plugin-dir when the field is false', () => {
    const args = argv({ plugins: [{ type: 'local', path: '/p', skipMcpDiscovery: false }] });

    expect(valueOf(args, FLAG_PLUGIN_DIR)).toBe('/p');
    expect(args).not.toContain(FLAG_PLUGIN_DIR_NO_MCP);
  });

  it('emits --plugin-dir when the field is omitted', () => {
    const args = argv({ plugins: [{ type: 'local', path: '/p' }] });

    expect(valueOf(args, FLAG_PLUGIN_DIR)).toBe('/p');
    expect(args).not.toContain(FLAG_PLUGIN_DIR_NO_MCP);
  });

  it('chooses per entry across a mixed list', () => {
    const args = argv({
      plugins: [
        { type: 'local', path: '/plain' },
        { type: 'local', path: '/quiet', skipMcpDiscovery: true },
        { type: 'url', url: 'https://example.com/p.zip' },
      ],
    });

    expect(valueOf(args, FLAG_PLUGIN_DIR)).toBe('/plain');
    expect(valueOf(args, FLAG_PLUGIN_DIR_NO_MCP)).toBe('/quiet');
    expect(valueOf(args, FLAG_PLUGIN_URL)).toBe('https://example.com/p.zip');
  });

  it('leaves the url form alone', () => {
    const args = argv({ plugins: [{ type: 'url', url: 'https://example.com/p.zip' }] });

    expect(args).not.toContain(FLAG_PLUGIN_DIR_NO_MCP);
  });

  it('is registered as a value-taking flag', () => {
    expect(FLAGS_WITH_VALUE).toContain(FLAG_PLUGIN_DIR_NO_MCP);
  });
});

describe('argument literals live in constants', () => {
  it('spells the separators the CLI expects', () => {
    expect(SYSTEM_PROMPT_SEPARATOR).toBe('\n\n');
    expect(LIST_SEPARATOR).toBe(',');
    expect(FLAG_PREFIX).toBe('--');
    expect(FLAG_SHORT_PREFIX).toBe('-');
    expect(FLAG_VALUE_ASSIGN).toBe('=');
  });

  it('spells the two newly wired flags as the binary declares them', () => {
    expect(FLAG_PLAN_MODE_INSTRUCTIONS).toBe('--plan-mode-instructions');
    expect(FLAG_PLUGIN_DIR_NO_MCP).toBe('--plugin-dir-no-mcp');
  });

  it('still uses LIST_SEPARATOR for the comma-joined flags', () => {
    const args = argv({ fallbackModel: ['opus', 'sonnet'], settingSources: ['user', 'project'] });

    expect(args).toContain(['opus', 'sonnet'].join(LIST_SEPARATOR));
    expect(args).toContain(['user', 'project'].join(LIST_SEPARATOR));
  });
});

describe('getUsageLimitPrefixes', () => {
  it('returns the four tables the installed SDK declares', async () => {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    const prefixes = await getUsageLimitPrefixes();

    // Compared against the SDK itself, so a hand-copied table could not drift.
    expect(prefixes.USAGE_LIMIT_ERROR_PREFIXES).toEqual(sdk.USAGE_LIMIT_ERROR_PREFIXES);
    expect(prefixes.USAGE_WARNING_PREFIXES).toEqual(sdk.USAGE_WARNING_PREFIXES);
    expect(prefixes.USAGE_TRANSITION_PREFIXES).toEqual(sdk.USAGE_TRANSITION_PREFIXES);
    expect(prefixes.ORG_POLICY_LIMIT_PREFIXES).toEqual(sdk.ORG_POLICY_LIMIT_PREFIXES);
  });

  it('buckets a rate-limit message by prefix', async () => {
    const { USAGE_LIMIT_ERROR_PREFIXES, USAGE_WARNING_PREFIXES } = await getUsageLimitPrefixes();
    const hardStop = "You've reached your usage limit";
    const warning = "You've used 80% of your limit";

    expect(USAGE_LIMIT_ERROR_PREFIXES.some((p) => hardStop.startsWith(p))).toBe(true);
    expect(USAGE_WARNING_PREFIXES.some((p) => hardStop.startsWith(p))).toBe(false);
    expect(USAGE_WARNING_PREFIXES.some((p) => warning.startsWith(p))).toBe(true);
  });

  it('resolves the same tables on every call', async () => {
    expect(await getUsageLimitPrefixes()).toEqual(await getUsageLimitPrefixes());
  });
});

describe('extraArgs from an untyped JS caller', () => {
  it('coerces a non-string value the way the SDK does', () => {
    // TS forbids it; plain JS does not, and `.startsWith` on a number throws.
    const args = argv({ extraArgs: { retries: 3 as unknown as string } });

    expect(valueOf(args, '--retries')).toBe('3');
  });
});

describe('SDK option-intake conflicts surfaced as ValidationError', () => {
  it('rejects canUseTool together with permissionPromptToolName in SDK mode', () => {
    const options: ClientOptions = {
      canUseTool: async () => ({ behavior: 'allow', updatedInput: {} }),
      permissionPromptToolName: 'mcp__gate__ask',
    };

    expect(() => validateClientOptions(options)).toThrow(ValidationError);
    expect(() => validateClientOptions(options)).toThrow(/permissionPromptToolName/);
    // CLI mode has no `canUseTool` spelling at all, so there is no conflict.
    expect(() => validateClientOptions({ ...options, useSdk: false })).not.toThrow();
  });

  it('rejects a fallbackModel equal to the model in SDK mode', () => {
    expect(() => validateClientOptions({ model: 'opus', fallbackModel: 'opus' })).toThrow(ValidationError);
    expect(() => validateClientOptions({ model: 'opus', fallbackModel: ['opus'] })).toThrow(/fallbackModel/);
    // The binary accepts the pair, so CLI mode keeps working.
    expect(() => validateClientOptions({ model: 'opus', fallbackModel: 'opus', useSdk: false })).not.toThrow();
    expect(() => validateClientOptions({ model: 'opus', fallbackModel: ['sonnet', 'haiku'] })).not.toThrow();
  });

  it('rejects sandbox together with a settings file path, but not with inline settings', () => {
    expect(() =>
      validateClientOptions({ sandbox: { enabled: true }, settings: '/etc/claude/settings.json' }),
    ).toThrow(/sandbox/);
    expect(() => validateClientOptions({ sandbox: { enabled: true }, settings: { model: 'opus' } })).not.toThrow();
    // A JSON string is an inline object, not a path — the SDK merges it fine.
    expect(() => validateClientOptions({ sandbox: { enabled: true }, settings: '{"model":"opus"}' })).not.toThrow();
  });

  it('rejects continueSession with a sessionStore that cannot list sessions', () => {
    const store = { append: async () => {}, load: async () => null };

    expect(() => validateClientOptions({ sessionStore: store, continueSession: true })).toThrow(/listSessions/);
    // An explicit resume needs no listing.
    expect(() =>
      validateClientOptions({ sessionStore: store, continueSession: true, resume: 'abc' }),
    ).not.toThrow();
    expect(() =>
      validateClientOptions({
        sessionStore: { ...store, listSessions: async () => [] },
        continueSession: true,
      }),
    ).not.toThrow();
  });

  it('rejects enableFileCheckpointing together with a sessionStore', () => {
    expect(() =>
      validateClientOptions({
        sessionStore: { append: async () => {}, load: async () => null },
        enableFileCheckpointing: true,
      }),
    ).toThrow(/enableFileCheckpointing/);
  });
});
