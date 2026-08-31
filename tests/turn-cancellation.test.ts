import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Claude } from '../src/client/claude.js';
import { SdkExecutor } from '../src/executor/sdk-executor.js';
import type { ExecuteOptions } from '../src/executor/interface.js';
import { CANCEL_RETRY_INTERVAL_MS } from '../src/constants.js';
import { sdkMock } from './helpers/sdk-mock.js';

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock } = await import('./helpers/sdk-mock.js');
  return createSdkModuleMock();
});

/**
 * The three defects the final verification pass found, after the parity work
 * was otherwise complete. Each one was live-reproducible against the real CLI.
 */

const BASE: ExecuteOptions = { cwd: '/repo', env: {}, prompt: 'hi' };

/** Let every queued microtask AND the executor's read loop settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  sdkMock.reset();
});

// ── 1. the flag-settings mirror is seeded through the facade ──────

describe('the flag-settings mirror', () => {
  /**
   * The facade hands the SDK a pre-serialized JSON string, because that is the
   * only form the SDK's arg builder passes through intact. The mirror used to
   * accept objects only, so through `new Claude(...)` it was always empty — and
   * restoring a per-query permissions override then cleared the client's own
   * settings for the rest of the session.
   */
  it('is seeded from the serialized settings the facade forwards', async () => {
    const claude = new Claude({
      model: 'sonnet',
      settings: { permissions: { allow: ['Bash(npm test)'] } },
    });
    await claude.init();

    const settings = sdkMock.queries[0]?.options['settings'];
    expect(typeof settings).toBe('string');

    await claude.query('hi', { allowedTools: ['Read'] });

    const applied = sdkMock.callsTo('applyFlagSettings');
    expect(applied.length).toBeGreaterThanOrEqual(2);

    // The restore hands back the client's own permissions rather than `null`,
    // which is what used to wipe the flag-settings tier.
    const restore = applied.at(-1)?.args[0] as Record<string, unknown>;
    expect(restore['permissions']).toEqual({ allow: ['Bash(npm test)'] });

    claude.close();
  });

  it('stays empty for a settings path, which cannot be read from here', async () => {
    const claude = new Claude({ model: 'sonnet', settings: '/etc/claude/settings.json' });
    await claude.init();

    await claude.query('hi', { allowedTools: ['Read'] });

    const restore = sdkMock.callsTo('applyFlagSettings').at(-1)?.args[0] as Record<string, unknown>;
    expect(restore['permissions']).toBeNull();

    claude.close();
  });
});

// ── 2. an aborted turn is interrupted until it actually stops ─────

describe('cancelling a turn', () => {
  /**
   * `interrupt()` only cancels work the worker has already started, so a cancel
   * landing between `ensureReady()` and the CLI picking up the turn used to be
   * a no-op — the turn then ran to completion, billed and discarded.
   */
  it('keeps interrupting while the turn is still running', async () => {
    vi.useFakeTimers();
    try {
      sdkMock.holdUntilInterrupt = true;
      const executor = new SdkExecutor({ model: 'sonnet' });
      await executor.init();

      const controller = new AbortController();
      const pending = executor.execute([], { ...BASE, signal: controller.signal });
      // Attach the rejection handler before advancing time, so the rejection is
      // never momentarily unhandled.
      const settled = expect(pending).rejects.toThrow('Query aborted');

      await vi.advanceTimersByTimeAsync(0);
      // The mock ignores the first interrupt, standing in for a worker that has
      // not started the turn yet.
      sdkMock.ignoreInterrupts = 1;
      controller.abort();
      await vi.advanceTimersByTimeAsync(CANCEL_RETRY_INTERVAL_MS * 3);

      await settled;
      expect(sdkMock.callsTo('interrupt').length).toBeGreaterThan(1);
      executor.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not interrupt a turn that was never cancelled', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    await executor.execute([], BASE);
    await settle();

    expect(sdkMock.called('interrupt')).toBe(false);
    executor.close();
  });
});

// ── 3. a truncating resume is a first-turn-only operation ─────────

describe('Session identity flags', () => {
  it('does not repeat the truncating resume on later turns', async () => {
    const claude = new Claude({ model: 'sonnet' });
    await claude.init();

    const session = claude.session({
      resume: 'sess-old',
      resumeSessionAt: 'chain-uuid',
      resumeDropsTurn: 'msg-42',
    });

    await session.query('pick up where we stopped');
    await session.query('and now finish it');

    // SDK mode fixes session identity at construction, so the flags never reach
    // argv there; what matters is that the second turn adds nothing new.
    expect(sdkMock.queries).toHaveLength(1);

    claude.close();
  });
});
