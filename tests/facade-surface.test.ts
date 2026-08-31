import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Claude } from '../src/client/claude.js';
import { Session } from '../src/client/session.js';
import { SdkExecutor } from '../src/executor/sdk-executor.js';
import type { IExecutor } from '../src/executor/interface.js';
import type { ClientOptions, QueryResult, StreamEvent } from '../src/types/index.js';
import { sdkMock } from './helpers/sdk-mock.js';
import * as barrel from '../src/index.js';
import * as constants from '../src/constants.js';

/**
 * The follow-up fixes on the facade layer: the barrel's exports, the `startup()`
 * wrapper, shell hooks reaching SDK mode, and `Session.fork()` handing back a
 * branch that really is bound to the forked transcript.
 *
 * The SDK module is mocked with the shared in-memory stand-in plus a `startup`
 * of our own, which the shared mock has no reason to carry.
 */

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock, sdkMock: mock } = await import('./helpers/sdk-mock.js');
  return {
    ...createSdkModuleMock(),
    startup(params?: unknown) {
      mock.record('startup', [params]);
      return Promise.resolve(mock.returns['startup']);
    },
  };
});

beforeEach(() => {
  sdkMock.reset();
});

/** A plain executor — never an `SdkExecutor`, so it stands in for CLI mode. */
function createExecutor(sessionId = 'sess-001', result?: Partial<QueryResult>): IExecutor {
  const full: QueryResult = {
    text: 'response',
    sessionId,
    usage: { inputTokens: 1, outputTokens: 2 },
    cost: null,
    durationMs: 10,
    messages: [],
    structured: null,
    raw: {},
    ...result,
  };

  return {
    execute: vi.fn().mockResolvedValue(full),
    stream: vi.fn().mockImplementation(async function* () {
      yield { type: 'result', text: 'response', sessionId } as StreamEvent;
    }),
    abort: vi.fn(),
  };
}

/** Build the session a user would and read back the SDK `query()` options. */
async function optionsFromClient(options: ClientOptions): Promise<Record<string, unknown>> {
  const claude = new Claude(options);
  await claude.init();
  claude.close();
  return sdkMock.lastOptions();
}

// ── Barrel exports ────────────────────────────────────────────────

describe('the constants barrel exports the documented defaults', () => {
  it('re-exports every DEFAULT_* value, with the values constants.ts declares', () => {
    expect(barrel.DEFAULT_EXECUTABLE).toBe(constants.DEFAULT_EXECUTABLE);
    expect(barrel.DEFAULT_MODEL).toBe(constants.DEFAULT_MODEL);
    expect(barrel.DEFAULT_TIMEOUT_MS).toBe(constants.DEFAULT_TIMEOUT_MS);
    expect(barrel.DEFAULT_INIT_TIMEOUT_MS).toBe(constants.DEFAULT_INIT_TIMEOUT_MS);
    expect(barrel.DEFAULT_MAX_BUFFER_BYTES).toBe(constants.DEFAULT_MAX_BUFFER_BYTES);
  });

  it('exposes DEFAULT_TIMEOUT_MS as a number, the way the errors guide uses it', () => {
    // wiki/api/errors.md imports it alongside CliTimeoutError and compares it
    // against `error.timeoutMs`, so it has to be a real number at runtime.
    expect(typeof barrel.DEFAULT_TIMEOUT_MS).toBe('number');
    expect(barrel.DEFAULT_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

// ── startup() ─────────────────────────────────────────────────────

describe('startup()', () => {
  it('is a real export, so WarmQuery has a producer', () => {
    expect(typeof barrel.startup).toBe('function');
  });

  it('forwards its params to the SDK and returns the warm handle', async () => {
    const handle = { query: vi.fn(), close: vi.fn() };
    sdkMock.returns['startup'] = handle;

    const warm = await barrel.startup({
      options: { model: 'sonnet' },
      initializeTimeoutMs: 5_000,
    });

    expect(sdkMock.argsOf('startup')).toEqual([
      { options: { model: 'sonnet' }, initializeTimeoutMs: 5_000 },
    ]);
    expect(warm).toBe(handle);
  });

  it('passes nothing through when called with no params', async () => {
    sdkMock.returns['startup'] = { query: vi.fn(), close: vi.fn() };

    await barrel.startup();

    expect(sdkMock.argsOf('startup')).toEqual([undefined]);
  });
});

// ── Shell hooks in SDK mode ───────────────────────────────────────

describe('ClientOptions.hooks reaches SDK mode through settings', () => {
  const hooks = {
    Stop: [{ hooks: [{ type: 'command' as const, command: 'notify-send done' }] }],
  };

  it('folds hooks into settings as a JSON literal string', async () => {
    const options = await optionsFromClient({ hooks });

    // A string, not an object: the SDK stringifies the value on its way to
    // `--settings`, so an object would arrive as "[object Object]".
    expect(typeof options['settings']).toBe('string');
    expect(JSON.parse(options['settings'] as string)).toEqual({ hooks });
  });

  it('merges with a user-supplied settings object rather than clobbering it', async () => {
    const options = await optionsFromClient({
      settings: { model: 'sonnet', permissions: { allow: ['Bash(*)'] } },
      hooks,
    });

    expect(JSON.parse(options['settings'] as string)).toEqual({
      model: 'sonnet',
      permissions: { allow: ['Bash(*)'] },
      hooks,
    });
  });

  it('stamps the type discriminator the settings schema requires', async () => {
    const options = await optionsFromClient({
      hooks: { Stop: [{ hooks: [{ command: 'say done' }] }] },
    });

    expect(JSON.parse(options['settings'] as string)).toEqual({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] },
    });
  });

  it('passes a settings path through verbatim and does not fold hooks into it', async () => {
    const options = await optionsFromClient({ settings: '/etc/claude/settings.json', hooks });

    expect(options['settings']).toBe('/etc/claude/settings.json');
  });

  it('leaves settings unset when neither settings nor hooks are given', async () => {
    const options = await optionsFromClient({ model: 'sonnet' });

    expect(options['settings']).toBeUndefined();
  });
});

// ── Session.fork() ────────────────────────────────────────────────

describe('Session.fork() in SDK mode', () => {
  /** A Session on a real SdkExecutor, with an id but no turn run yet. */
  function sdkSession(options: ClientOptions = {}): Session {
    const clientOptions: ClientOptions = { cwd: '/repo', resume: 'sess-1', ...options };
    return new Session(
      clientOptions,
      new SdkExecutor({ cwd: clientOptions.cwd, resume: clientOptions.resume }),
      { resume: 'sess-1' },
    );
  }

  it('binds the branch to the forked transcript instead of the original session', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const session = sdkSession();

    const branch = await session.fork({ title: 'alt' });
    await branch.query('Try the other approach');

    // One SDK session was opened, and it resumes the fork — not 'sess-1'.
    expect(sdkMock.queries).toHaveLength(1);
    expect(sdkMock.lastOptions()['resume']).toBe('forked-1');

    branch.close();
  });

  it('gives the branch its own executor, so the original session is untouched', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const session = sdkSession();

    const branch = await session.fork();

    expect(branch).toBeInstanceOf(Session);
    expect(branch).not.toBe(session);
    expect(branch.sessionId).toBe('forked-1');
    expect(branch.queryCount).toBe(0);
    expect(session.sessionId).toBe('sess-1');
    expect(session.queryCount).toBe(0);
  });

  it('inherits every non-identity client option', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const session = sdkSession({ model: 'opus', maxTurns: 3 });

    const branch = await session.fork();
    await branch.query('go');

    const options = sdkMock.lastOptions();
    expect(options['model']).toBe('opus');
    expect(options['maxTurns']).toBe(3);

    branch.close();
  });

  it('drops identity that named the parent transcript', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const session = new Session(
      { cwd: '/repo', resume: 'sess-1', forkSession: true, resumeSessionAt: 'msg-2' },
      new SdkExecutor({ cwd: '/repo', resume: 'sess-1' }),
      { resume: 'sess-1' },
    );

    const branch = await session.fork();
    await branch.query('go');

    const options = sdkMock.lastOptions();
    expect(options['resume']).toBe('forked-1');
    // A second fork, or a truncating resume aimed at the parent, would put the
    // branch back on a transcript it was branched away from.
    expect(options['forkSession']).toBeUndefined();
    expect(options['resumeSessionAt']).toBeUndefined();

    branch.close();
  });

  it('does not warn about inert session identity for its own branch', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = sdkSession();

    const branch = await session.fork();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    branch.close();
  });

  it('close() shuts the branch session down and leaves the parent open', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const session = sdkSession();
    await session.query('First');
    const branch = await session.fork();
    await branch.query('Second');
    expect(sdkMock.openQueries).toBe(2);

    branch.close();

    // Only the branch's session went down; the parent's is still live.
    expect(sdkMock.openQueries).toBe(1);
  });

  it('close() is a no-op on a Session that does not own its executor', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const session = sdkSession();
    await session.query('First');
    expect(sdkMock.openQueries).toBe(1);

    // `session` was handed its executor, so it must not close it.
    session.close();

    expect(sdkMock.openQueries).toBe(1);
  });
});

describe('Session.fork() outside SDK mode', () => {
  it('keeps sharing the executor it was given', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const executor = createExecutor('forked-1');
    const session = new Session({ cwd: '/repo' }, executor, { resume: 'sess-1' });

    const branch = await session.fork();
    await branch.query('Try the other approach');

    expect(executor.execute).toHaveBeenCalledTimes(1);
    const [args] = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string[]];
    expect(args[args.indexOf('--resume') + 1]).toBe('forked-1');
  });

  it('close() never touches a caller-owned executor', async () => {
    const executor = createExecutor();
    const session = new Session({}, executor, { resume: 'sess-1' });

    expect(() => session.close()).not.toThrow();
  });
});

// ── Result pass-through ───────────────────────────────────────────

describe('Claude.query() carries the whole QueryResult', () => {
  it('returns every field the executor produced, not a projection of it', async () => {
    const rich: QueryResult = {
      text: 'done',
      sessionId: 'sess-9',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadInputTokens: 3,
        cacheCreationInputTokens: 4,
      },
      cost: 0.5,
      durationMs: 120,
      messages: [],
      structured: { ok: true },
      raw: { type: 'result' },
      subtype: 'success',
      isError: false,
      errors: [],
      terminalReason: 'end_turn',
      modelUsage: { sonnet: { inputTokens: 10, outputTokens: 20, costUSD: 0.5 } },
      permissionDenials: [{ toolName: 'Bash', toolUseId: 'tu-1', toolInput: {} }],
      deferredToolUse: null,
      durationApiMs: 90,
      queuedTurnCount: 0,
      ttftMs: 40,
      apiErrorStatus: null,
      fastModeState: 'available',
      origin: 'user',
    };
    const claude = new Claude({}, createExecutor('sess-9', rich));

    const result = await claude.query('hi');

    expect(result).toEqual(rich);
  });
});

// ── setMaxThinkingTokens ──────────────────────────────────────────

describe('Claude.setMaxThinkingTokens', () => {
  it('forwards 0 — the value that disables thinking — untouched', async () => {
    const claude = new Claude({});
    await claude.init();

    await claude.setMaxThinkingTokens(0, 'omitted');

    expect(sdkMock.argsOf('setMaxThinkingTokens')).toEqual([0, 'omitted']);
    claude.close();
  });

  it('forwards null — the value that restores the default budget — untouched', async () => {
    const claude = new Claude({});
    await claude.init();

    await claude.setMaxThinkingTokens(null);

    // The executor normalizes an omitted display to an explicit `null`, which
    // is the SDK's "restore the default" spelling for that parameter too.
    expect(sdkMock.argsOf('setMaxThinkingTokens')).toEqual([null, null]);
    claude.close();
  });
});
