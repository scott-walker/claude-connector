import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Claude } from '../src/client/claude.js';
import { SdkExecutor } from '../src/executor/sdk-executor.js';
import { sdkMock } from './helpers/sdk-mock.js';

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock } = await import('./helpers/sdk-mock.js');
  return createSdkModuleMock();
});

/**
 * The control methods added by the 0.3.x parity work.
 *
 * Two things are checked per method: that it reaches the right `Query` method
 * with the right arguments, and that the response is translated out of the
 * control protocol's `snake_case` into the library's `camelCase`.
 */

/** A warm executor backed by the fake session. */
async function warmExecutor(): Promise<SdkExecutor> {
  const executor = new SdkExecutor({ model: 'sonnet' });
  await executor.init();
  return executor;
}

/** A warm client, for the delegating half of the surface. */
async function warmClient(): Promise<Claude> {
  const claude = new Claude({ model: 'sonnet' });
  await claude.init();
  return claude;
}

beforeEach(() => {
  sdkMock.reset();
});

describe('getContextUsage', () => {
  it('delegates and camelCases the apiUsage token counts', async () => {
    const executor = await warmExecutor();
    const usage = await executor.getContextUsage();
    executor.close();

    expect(sdkMock.callsTo('getContextUsage')).toHaveLength(1);
    expect(usage).toMatchObject({
      model: 'sonnet',
      totalTokens: 42_000,
      rawMaxTokens: 200_000,
      percentage: 21,
      categories: [{ name: 'System prompt', tokens: 1_200, kind: 'system' }],
      apiUsage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadInputTokens: 5,
        cacheCreationInputTokens: 7,
      },
    });
  });

  it('reports a missing apiUsage as null rather than undefined', async () => {
    sdkMock.returns['getContextUsage'] = {
      model: 'sonnet',
      totalTokens: 1,
      rawMaxTokens: 2,
      percentage: 50,
      categories: [],
      mcpTools: [],
      memoryFiles: [],
      agents: [],
    };

    const executor = await warmExecutor();
    const usage = await executor.getContextUsage();
    executor.close();

    expect(usage.apiUsage).toBeNull();
  });

  it('is reachable from the client', async () => {
    const claude = await warmClient();
    await claude.getContextUsage();
    claude.close();

    expect(sdkMock.callsTo('getContextUsage')).toHaveLength(1);
  });
});

describe('readFile', () => {
  it('passes the path and options through and returns the payload', async () => {
    const executor = await warmExecutor();
    const file = await executor.readFile('/repo/a.ts', { maxBytes: 1_024, encoding: 'base64' });
    executor.close();

    expect(sdkMock.argsOf('readFile')).toEqual([
      '/repo/a.ts',
      { maxBytes: 1_024, encoding: 'base64' },
    ]);
    expect(file).toEqual({ content: 'file body', truncated: false, encoding: 'utf-8' });
  });

  it('returns null — never throws — when the session refuses the read', async () => {
    sdkMock.returns['readFile'] = null;

    const executor = await warmExecutor();
    const file = await executor.readFile('/etc/shadow');
    executor.close();

    expect(file).toBeNull();
  });

  it('is reachable from the client', async () => {
    const claude = await warmClient();
    await claude.readFile('/repo/a.ts');
    claude.close();

    expect(sdkMock.argsOf('readFile')).toEqual(['/repo/a.ts', undefined]);
  });
});

describe('reloadPlugins', () => {
  it('camelCases error_count and passes the rest through', async () => {
    const executor = await warmExecutor();
    const result = await executor.reloadPlugins();
    executor.close();

    expect(sdkMock.callsTo('reloadPlugins')).toHaveLength(1);
    expect(result).toEqual({
      commands: [{ name: 'deploy' }],
      agents: [{ agentType: 'Deployer' }],
      plugins: [{ name: 'ops', path: '/plugins/ops' }],
      mcpServers: [{ name: 'github', status: 'connected' }],
      errorCount: 2,
    });
  });
});

describe('reloadSkills', () => {
  it('returns the refreshed skill list', async () => {
    const executor = await warmExecutor();
    const result = await executor.reloadSkills();
    executor.close();

    expect(sdkMock.callsTo('reloadSkills')).toHaveLength(1);
    expect(result).toEqual({ skills: [{ name: 'pdf' }, { name: 'xlsx' }] });
  });
});

describe('initializationResult / reinitialize', () => {
  it('maps the handshake payload to camelCase', async () => {
    const executor = await warmExecutor();
    const result = await executor.initializationResult();
    executor.close();

    expect(result).toEqual({
      commands: [{ name: 'help', description: 'Show help', 'argument-hint': null }],
      agents: [{ agentType: 'Explore', whenToUse: 'fast search', tools: ['Read'], source: 'built-in' }],
      outputStyle: 'concise',
      availableOutputStyles: ['concise', 'verbose'],
      models: [{ value: 'sonnet', displayName: 'Sonnet', description: 'Fast' }],
      account: { email: 'dev@example.com', subscriptionType: 'max' },
      hooksApplied: 3,
      fastModeState: 'available',
      fastModeDisabledReason: undefined,
    });
  });

  it('serves the cached warm-up result instead of hitting the protocol again', async () => {
    const executor = await warmExecutor();
    expect(sdkMock.callsTo('initializationResult')).toHaveLength(1); // from init()

    await executor.initializationResult();
    await executor.initializationResult();
    executor.close();

    expect(sdkMock.callsTo('initializationResult')).toHaveLength(1);
  });

  it('reinitialize() re-requests and refreshes the cache', async () => {
    const executor = await warmExecutor();

    sdkMock.returns['initializationResult'] = {
      commands: [],
      agents: [],
      output_style: 'verbose',
      available_output_styles: ['verbose'],
      models: [],
      account: { email: 'other@example.com' },
      hooks_applied: 0,
    };

    const refreshed = await executor.reinitialize();
    const cached = await executor.initializationResult();
    executor.close();

    expect(sdkMock.callsTo('reinitialize')).toHaveLength(1);
    expect(refreshed.outputStyle).toBe('verbose');
    // The refreshed value replaced the cache — no second round-trip.
    expect(cached).toEqual(refreshed);
    expect(sdkMock.callsTo('initializationResult')).toHaveLength(1);
  });
});

describe('backgroundTasks', () => {
  it('sends the tool-use id when one is given', async () => {
    const executor = await warmExecutor();
    const backgrounded = await executor.backgroundTasks('tu-1');
    executor.close();

    expect(sdkMock.argsOf('backgroundTasks')).toEqual(['tu-1']);
    expect(backgrounded).toBe(true);
  });

  it('omits the id to background the current call', async () => {
    sdkMock.returns['backgroundTasks'] = false;

    const executor = await warmExecutor();
    const backgrounded = await executor.backgroundTasks();
    executor.close();

    expect(sdkMock.argsOf('backgroundTasks')).toEqual([undefined]);
    expect(backgrounded).toBe(false);
  });
});

describe('setMaxThinkingTokens', () => {
  it('normalizes an omitted display to null', async () => {
    const executor = await warmExecutor();
    await executor.setMaxThinkingTokens(10_000);
    executor.close();

    expect(sdkMock.argsOf('setMaxThinkingTokens')).toEqual([10_000, null]);
  });

  it('forwards an explicit display', async () => {
    const executor = await warmExecutor();
    await executor.setMaxThinkingTokens(null, 'omitted');
    executor.close();

    expect(sdkMock.argsOf('setMaxThinkingTokens')).toEqual([null, 'omitted']);
  });

  it('updates the mirrored budget, so an identical per-query override is skipped', async () => {
    const executor = await warmExecutor();
    await executor.setMaxThinkingTokens(10_000, 'summarized');

    await executor.execute([], {
      cwd: '/repo',
      env: {},
      prompt: 'hi',
      thinking: { type: 'enabled', budgetTokens: 10_000, display: 'summarized' },
    });
    executor.close();

    // Only the explicit call — the query needed no override and no restore.
    expect(sdkMock.callsTo('setMaxThinkingTokens')).toHaveLength(1);
  });
});

describe('applyFlagSettings', () => {
  it('forwards the settings patch verbatim, including explicit nulls', async () => {
    const executor = await warmExecutor();
    await executor.applyFlagSettings({ effortLevel: 'high' });
    await executor.applyFlagSettings({ effortLevel: null });
    executor.close();

    expect(sdkMock.callsTo('applyFlagSettings').map((call) => call.args)).toEqual([
      [{ effortLevel: 'high' }],
      [{ effortLevel: null }],
    ]);
  });
});

describe('setMcpPermissionModeOverride', () => {
  it('forwards the server name and mode, and returns the response', async () => {
    const executor = await warmExecutor();
    const result = await executor.setMcpPermissionModeOverride('github', 'auto');
    executor.close();

    expect(sdkMock.argsOf('setMcpPermissionModeOverride')).toEqual(['github', 'auto']);
    expect(result).toEqual({ ok: true });
  });

  it('accepts null to clear the pin', async () => {
    const executor = await warmExecutor();
    await executor.setMcpPermissionModeOverride('github', null);
    executor.close();

    expect(sdkMock.argsOf('setMcpPermissionModeOverride')).toEqual(['github', null]);
  });
});

describe('seedReadState', () => {
  it('forwards the path and mtime', async () => {
    const executor = await warmExecutor();
    await executor.seedReadState('/repo/a.ts', 1_700_000_000_000);
    executor.close();

    expect(sdkMock.argsOf('seedReadState')).toEqual(['/repo/a.ts', 1_700_000_000_000]);
  });
});

describe('usage', () => {
  it('calls the experimental control request and camelCases the whole report', async () => {
    const executor = await warmExecutor();
    const report = await executor.usage();
    executor.close();

    expect(
      sdkMock.callsTo('usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET'),
    ).toHaveLength(1);

    expect(report).toEqual({
      session: {
        totalCostUsd: 1.25,
        totalApiDurationMs: 900,
        totalDurationMs: 1_500,
        totalLinesAdded: 30,
        totalLinesRemoved: 4,
        modelUsage: {
          sonnet: {
            inputTokens: 100,
            outputTokens: 200,
            cacheReadInputTokens: 10,
            cacheCreationInputTokens: 20,
            webSearchRequests: 1,
            costUsd: 0.5,
            contextWindow: 200_000,
            maxOutputTokens: 64_000,
            canonicalModel: 'claude-sonnet',
            provider: 'anthropic',
            costBasis: 'api',
          },
        },
      },
      subscriptionType: 'max',
      rateLimitsAvailable: true,
      rateLimits: {
        fiveHour: { utilization: 12, resetsAt: '2026-08-31T12:00:00Z', displayName: '5h' },
        sevenDay: null,
        sevenDayOauthApps: undefined,
        sevenDayOpus: undefined,
        sevenDaySonnet: undefined,
        modelScoped: [{ utilization: 3, resetsAt: null, displayName: 'opus' }],
        extraUsage: {
          isEnabled: true,
          monthlyLimit: 100,
          usedCredits: 25,
          utilization: 25,
          currency: 'USD',
        },
      },
      behaviors: {
        day: {
          requestCount: 5,
          sessionCount: 2,
          behaviors: ['plan'],
          agents: ['Explore'],
          skills: ['pdf'],
          plugins: ['ops'],
          mcpServers: ['github'],
        },
        week: {
          requestCount: 40,
          sessionCount: 9,
          behaviors: [],
          agents: [],
          skills: [],
          plugins: [],
          mcpServers: [],
        },
      },
    });
  });

  it('reports absent rate limits and behaviors as null', async () => {
    sdkMock.returns['usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET'] = {
      session: {
        total_cost_usd: 0,
        total_api_duration_ms: 0,
        total_duration_ms: 0,
        total_lines_added: 0,
        total_lines_removed: 0,
        model_usage: {},
      },
      subscription_type: 'api',
      rate_limits_available: false,
      rate_limits: null,
      behaviors: null,
    };

    const executor = await warmExecutor();
    const report = await executor.usage();
    executor.close();

    expect(report.rateLimits).toBeNull();
    expect(report.behaviors).toBeNull();
    expect(report.session.modelUsage).toEqual({});
  });
});

describe('streamInput', () => {
  it('hands the extra input stream to the session', async () => {
    const extra = (async function* () { /* nothing to send */ })();

    const executor = await warmExecutor();
    await executor.streamInput(extra);
    executor.close();

    expect(sdkMock.argsOf('streamInput')).toEqual([extra]);
  });

  it('does not consume the session input path used by execute()', async () => {
    const executor = await warmExecutor();
    await executor.streamInput((async function* () { /* nothing */ })());

    const result = await executor.execute([], { cwd: '/repo', env: {}, prompt: 'hi' });
    executor.close();

    expect(result.text).toBe('ok');
  });
});

describe('interrupt', () => {
  it('maps the receipt to an InterruptResult', async () => {
    const executor = await warmExecutor();
    const result = await executor.interrupt();
    executor.close();

    expect(sdkMock.callsTo('interrupt')).toHaveLength(1);
    expect(result).toEqual({ stillQueued: ['queued-1'], cancelled: 2 });
  });

  it('defaults still_queued to an empty list', async () => {
    sdkMock.returns['interrupt'] = { cancelled: 0 };

    const executor = await warmExecutor();
    const result = await executor.interrupt();
    executor.close();

    expect(result).toEqual({ stillQueued: [], cancelled: 0 });
  });

  it('returns undefined on a CLI that predates the interrupt receipt', async () => {
    sdkMock.returns['interrupt'] = undefined;

    const executor = await warmExecutor();
    const result = await executor.interrupt();
    executor.close();

    expect(result).toBeUndefined();
    expect(sdkMock.callsTo('interrupt')).toHaveLength(1);
  });

  it('is reachable from the client', async () => {
    const claude = await warmClient();
    const result = await claude.interrupt();
    claude.close();

    expect(result).toEqual({ stillQueued: ['queued-1'], cancelled: 2 });
  });
});

describe('guards', () => {
  it('throws before init() rather than dereferencing a missing query', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });

    await expect(executor.reloadSkills()).rejects.toThrow('No active SDK query');
    await expect(executor.applyFlagSettings({})).rejects.toThrow('No active SDK query');
    await expect(executor.seedReadState('/a', 1)).rejects.toThrow('No active SDK query');
    await expect(executor.usage()).rejects.toThrow('No active SDK query');
    expect(sdkMock.queries).toHaveLength(0);
  });

  it('throws in CLI mode for every new control method', async () => {
    const claude = new Claude({ useSdk: false });

    const calls: Array<[string, Promise<unknown>]> = [
      ['getContextUsage', claude.getContextUsage()],
      ['readFile', claude.readFile('/a')],
      ['reloadPlugins', claude.reloadPlugins()],
      ['reloadSkills', claude.reloadSkills()],
      ['reinitialize', claude.reinitialize()],
      ['initializationResult', claude.initializationResult()],
      ['backgroundTasks', claude.backgroundTasks()],
      ['setMaxThinkingTokens', claude.setMaxThinkingTokens(1)],
      ['applyFlagSettings', claude.applyFlagSettings({})],
      ['setMcpPermissionModeOverride', claude.setMcpPermissionModeOverride('s', null)],
      ['seedReadState', claude.seedReadState('/a', 1)],
      ['usage', claude.usage()],
      ['streamInput', claude.streamInput((async function* () {})())],
      ['interrupt', claude.interrupt()],
    ];

    for (const [name, call] of calls) {
      await expect(call, name).rejects.toThrow(`${name}() is only available in SDK mode`);
    }
  });
});
