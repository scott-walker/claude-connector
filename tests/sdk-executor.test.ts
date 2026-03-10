import { describe, it, expect, vi } from 'vitest';
import { Claude } from '../src/client/claude.js';
import type { IExecutor, ExecuteOptions } from '../src/executor/interface.js';
import type { QueryResult, StreamEvent } from '../src/types/index.js';

function createMockExecutor(): IExecutor {
  const result: QueryResult = {
    text: 'sdk response',
    sessionId: 'sdk-session-1',
    usage: { inputTokens: 10, outputTokens: 20 },
    cost: null,
    durationMs: 50,
    messages: [],
    structured: null,
    raw: {},
  };

  return {
    execute: vi.fn().mockResolvedValue(result),
    stream: vi.fn().mockImplementation(async function* () {
      yield { type: 'text', text: 'sdk response' } as StreamEvent;
      yield {
        type: 'result',
        text: 'sdk response',
        sessionId: 'sdk-session-1',
        usage: { inputTokens: 10, outputTokens: 20 },
        cost: null,
        durationMs: 50,
      } as StreamEvent;
    }),
    abort: vi.fn(),
  };
}

describe('Claude with useSdk option', () => {
  it('creates client with useSdk flag', () => {
    // When passing a custom executor, useSdk flag is ignored (executor takes priority)
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: true }, executor);

    expect(claude).toBeInstanceOf(Claude);
    expect(claude.getExecutor()).toBe(executor);
  });

  it('ready is true for CLI mode', () => {
    const executor = createMockExecutor();
    const claude = new Claude({}, executor);

    expect(claude.ready).toBe(true);
  });

  it('init() is a no-op for CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({}, executor);

    await claude.init(); // should not throw
    expect(claude.ready).toBe(true);
  });

  it('close() is a no-op for CLI mode', () => {
    const executor = createMockExecutor();
    const claude = new Claude({}, executor);

    claude.close(); // should not throw
  });

  it('on() returns this for chaining (CLI mode)', () => {
    const executor = createMockExecutor();
    const claude = new Claude({}, executor);

    const result = claude.on('init:ready', () => {});
    expect(result).toBe(claude);
  });

  it('queries work normally with custom executor', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: true }, executor);

    const result = await claude.query('Hello');
    expect(result.text).toBe('sdk response');
  });

  it('streaming works with custom executor', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: true }, executor);

    const events: StreamEvent[] = [];
    for await (const event of claude.stream('Hello')) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('text');
    expect(events[1]!.type).toBe('result');
  });
});
