import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CliExecutor } from '../src/executor/cli-executor.js';
import { SdkExecutor } from '../src/executor/sdk-executor.js';
import type { ExecuteOptions } from '../src/executor/interface.js';
import { parseStreamEvents, parseStreamLine } from '../src/parser/stream-parser.js';
import type { StreamEvent } from '../src/types/index.js';
import { sdkMock, resultMessage } from './helpers/sdk-mock.js';

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock } = await import('./helpers/sdk-mock.js');
  return createSdkModuleMock();
});

/** Fake child process for {@link CliExecutor}, so no `claude` binary is spawned. */
class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  killed = false;
  kill(): boolean { this.killed = true; return true; }
}

const spawned: FakeChild[] = [];

vi.mock('node:child_process', () => ({
  spawn: () => {
    const child = new FakeChild();
    spawned.push(child);
    return child;
  },
}));

/**
 * CLI-mode stream parsing, held against its SDK-mode twin.
 *
 * The library promises the two execution modes are interchangeable: the same
 * turn must reach the consumer as the same {@link StreamEvent} sequence whether
 * it arrived as an SDK message or as a line of `--output-format stream-json`.
 * The parser used to break that promise in four places — it kept only the last
 * content block of an assistant message and only the first `tool_result` of a
 * user message, returned early on `context_usage` (swallowing the message body),
 * and never read the wrapper-level `error` that a failed turn carries.
 *
 * Rather than restate the SDK executor's field mapping here, most cases feed one
 * payload to *both* producers and assert deep equality, so the two can only
 * drift together. Where a value is asserted literally as well, it is because the
 * defaulting itself is the thing under test.
 */

const EXEC_OPTIONS: ExecuteOptions = { cwd: '/repo', env: {}, prompt: 'hi' };

/** Every event the SDK executor produces for a scripted turn. */
async function sdkTurn(...messages: readonly unknown[]): Promise<readonly StreamEvent[]> {
  sdkMock.responses = [...messages];

  const executor = new SdkExecutor({ model: 'sonnet' });
  await executor.init();

  const events: StreamEvent[] = [];
  try {
    for await (const event of executor.stream([], EXEC_OPTIONS)) events.push(event);
  } finally {
    executor.close();
  }
  return events;
}

/** Events the SDK executor produces for one message, minus the closing result. */
async function sdkEvents(message: Record<string, unknown>): Promise<readonly StreamEvent[]> {
  const events = await sdkTurn(message, resultMessage());

  expect(events.at(-1)?.type).toBe('result');
  return events.slice(0, -1);
}

/** Events the CLI parser produces for the same payload on the wire. */
function cliEvents(message: Record<string, unknown>): readonly StreamEvent[] {
  return parseStreamEvents(JSON.stringify(message));
}

/** Assert both producers agree on a payload, and hand back what they produced. */
async function expectParity(message: Record<string, unknown>): Promise<readonly StreamEvent[]> {
  const cli = cliEvents(message);
  expect(cli).toEqual(await sdkEvents(message));
  return cli;
}

/** A `type: 'system'` frame with the given subtype. */
function system(subtype: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'system', subtype, ...fields };
}

/** Let queued microtasks and stream `data` events settle. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  sdkMock.reset();
  spawned.length = 0;
});

describe('an assistant turn yields every content block', () => {
  it('maps all blocks in wire order, not just the last one', async () => {
    const events = await expectParity({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'weighing options', signature: 'sig-1' },
          { type: 'text', text: 'Reading the file.' },
          { type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } },
        ],
      },
    });

    expect(events).toEqual([
      { type: 'thinking', thinking: 'weighing options', signature: 'sig-1' },
      { type: 'text', text: 'Reading the file.' },
      { type: 'tool_use', toolName: 'Read', toolInput: { file_path: '/a.ts' } },
    ]);
  });

  it('maps a redacted thinking block onto the same event as a plain one', async () => {
    const events = await expectParity({
      type: 'assistant',
      message: { content: [{ type: 'redacted_thinking', data: 'ENCRYPTED' }] },
    });

    expect(events).toEqual([{ type: 'thinking', thinking: 'ENCRYPTED', redacted: true }]);
  });

  it('ignores block types the library does not model', async () => {
    const events = await expectParity({
      type: 'assistant',
      message: {
        content: [
          { type: 'image', source: { type: 'base64', data: 'AAAA' } },
          { type: 'text', text: 'described above' },
        ],
      },
    });

    expect(events).toEqual([{ type: 'text', text: 'described above' }]);
  });
});

describe('a failed assistant turn reaches the consumer', () => {
  it('surfaces the wrapper error that carries no content at all', async () => {
    const events = await expectParity({
      type: 'assistant',
      error: 'overloaded',
      message: { content: [] },
    });

    expect(events).toEqual([
      { type: 'error', message: 'overloaded', code: 'overloaded', aborted: undefined, requestId: undefined },
    ]);
  });

  it('reports the assistant text as the message when the turn produced some', async () => {
    const events = await expectParity({
      type: 'assistant',
      error: 'refusal',
      request_id: 'req-9',
      message: { content: [{ type: 'text', text: 'I cannot ' }, { type: 'text', text: 'help with that.' }] },
    });

    expect(events[0]).toEqual({
      type: 'error',
      message: 'I cannot help with that.',
      code: 'refusal',
      aborted: undefined,
      requestId: 'req-9',
    });
    // The text blocks are still delivered on their own after the error.
    expect(events.slice(1)).toEqual([
      { type: 'text', text: 'I cannot ' },
      { type: 'text', text: 'help with that.' },
    ]);
  });

  it('flags a turn the CLI cancelled mid-flight', async () => {
    const events = await expectParity({
      type: 'assistant',
      error: 'aborted',
      aborted: true,
      message: { content: [] },
    });

    expect(events).toEqual([
      { type: 'error', message: 'aborted', code: 'aborted', aborted: true, requestId: undefined },
    ]);
  });

  it('leaves a healthy turn with no error event', async () => {
    const events = await expectParity({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'fine' }] },
    });

    expect(events.some((event) => event.type === 'error')).toBe(false);
  });
});

describe('a /context turn keeps both halves', () => {
  it('delivers the rendered table and the structured report', async () => {
    const events = await expectParity({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '| Category | Tokens |' }] },
      context_usage: {
        model: 'sonnet',
        total_tokens: 42_000,
        raw_max_tokens: 200_000,
        percentage: 21,
        categories: [{ name: 'System prompt', tokens: 1_200, kind: 'system' }],
      },
    });

    expect(events.map((event) => event.type)).toEqual(['text', 'context_usage']);
    expect(events[1]).toMatchObject({
      type: 'context_usage',
      contextUsage: { model: 'sonnet', totalTokens: 42_000, percentage: 21 },
    });
  });

  it('reports the required wire lists as arrays and omits skills when absent', async () => {
    const events = await expectParity({
      type: 'assistant',
      context_usage: {
        model: 'sonnet',
        total_tokens: 10,
        raw_max_tokens: 100,
        percentage: 10,
        categories: [],
        mcp_tools: [],
        memory_files: [{ path: '/CLAUDE.md', type: 'Project', tokens: 300 }],
        agents: [],
      },
    });

    // `mcp_tools`, `memory_files` and `agents` are required on the wire, so an
    // empty one means "nothing contributed"; only `skills` may be omitted.
    expect(events[0]).toMatchObject({
      contextUsage: {
        mcpTools: [],
        agents: [],
        memoryFiles: [{ path: '/CLAUDE.md', type: 'Project', tokens: 300 }],
        skills: undefined,
      },
    });
  });

  it('defaults the over-limit kind the SDK executor defaults', async () => {
    const events = await expectParity({
      type: 'assistant',
      context_usage: {
        model: 'sonnet',
        total_tokens: 210_000,
        raw_max_tokens: 200_000,
        percentage: 105,
        categories: [],
        mcp_tools: [],
        memory_files: [],
        agents: [],
        over_limit: { tokens_over: 10_000 },
      },
    });

    expect(events[0]).toMatchObject({
      contextUsage: { overLimit: { tokensOver: 10_000, kind: 'hard_limit' } },
    });
  });

  it('still reports context usage on its own when the turn carried no content', async () => {
    const events = await expectParity({
      type: 'assistant',
      context_usage: { model: 'sonnet', total_tokens: 1, raw_max_tokens: 2, percentage: 50 },
    });

    expect(events.map((event) => event.type)).toEqual(['context_usage']);
  });
});

describe('a user turn yields one event per tool_result', () => {
  it('maps every block of a parallel batch, not just the first', async () => {
    const events = await expectParity({
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu-1', content: 'first' },
          { type: 'tool_result', tool_use_id: 'tu-2', content: 'second', is_error: true },
          { type: 'tool_result', tool_use_id: 'tu-3', content: 'third' },
        ],
      },
    });

    expect(events).toHaveLength(3);
    expect(events.map((event) => (event as { toolUseId: string }).toolUseId))
      .toEqual(['tu-1', 'tu-2', 'tu-3']);
    expect(events[1]).toMatchObject({ type: 'tool_result', content: 'second', isError: true });
  });

  it('forwards a message with no tool_result as an untyped system event', async () => {
    const events = await expectParity({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'replayed prompt' }] },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'system', subtype: 'user' });
  });
});

describe('tool_result content is normalised, not cast', () => {
  it('drops blocks ContentBlock does not model and keeps the ones it does', async () => {
    const events = await expectParity({
      type: 'user',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'tu-1',
          content: [
            { type: 'text', text: 'screenshot of the page' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          ],
        }],
      },
    });

    expect(events[0]).toMatchObject({
      type: 'tool_result',
      content: [{ type: 'text', text: 'screenshot of the page' }],
    });
  });

  it('normalises a nested tool_use block onto its declared shape', async () => {
    const events = await expectParity({
      type: 'user',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: 'tu-1',
          content: [{ type: 'tool_use', id: 'nested-1', name: 'Grep' }],
        }],
      },
    });

    expect(events[0]).toMatchObject({
      content: [{ type: 'tool_use', id: 'nested-1', name: 'Grep', input: {} }],
    });
  });

  it('keeps a plain string payload verbatim and falls back to empty otherwise', () => {
    const [text] = cliEvents({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' }] },
    });
    const [missing] = cliEvents({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu-2' }] },
    });

    expect(text).toMatchObject({ content: 'ok' });
    expect(missing).toMatchObject({ content: '' });
  });
});

describe('required union fields default the way the SDK executor defaults them', () => {
  /** Each row: the frame with its required field omitted, and what must fill it. */
  const CASES: ReadonlyArray<readonly [string, Record<string, unknown>, string, unknown]> = [
    ['task_notification.status', system('task_notification', { task_id: 't-1' }), 'status', 'completed'],
    ['model_refusal_fallback.direction', system('model_refusal_fallback', { content: '' }), 'direction', 'retry'],
    ['notification.priority', system('notification', { key: 'idle', text: 'waiting' }), 'priority', 'low'],
    ['informational.level', system('informational', { content: 'fyi' }), 'level', 'info'],
    ['session_state_changed.state', system('session_state_changed'), 'state', 'idle'],
    ['memory_recall.mode', system('memory_recall', { memories: [] }), 'mode', 'select'],
    ['plugin_install.status', system('plugin_install', { name: 'ops' }), 'status', 'started'],
    ['control_request_progress.status', system('control_request_progress', { request_id: 'r-1' }), 'status', 'started'],
    ['init.permissionMode', system('init', { model: 'sonnet', cwd: '/repo' }), 'permissionMode', 'default'],
  ];

  for (const [label, frame, field, expected] of CASES) {
    it(`fills ${label} with ${JSON.stringify(expected)}`, async () => {
      const events = await expectParity(frame);

      expect(events).toHaveLength(1);
      expect((events[0] as unknown as Record<string, unknown>)[field]).toBe(expected);
    });
  }

  it('fills the scope of every recalled memory', async () => {
    const events = await expectParity(system('memory_recall', {
      memories: [{ path: '/CLAUDE.md' }, { path: '/team.md', scope: 'team' }],
    }));

    expect(events[0]).toMatchObject({
      type: 'memory_recall',
      mode: 'select',
      memories: [
        { path: '/CLAUDE.md', scope: 'personal' },
        { path: '/team.md', scope: 'team' },
      ],
    });
  });

  it('reports a missing effort level as null rather than absent', async () => {
    const events = await expectParity(system('init', { model: 'sonnet', cwd: '/repo' }));

    expect(events[0]).toHaveProperty('effort', null);
  });

  it('ignores a non-string value where a literal union is declared', () => {
    const [event] = cliEvents(system('plugin_install', { name: 'ops', status: 7 }));

    expect(event).toMatchObject({ type: 'plugin_install', status: 'started' });
  });
});

describe('parseStreamLine keeps its single-event contract', () => {
  it('yields the primary event of a multi-event line', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'done' }] },
    });

    expect(parseStreamLine(line)).toEqual({ type: 'text', text: 'done' });
    expect(parseStreamEvents(line)).toHaveLength(2);
  });

  it('prefers the structured report over the rendered table on a /context turn', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '| Category |' }] },
      context_usage: { model: 'sonnet', total_tokens: 1, raw_max_tokens: 2, percentage: 50 },
    });

    expect(parseStreamLine(line)).toMatchObject({ type: 'context_usage' });
  });

  it('returns null where the plural entry point returns nothing', () => {
    expect(parseStreamLine('not json')).toBeNull();
    expect(parseStreamEvents('not json')).toEqual([]);

    const empty = JSON.stringify({ type: 'assistant', message: { content: [] } });
    expect(parseStreamLine(empty)).toBeNull();
    expect(parseStreamEvents(empty)).toEqual([]);
  });
});

/**
 * Field-by-field parity sweep over every message family the two executors share:
 * assistant, user, result (above), system with all of its subtypes, and the
 * top-level frames. Each fixture is populated to the edges of its shape, so a
 * divergence in any single field — a default, a spelling, an optional list —
 * fails here rather than reaching a consumer who switched modes.
 *
 * The one family with no twin is a top-level `type: 'error'` line: the CLI emits
 * it, the SDK has no equivalent message, so there is nothing to compare it to.
 */
describe('every message the SDK executor maps has an identical CLI twin', () => {
  const FIXTURES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['init', system('init', {
      model: 'sonnet', cwd: '/repo', tools: ['Read'], skills: ['pdf'], slash_commands: ['help'],
      terminal_slash_commands: ['clear'], mcp_servers: [{ name: 'gh', status: 'connected' }],
      plugins: [{ name: 'ops', path: '/p', version: '1.0' }], agents: ['Explore'],
      permission_mode: 'plan', apiKeySource: 'env', claudeCodeVersion: '2.0', output_style: 'concise',
      betas: ['b'], effort: 'high', capabilities: ['c'], fast_mode_state: 'available',
      fast_mode_disabled_reason: 'free',
    })],
    ['task_started', system('task_started', {
      task_id: 't1', tool_use_id: 'tu1', description: 'go', task_type: 'search', prompt: 'p',
      subagent_type: 'Explore', is_backgrounded: true, spawn_depth: 1, workflow_name: 'w',
      skip_transcript: false, ambient: true,
    })],
    ['task_progress', system('task_progress', {
      task_id: 't1', tool_use_id: 'tu1', description: 'go',
      usage: { total_tokens: 10, tool_uses: 2, duration_ms: 5 },
      last_tool_name: 'Read', summary: 's', subagent_type: 'Explore',
    })],
    ['task_notification', system('task_notification', {
      task_id: 't1', tool_use_id: 'tu1', status: 'failed', output_file: '/o.md', summary: 's',
      usage: { total_tokens: 1, tool_uses: 1, duration_ms: 1 }, skip_transcript: true, ambient: false,
    })],
    ['task_updated', system('task_updated', {
      task_id: 't1',
      patch: { status: 'paused', description: 'd', end_time: 5, total_paused_ms: 2, error: 'e', is_backgrounded: true },
    })],
    ['background_tasks_changed', system('background_tasks_changed', {
      tasks: [{ task_id: 't1', task_type: 'x', description: 'd', ambient: true }],
    })],
    ['hook_started', system('hook_started', { hook_id: 'h', hook_name: 'n', hook_event: 'PreToolUse' })],
    ['hook_progress', system('hook_progress', {
      hook_id: 'h', hook_name: 'n', hook_event: 'PreToolUse', stdout: 'o', stderr: 'e', output: 'x',
    })],
    ['hook_response', system('hook_response', {
      hook_id: 'h', hook_name: 'n', hook_event: 'PreToolUse', output: 'x', stdout: 'o', stderr: 'e',
      exit_code: 0, outcome: 'error',
    })],
    ['files_persisted', system('files_persisted', {
      files: [{ filename: 'a', file_id: 'f' }], failed: [{ filename: 'b', error: 'e' }], processed_at: 'now',
    })],
    ['compact_boundary', system('compact_boundary', {
      compact_metadata: {
        trigger: 'manual', pre_tokens: 100, post_tokens: 10, duration_ms: 3,
        preserved_messages: { anchor_uuid: 'a', uuids: ['u'] },
        preserved_segment: { head_uuid: 'h', anchor_uuid: 'a', tail_uuid: 't' },
      },
    })],
    ['local_command_output', system('local_command_output', { content: 'out' })],
    ['status', system('status', {
      status: 'compacting', permission_mode: 'plan', compact_result: 'success', compact_error: 'e',
    })],
    ['thinking_tokens', system('thinking_tokens', { estimated_tokens: 10, estimated_tokens_delta: 2 })],
    ['api_retry', system('api_retry', {
      attempt: 1, max_retries: 3, retry_delay_ms: 10, error_status: 529, error: 'overloaded',
    })],
    ['model_refusal_fallback', system('model_refusal_fallback', {
      direction: 'revert', scope: 'session', original_model: 'opus', fallback_model: 'sonnet',
      request_id: 'r', api_refusal_category: 'c', api_refusal_explanation: 'x',
      retracted_message_uuids: ['u'], refused_user_message_uuid: 'u2', content: 'c',
    })],
    ['model_refusal_no_fallback', system('model_refusal_no_fallback', {
      original_model: 'opus', request_id: 'r', api_refusal_category: 'c',
      api_refusal_explanation: 'x', refused_user_message_uuid: 'u2', content: 'c',
    })],
    ['permission_denied', system('permission_denied', {
      tool_name: 'Bash', tool_use_id: 'tu', agent_id: 'a', decision_reason_type: 'rule',
      decision_reason: 'no', message: 'm',
    })],
    ['notification', system('notification', {
      key: 'k', text: 't', priority: 'high', color: 'red', timeout_ms: 100,
    })],
    ['informational', system('informational', {
      content: 'c', level: 'warning', tool_use_id: 'tu', prevent_continuation: true,
    })],
    ['session_state_changed', system('session_state_changed', { state: 'running' })],
    ['worker_shutting_down', system('worker_shutting_down', { reason: 'r' })],
    ['mirror_error', system('mirror_error', { error: 'e', key: { projectKey: 'p', sessionId: 's', subpath: 'x' } })],
    ['memory_recall', system('memory_recall', {
      mode: 'synthesize', memories: [{ path: '/a', scope: 'team', content: 'c' }],
    })],
    ['commands_changed', system('commands_changed', {
      commands: [{ name: 'help', description: 'd', argumentHint: 'h', aliases: ['h'] }],
    })],
    ['plugin_install', system('plugin_install', { status: 'installed', name: 'ops', error: 'e' })],
    ['elicitation_complete', system('elicitation_complete', { mcp_server_name: 'm', elicitation_id: 'e' })],
    ['control_request_progress', system('control_request_progress', {
      request_id: 'r', status: 'api_retry', attempt: 1, max_retries: 2, retry_delay_ms: 3, error_status: 500,
    })],
    ['a subtype neither producer models', system('a_future_subtype', { payload: 1 })],
    ['rate_limit_event', {
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed_warning', resets_at: 1, rate_limit_type: 'five_hour', utilization: 50,
        overage_status: 'allowed', overage_resets_at: 2, overage_disabled_reason: 'x',
        is_using_overage: true, overage_in_use: false,
      },
    }],
    ['a user turn with every wrapper field', {
      type: 'user', parent_tool_use_id: null, tool_use_result: { ok: 1 }, is_replay: false,
      is_synthetic: true, subagent_type: 'Explore', task_description: 'td', timestamp: 'ts',
      origin: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tu', content: [{ type: 'text', text: 't' }], is_error: false }],
      },
    }],
    ['tool_progress', {
      type: 'tool_progress', tool_use_id: 'tu', tool_name: 'Bash', parent_tool_use_id: 'p',
      elapsed_time_seconds: 3, task_id: 't', heartbeat: true, subagent_type: 'Explore',
      subagent_retry: { agent_id: 'a', attempt: 1, max_retries: 2, retry_delay_ms: 3, error_status: 500, error_category: 'c' },
    }],
    ['tool_use_summary', { type: 'tool_use_summary', summary: 's', preceding_tool_use_ids: ['tu'] }],
    ['auth_status', { type: 'auth_status', isAuthenticating: true, output: ['url'], error: 'e' }],
    ['stream_event', {
      type: 'stream_event', event: { type: 'ping' }, parent_tool_use_id: null, ttft_ms: 5,
      user_message_uuid: 'u',
    }],
    ['conversation_reset', { type: 'conversation_reset', new_conversation_id: 'c2' }],
    ['prompt_suggestion', { type: 'prompt_suggestion', suggestion: 'run the tests' }],
    ['an assistant turn with every block type', {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'a' },
          { type: 'tool_use', name: 'R', input: { x: 1 } },
          { type: 'thinking', thinking: 'th', signature: 'sg' },
          { type: 'redacted_thinking', data: 'd' },
        ],
      },
    }],
  ];

  for (const [label, wire] of FIXTURES) {
    it(label, async () => {
      expect(cliEvents(wire)).toEqual(await sdkEvents(wire));
    });
  }
});

describe('a refused turn is reported before its result', () => {
  const REFUSED: Record<string, unknown> = {
    type: 'result',
    subtype: 'error_during_execution',
    result: '',
    session_id: 's-1',
    duration_ms: 1,
    errors: ['Resume rejected by --resume-drops-turn: the transcript moved on'],
  };

  it('prepends the error event that routes the caller to a rewind', async () => {
    const cli = cliEvents(REFUSED);

    expect(cli).toEqual(await sdkTurn(REFUSED));
    expect(cli.map((event) => event.type)).toEqual(['error', 'result']);
    expect(cli[0]).toMatchObject({
      code: 'error_during_execution',
      message: 'Resume rejected by --resume-drops-turn: the transcript moved on',
    });
  });

  it('leaves a result whose errors are ordinary warnings alone', async () => {
    const warned: Record<string, unknown> = {
      type: 'result',
      subtype: 'success',
      result: 'done',
      session_id: 's-1',
      duration_ms: 1,
      errors: ['an MCP server failed to start'],
    };

    const cli = cliEvents(warned);

    expect(cli).toEqual(await sdkTurn(warned));
    expect(cli.map((event) => event.type)).toEqual(['result']);
  });
});

describe('CliExecutor delivers every event a line carries', () => {
  /** Stream `lines` through a fake child and collect what the executor yields. */
  async function streamLines(lines: readonly string[], trailingNewline = true): Promise<StreamEvent[]> {
    const executor = new CliExecutor('claude');
    const iterable = executor.stream(['--print'], EXEC_OPTIONS);

    const collected = (async () => {
      const events: StreamEvent[] = [];
      for await (const event of iterable) events.push(event);
      return events;
    })();

    await tick();
    const child = spawned.at(-1)!;
    child.stdout.write(lines.join('\n') + (trailingNewline ? '\n' : ''));
    await tick();
    child.emit('close', 0);

    return collected;
  }

  it('yields all four events of a three-block assistant line plus its result', async () => {
    const events = await streamLines([
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'planning' },
            { type: 'text', text: 'Running it.' },
            { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
          ],
        },
      }),
      JSON.stringify({ type: 'result', subtype: 'success', result: 'ok', session_id: 's-1', duration_ms: 1 }),
    ]);

    expect(events.map((event) => event.type)).toEqual(['thinking', 'text', 'tool_use', 'result']);
  });

  it('yields one tool_result per block of a parallel batch', async () => {
    const events = await streamLines([
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', content: 'a' },
            { type: 'tool_result', tool_use_id: 'tu-2', content: 'b' },
          ],
        },
      }),
    ]);

    expect(events.map((event) => event.type)).toEqual(['tool_result', 'tool_result']);
  });

  it('drains a trailing line that never got its newline', async () => {
    const events = await streamLines(
      [JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }] },
      })],
      false,
    );

    expect(events).toEqual([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ]);
  });

  it('surfaces a failed turn that carries no content', async () => {
    const events = await streamLines([
      JSON.stringify({ type: 'assistant', error: 'overloaded', message: { content: [] } }),
    ]);

    expect(events).toEqual([
      { type: 'error', message: 'overloaded', code: 'overloaded', aborted: undefined, requestId: undefined },
    ]);
  });
});
