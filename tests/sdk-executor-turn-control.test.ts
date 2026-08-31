import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SdkExecutor, type SdkExecutorOptions } from '../src/executor/sdk-executor.js';
import type { ExecuteOptions } from '../src/executor/interface.js';
import type { StreamEvent } from '../src/types/index.js';
import {
  FLAG_ADD_DIR, FLAG_ALLOWED_TOOLS, FLAG_MODEL, FLAG_OUTPUT_FORMAT,
  FLAG_PRINT, FLAG_WORKTREE, FORMAT_JSON, SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
} from '../src/constants.js';
import { sdkMock, resultMessage } from './helpers/sdk-mock.js';

/**
 * The user messages the executor pushes onto the session's input iterable.
 *
 * Hoisted so the `vi.mock` factory below — which vitest lifts above every
 * import — can close over the same array the assertions read.
 */
const sent = vi.hoisted(() => ({ prompts: [] as string[] }));

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock } = await import('./helpers/sdk-mock.js');
  const module = createSdkModuleMock();
  const query = module['query'] as (params: {
    prompt: unknown;
    options: Record<string, unknown>;
  }) => unknown;

  /** Forward the executor's input iterable, recording each turn's prompt text. */
  const tee = (prompt: unknown): unknown => {
    if (typeof prompt !== 'object' || prompt === null || !(Symbol.asyncIterator in prompt)) {
      return prompt;
    }
    return {
      async *[Symbol.asyncIterator]() {
        for await (const message of prompt as AsyncIterable<{
          message: { content: string };
        }>) {
          sent.prompts.push(message.message.content);
          yield message;
        }
      },
    };
  };

  return {
    ...module,
    query(params: { prompt: unknown; options: Record<string, unknown> }) {
      return query({ ...params, prompt: tee(params.prompt) });
    },
  };
});

/**
 * Follow-up fixes to {@link SdkExecutor}, grouped by the defect each one closes.
 *
 * The theme is that SDK mode used to quietly lose things: plugin entries it
 * could not spell, every fallback model but the first, the difference between
 * "no thinking" and "default thinking", ten of the thirteen per-query
 * overrides, the id that ties a tool result to its invocation, and every
 * informational frame the session sends after the result.
 */

const BASE: ExecuteOptions = { cwd: '/repo', env: {}, prompt: 'hi' };

async function warm(options: SdkExecutorOptions = { model: 'sonnet' }): Promise<SdkExecutor> {
  const executor = new SdkExecutor(options);
  await executor.init();
  return executor;
}

/** Build the session and return the option object handed to the SDK's `query()`. */
async function sdkOptionsFor(options: SdkExecutorOptions): Promise<Record<string, unknown>> {
  const executor = await warm(options);
  executor.close();
  return sdkMock.lastOptions();
}

/** Run one turn and collect every event it yields. */
async function streamOnce(
  executor: SdkExecutor,
  options: Partial<ExecuteOptions> = {},
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of executor.stream([], { ...BASE, ...options })) events.push(event);
  return events;
}

/** Immediates holding the event loop open right now. Unreferenced ones do not count. */
function armedImmediates(): number {
  return process.getActiveResourcesInfo().filter((resource) => resource === 'Immediate').length;
}

beforeEach(() => {
  sdkMock.reset();
  sent.prompts = [];
});

describe('plugins that the SDK cannot spell', () => {
  it('drops the url form instead of letting the SDK throw on it', async () => {
    const options = await sdkOptionsFor({
      plugins: [
        { type: 'local', path: '/plugins/ops' },
        { type: 'url', url: 'https://example.com/p.zip' },
      ],
    });

    expect(options['plugins']).toEqual([{ type: 'local', path: '/plugins/ops' }]);
  });

  it('omits the option entirely when every entry is a url', async () => {
    const options = await sdkOptionsFor({
      plugins: [{ type: 'url', url: 'https://example.com/p.zip' }],
    });

    expect(options).not.toHaveProperty('plugins');
  });

  it('keeps skipMcpDiscovery on the local entries it forwards', async () => {
    const options = await sdkOptionsFor({
      plugins: [{ type: 'local', path: '/plugins/ops', skipMcpDiscovery: true }],
    });

    expect(options['plugins']).toEqual([
      { type: 'local', path: '/plugins/ops', skipMcpDiscovery: true },
    ]);
  });
});

describe('fallbackModel', () => {
  it('sends the whole ordered list, not just its head', async () => {
    const options = await sdkOptionsFor({ fallbackModel: ['opus', 'sonnet', 'haiku'] });

    expect(options['fallbackModel']).toBe('opus,sonnet,haiku');
  });

  it('passes a single model straight through', async () => {
    const options = await sdkOptionsFor({ fallbackModel: 'haiku' });

    expect(options['fallbackModel']).toBe('haiku');
  });

  it('omits the option for an empty list rather than sending an empty string', async () => {
    const options = await sdkOptionsFor({ fallbackModel: [] });

    expect(options).not.toHaveProperty('fallbackModel');
  });
});

describe('per-query thinking', () => {
  it('disables thinking with 0, because null means "use the default budget"', async () => {
    const executor = await warm({ thinking: { type: 'enabled', budgetTokens: 8_000 } });

    await executor.execute([], { ...BASE, thinking: { type: 'disabled' } });

    expect(sdkMock.callsTo('setMaxThinkingTokens').map((call) => call.args)).toEqual([
      [0, null],
      [8_000, null],
    ]);
    executor.close();
  });

  it('restores a disabled client to disabled, not to the default budget', async () => {
    const executor = await warm({ thinking: { type: 'disabled' } });

    await executor.execute([], { ...BASE, thinking: { type: 'enabled', budgetTokens: 4_000 } });

    expect(sdkMock.callsTo('setMaxThinkingTokens').map((call) => call.args)).toEqual([
      [4_000, null],
      [0, null],
    ]);
    executor.close();
  });

  it('tells a budget-less enabled override apart from the disabled session', async () => {
    const executor = await warm({ thinking: { type: 'disabled' } });

    await executor.execute([], { ...BASE, thinking: { type: 'enabled' } });

    // `null` here is "no explicit ceiling", which is exactly what distinguishes
    // it from the seeded `0`; treating both as null skipped the override.
    expect(sdkMock.callsTo('setMaxThinkingTokens').map((call) => call.args)).toEqual([
      [null, null],
      [0, null],
    ]);
    executor.close();
  });

  it('leaves the session alone when the override matches it', async () => {
    const executor = await warm({ thinking: { type: 'disabled' } });

    await executor.execute([], { ...BASE, thinking: { type: 'disabled' } });

    expect(sdkMock.called('setMaxThinkingTokens')).toBe(false);
    executor.close();
  });

  it('skips adaptive, which has no token-budget spelling', async () => {
    const executor = await warm({ thinking: { type: 'enabled', budgetTokens: 8_000 } });

    await executor.execute([], { ...BASE, thinking: { type: 'adaptive' } });

    expect(sdkMock.called('setMaxThinkingTokens')).toBe(false);
    executor.close();
  });
});

describe('per-query overrides carried by the flag settings layer', () => {
  it('routes effortLevel through applyFlagSettings and clears it afterwards', async () => {
    const executor = await warm();

    await executor.execute([], { ...BASE, effortLevel: 'high' });

    expect(sdkMock.callsTo('applyFlagSettings').map((call) => call.args)).toEqual([
      [{ effortLevel: 'high' }],
      [{ effortLevel: null }],
    ]);
    executor.close();
  });

  it('restores effortLevel to the inline settings value instead of clearing it', async () => {
    const executor = await warm({ model: 'sonnet', settings: { effortLevel: 'low' } });

    await executor.execute([], { ...BASE, effortLevel: 'high' });

    expect(sdkMock.callsTo('applyFlagSettings').at(-1)?.args).toEqual([{ effortLevel: 'low' }]);
    executor.close();
  });

  it('maps allowedTools, disallowedTools and additionalDirs onto permissions', async () => {
    const executor = await warm();

    await executor.execute([], {
      ...BASE,
      allowedTools: ['Read'],
      disallowedTools: ['Bash'],
      additionalDirs: ['/extra'],
    });

    expect(sdkMock.callsTo('applyFlagSettings').map((call) => call.args)).toEqual([
      [{ permissions: { allow: ['Read'], deny: ['Bash'], additionalDirectories: ['/extra'] } }],
      [{ permissions: null }],
    ]);
    executor.close();
  });

  it('keeps the permission sub-keys the turn did not override', async () => {
    // The tier shallow-merges top-level keys, so `permissions` is written whole.
    const executor = await warm({ model: 'sonnet', settings: { permissions: { ask: ['Bash'] } } });

    await executor.execute([], { ...BASE, allowedTools: ['Read'] });

    const calls = sdkMock.callsTo('applyFlagSettings').map((call) => call.args);
    expect(calls[0]).toEqual([{ permissions: { ask: ['Bash'], allow: ['Read'] } }]);
    expect(calls[1]).toEqual([{ permissions: { ask: ['Bash'] } }]);
    executor.close();
  });

  it('sends a per-query fallbackModel as the ordered list settings expects', async () => {
    const executor = await warm();

    await executor.execute([], { ...BASE, fallbackModel: ['sonnet', 'haiku'] });

    expect(sdkMock.callsTo('applyFlagSettings')[0]?.args).toEqual([
      { fallbackModel: ['sonnet', 'haiku'] },
    ]);
    executor.close();
  });

  it('restores to whatever applyFlagSettings last put on the layer', async () => {
    const executor = await warm();
    await executor.applyFlagSettings({ effortLevel: 'medium' });
    sdkMock.calls = [];

    await executor.execute([], { ...BASE, effortLevel: 'high' });

    expect(sdkMock.callsTo('applyFlagSettings').at(-1)?.args).toEqual([{ effortLevel: 'medium' }]);
    executor.close();
  });

  it('touches the layer at all only when the turn overrides one of its keys', async () => {
    const executor = await warm();

    await executor.execute([], { ...BASE, model: 'opus' });

    expect(sdkMock.called('applyFlagSettings')).toBe(false);
    executor.close();
  });
});

describe('post-result drain', () => {
  it('delivers the prompt_suggestion the SDK sends after the result', async () => {
    sdkMock.responses = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } },
      resultMessage(),
      { type: 'prompt_suggestion', suggestion: 'Now run the tests' },
    ];
    const executor = await warm();

    const events = await streamOnce(executor);

    expect(events.map((event) => event.type)).toEqual(['text', 'result', 'prompt_suggestion']);
    executor.close();
  });

  it('stops at session_state_changed: idle, the authoritative turn-over signal', async () => {
    sdkMock.responses = [
      resultMessage(),
      { type: 'system', subtype: 'session_state_changed', state: 'idle' },
      { type: 'prompt_suggestion', suggestion: 'never read this turn' },
    ];
    const executor = await warm({ model: 'sonnet', postResultDrainMs: 5_000 });

    const events = await streamOnce(executor);

    // The 5s window is never waited out: idle closes it immediately.
    expect(events.map((event) => event.type)).toEqual(['result', 'session_state_changed']);
    executor.close();
  });

  it('terminates promptly when the result is the last message', async () => {
    sdkMock.responses = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } },
      resultMessage(),
    ];
    const executor = await warm();

    const startedAt = Date.now();
    const events = await streamOnce(executor);

    expect(events.map((event) => event.type)).toEqual(['text', 'result']);
    expect(Date.now() - startedAt).toBeLessThan(200);
    executor.close();
  });

  it('keeps the event loop referenced while its window is open', async () => {
    sdkMock.responses = [resultMessage()];
    const executor = await warm();

    const iterator = executor.stream([], BASE)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({ type: 'result' });

    const baseline = armedImmediates();
    const rest = iterator.next(); // resuming the read loop opens the window

    // Spinning microtasks cannot advance the loop into its check phase, so an
    // open window is still armed when we look. `getActiveResourcesInfo()` lists
    // *referenced* handles only, which is exactly what makes this a regression
    // test: an `unref()`-ed window is invisible here, and invisible to libuv's
    // poll deadline too — it then blocks past the window and stretches a turn
    // out to however long the process stays otherwise idle (seconds, in a test
    // worker that only wakes on its own heartbeat).
    let armed = 0;
    for (let hop = 0; hop < 32 && armed === 0; hop++) {
      await Promise.resolve();
      armed = armedImmediates() - baseline;
    }

    expect(armed).toBeGreaterThan(0);

    await rest;
    executor.close();
  });

  it('ends a widened window too, rather than hanging on a silent session', async () => {
    sdkMock.responses = [resultMessage()];
    const executor = await warm({ model: 'sonnet', postResultDrainMs: 20 });

    const startedAt = Date.now();
    const events = await streamOnce(executor);
    const elapsed = Date.now() - startedAt;

    expect(events.map((event) => event.type)).toEqual(['result']);
    expect(elapsed).toBeGreaterThanOrEqual(15);
    expect(elapsed).toBeLessThan(2_000);
    executor.close();
  });

  it('lets execute() finish when nothing trails the result', async () => {
    const executor = await warm();

    const result = await executor.execute([], BASE);

    expect(result.text).toBe('ok');
    executor.close();
  });

  it('hands a read the window outlived to the next turn instead of dropping it', async () => {
    sdkMock.responses = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'first' }] } },
      resultMessage({ result: 'first' }),
    ];
    const executor = await warm();
    await streamOnce(executor);

    sdkMock.responses = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'second' }] } },
      resultMessage({ result: 'second' }),
    ];
    const events = await streamOnce(executor);

    // The orphaned read from turn one resolves with turn two's first message.
    expect(events.map((event) => event.type)).toEqual(['text', 'result']);
    expect(events[0]).toMatchObject({ type: 'text', text: 'second' });
    executor.close();
  });

  it('still interrupts and drains a turn cancelled mid-flight', async () => {
    sdkMock.holdUntilInterrupt = true;
    sdkMock.responses = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'partial' }] } },
      resultMessage({ subtype: 'error_during_execution' }),
    ];
    const executor = await warm();
    const controller = new AbortController();

    const pending = executor.execute([], { ...BASE, signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();

    await expect(pending).rejects.toThrow('Query aborted');
    expect(sdkMock.callsTo('interrupt')).toHaveLength(1);
    executor.close();
  });
});

describe('tool result correlation', () => {
  it('carries the invocation id on the tool_use event', async () => {
    sdkMock.responses = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'toolu_01', name: 'Read', input: { path: 'a.ts' } }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: 'file body' }],
        },
      },
      resultMessage(),
    ];
    const executor = await warm();

    const events = await streamOnce(executor);
    const use = events.find((event) => event.type === 'tool_use');
    const result = events.find((event) => event.type === 'tool_result');

    expect(use).toMatchObject({ toolName: 'Read', toolUseId: 'toolu_01' });
    expect(result).toMatchObject({ toolUseId: 'toolu_01' });
    expect(use && 'toolUseId' in use ? use.toolUseId : undefined)
      .toBe(result && 'toolUseId' in result ? result.toolUseId : null);
    executor.close();
  });

  it('leaves the id undefined when a replayed block has none', async () => {
    sdkMock.responses = [
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
      },
      resultMessage(),
    ];
    const executor = await warm();

    const events = await streamOnce(executor);

    expect(events.find((event) => event.type === 'tool_use')).toMatchObject({
      toolName: 'Read',
      toolUseId: undefined,
    });
    executor.close();
  });
});

describe('prompt recovery from an argv array', () => {
  /** Run a turn whose prompt can only come from `args`, and return what was sent. */
  async function promptFrom(args: readonly string[]): Promise<string> {
    const executor = await warm();
    await executor.execute(args, { cwd: '/repo', env: {} });
    executor.close();
    return sent.prompts.at(-1) ?? '';
  }

  it('skips every value of a variadic flag, not just the first', async () => {
    const prompt = await promptFrom([
      FLAG_PRINT, FLAG_OUTPUT_FORMAT, FORMAT_JSON,
      FLAG_ALLOWED_TOOLS, 'Bash', 'Edit',
      FLAG_MODEL, 'sonnet',
      'summarize the diff',
    ]);

    expect(prompt).toBe('summarize the diff');
  });

  it('stops a variadic run at the next flag', async () => {
    const prompt = await promptFrom([
      FLAG_ADD_DIR, '/one', '/two', FLAG_MODEL, 'opus', 'the prompt',
    ]);

    expect(prompt).toBe('the prompt');
  });

  it('keeps a bare optional-value flag from eating the prompt', async () => {
    const prompt = await promptFrom([FLAG_WORKTREE, FLAG_MODEL, 'opus', 'the prompt']);

    expect(prompt).toBe('the prompt');
  });

  it('still prefers the verbatim prompt over anything in args', async () => {
    const executor = await warm();
    await executor.execute([FLAG_ALLOWED_TOOLS, 'Bash', 'decoy'], { ...BASE, prompt: 'real' });
    executor.close();

    expect(sent.prompts.at(-1)).toBe('real');
  });
});

describe('per-query system prompt', () => {
  it('prepends a genuine per-query instruction', async () => {
    const executor = await warm();

    await executor.execute([], { ...BASE, systemPrompt: 'Answer in French' });
    executor.close();

    expect(sent.prompts.at(-1)).toBe('[System instruction: Answer in French]\n\nhi');
  });

  it('does not repeat the session system prompt in front of every turn', async () => {
    const executor = await warm({ model: 'sonnet', systemPrompt: 'You are terse' });

    await executor.execute([], { ...BASE, systemPrompt: 'You are terse' });
    executor.close();

    expect(sent.prompts.at(-1)).toBe('hi');
  });

  it('recognises the joined spelling of a session prompt configured as an array', async () => {
    const executor = await warm({
      model: 'sonnet',
      systemPrompt: ['You are terse', SYSTEM_PROMPT_DYNAMIC_BOUNDARY, 'Repo: acme'],
    });

    // What a caller that merged client and query options hands over: the array
    // folded down the way `--system-prompt` spells it.
    await executor.execute([], { ...BASE, systemPrompt: 'You are terse\n\nRepo: acme' });
    executor.close();

    expect(sent.prompts.at(-1)).toBe('hi');
  });

  it('still prepends an override that only overlaps the session prompt', async () => {
    const executor = await warm({
      model: 'sonnet',
      systemPrompt: ['You are terse', SYSTEM_PROMPT_DYNAMIC_BOUNDARY, 'Repo: acme'],
    });

    await executor.execute([], { ...BASE, systemPrompt: 'You are terse' });
    executor.close();

    expect(sent.prompts.at(-1)).toBe('[System instruction: You are terse]\n\nhi');
  });
});
