import { getEventListeners } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Claude } from '../src/client/claude.js';
import { SdkExecutor } from '../src/executor/sdk-executor.js';
import type { ExecuteOptions } from '../src/executor/interface.js';
import type { StreamEvent } from '../src/types/index.js';
import { sdkMock } from './helpers/sdk-mock.js';

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock } = await import('./helpers/sdk-mock.js');
  return createSdkModuleMock();
});

/**
 * `QueryOptions.signal` in SDK mode.
 *
 * It used to be a silent no-op there — accepted, threaded through
 * `ExecuteOptions`, and never read by `SdkExecutor`. These tests pin the three
 * halves of the fix: a pre-aborted signal short-circuits, a mid-flight abort
 * interrupts the running turn, and a turn that finishes normally leaves nothing
 * subscribed to the signal.
 */

const BASE: ExecuteOptions = { cwd: '/repo', env: {}, prompt: 'hi' };

async function warmExecutor(): Promise<SdkExecutor> {
  const executor = new SdkExecutor({ model: 'sonnet' });
  await executor.init();
  return executor;
}

/** Let every queued microtask AND the executor's read loop settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  sdkMock.reset();
});

describe('a signal that is already aborted', () => {
  it('makes execute() reject before a message is ever sent', async () => {
    const executor = await warmExecutor();

    await expect(
      executor.execute([], { ...BASE, signal: AbortSignal.abort() }),
    ).rejects.toThrow('Query aborted');

    executor.close();
    expect(sdkMock.called('interrupt')).toBe(false);
  });

  it('makes stream() yield nothing at all', async () => {
    const executor = await warmExecutor();

    const events: StreamEvent[] = [];
    for await (const event of executor.stream([], { ...BASE, signal: AbortSignal.abort() })) {
      events.push(event);
    }

    executor.close();
    expect(events).toEqual([]);
    expect(sdkMock.called('interrupt')).toBe(false);
  });
});

describe('a signal aborted mid-flight', () => {
  it('interrupts the running turn and rejects execute()', async () => {
    sdkMock.holdUntilInterrupt = true;
    const executor = await warmExecutor();
    const controller = new AbortController();

    const pending = executor.execute([], { ...BASE, signal: controller.signal });
    await settle();

    // The turn is in flight: the fake session is holding its response back.
    expect(sdkMock.called('interrupt')).toBe(false);

    controller.abort();
    await expect(pending).rejects.toThrow('Query aborted');

    expect(sdkMock.callsTo('interrupt')).toHaveLength(1);
    executor.close();
  });

  it('drains the turn so the session stays usable for the next one', async () => {
    sdkMock.holdUntilInterrupt = true;
    const executor = await warmExecutor();
    const controller = new AbortController();

    const aborted = executor.execute([], { ...BASE, signal: controller.signal });
    await settle();
    controller.abort();
    await expect(aborted).rejects.toThrow('Query aborted');

    // Same session, no re-init: the generator was left at the next turn.
    const result = await executor.execute([], { ...BASE, prompt: 'again' });

    expect(result.text).toBe('ok');
    expect(sdkMock.queries).toHaveLength(1);
    executor.close();
  });

  it('stops yielding the cancelled turn\'s content but still yields its result', async () => {
    sdkMock.holdUntilInterrupt = true;
    const executor = await warmExecutor();
    const controller = new AbortController();

    const events: StreamEvent[] = [];
    const consume = (async () => {
      for await (const event of executor.stream([], { ...BASE, signal: controller.signal })) {
        events.push(event);
      }
    })();

    await settle();
    controller.abort();
    await consume;

    expect(sdkMock.callsTo('interrupt')).toHaveLength(1);
    // Text produced after the cancel is an answer the caller no longer wants;
    // the result still comes through so the consumer sees the turn close.
    expect(events.map((event) => event.type)).toEqual(['result']);
    executor.close();
  });

  it('interrupts once, not once per remaining message', async () => {
    sdkMock.holdUntilInterrupt = true;
    sdkMock.responses = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'a' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'b' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'c' }] } },
      {
        type: 'result',
        subtype: 'error_during_execution',
        session_id: 'sess-1',
        usage: { input_tokens: 0, output_tokens: 0 },
        duration_ms: 1,
      },
    ];

    const executor = await warmExecutor();
    const controller = new AbortController();

    const pending = executor.execute([], { ...BASE, signal: controller.signal });
    await settle();
    controller.abort();
    await expect(pending).rejects.toThrow('Query aborted');

    expect(sdkMock.callsTo('interrupt')).toHaveLength(1);
    executor.close();
  });
});

describe('a turn that finishes normally', () => {
  it('never interrupts', async () => {
    const executor = await warmExecutor();

    await executor.execute([], { ...BASE, signal: new AbortController().signal });

    expect(sdkMock.called('interrupt')).toBe(false);
    executor.close();
  });

  it('unsubscribes from the signal, so a long-lived controller is not pinned', async () => {
    const executor = await warmExecutor();
    const controller = new AbortController();

    await executor.execute([], { ...BASE, signal: controller.signal });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

    for await (const _event of executor.stream([], { ...BASE, signal: controller.signal })) {
      // drain
    }
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

    executor.close();
  });

  it('unsubscribes even when the consumer stops iterating early', async () => {
    const executor = await warmExecutor();
    const controller = new AbortController();

    for await (const event of executor.stream([], { ...BASE, signal: controller.signal })) {
      if (event.type === 'text') break;
    }

    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    executor.close();
  });

  it('does nothing at all when no signal is given', async () => {
    const executor = await warmExecutor();

    const result = await executor.execute([], BASE);

    expect(result.text).toBe('ok');
    expect(sdkMock.called('interrupt')).toBe(false);
    executor.close();
  });
});

describe('the signal reaches the executor from the public API', () => {
  it('aborts claude.query()', async () => {
    sdkMock.holdUntilInterrupt = true;
    const claude = new Claude({ model: 'sonnet' });
    await claude.init();
    const controller = new AbortController();

    const pending = claude.query('Do the thing', { signal: controller.signal });
    await settle();
    controller.abort();

    await expect(pending).rejects.toThrow('Query aborted');
    expect(sdkMock.callsTo('interrupt')).toHaveLength(1);
    claude.close();
  });

  it('aborts claude.stream() without throwing at the consumer', async () => {
    sdkMock.holdUntilInterrupt = true;
    const claude = new Claude({ model: 'sonnet' });
    await claude.init();
    const controller = new AbortController();

    const seen: string[] = [];
    const handle = claude.stream('Do the thing', { signal: controller.signal });
    const consume = (async () => {
      for await (const event of handle) seen.push(event.type);
    })();

    await settle();
    controller.abort();
    await consume;

    expect(seen).toContain('result');
    expect(sdkMock.callsTo('interrupt')).toHaveLength(1);
    claude.close();
  });

  it('short-circuits claude.query() on an already-aborted signal', async () => {
    const claude = new Claude({ model: 'sonnet' });
    await claude.init();

    await expect(
      claude.query('Do the thing', { signal: AbortSignal.abort() }),
    ).rejects.toThrow('Query aborted');

    claude.close();
  });
});

describe('the session-level abort surface is separate', () => {
  it('abort() closes the query and marks the executor not ready', async () => {
    const executor = await warmExecutor();
    expect(executor.ready).toBe(true);

    executor.abort();

    expect(executor.ready).toBe(false);
    expect(sdkMock.callsTo('close')).toHaveLength(1);
    expect(sdkMock.called('interrupt')).toBe(false);
  });

  it('re-initializes on the next query after abort()', async () => {
    const executor = await warmExecutor();
    executor.abort();

    const result = await executor.execute([], BASE);

    expect(result.text).toBe('ok');
    expect(sdkMock.queries).toHaveLength(2);
    executor.close();
  });
});
