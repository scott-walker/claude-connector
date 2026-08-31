import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamHandle } from '../src/client/stream-handle.js';
import { ChatHandle } from '../src/client/chat-handle.js';
import { parseStreamLine } from '../src/parser/stream-parser.js';
import type { StreamEvent } from '../src/types/index.js';

/** Fake child process for {@link ChatHandle}, so no `claude` binary is spawned. */
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
 * Callback routing for the full `StreamEvent` union.
 *
 * `StreamHandle.on()` and `ChatHandle.on()` each carry ~43 typed overloads over
 * one untyped bucket map. The overloads are compile-time only, so the thing that
 * can silently rot is the runtime dispatch: a bucket keyed on a name no event
 * ever carries never fires. Every variant is therefore driven end to end.
 *
 * The wire lines double as fixtures for `parseStreamLine`, since CLI mode routes
 * through it before dispatch.
 */

/** One NDJSON line per `StreamEvent` variant, keyed by the event type it yields. */
const WIRE_LINES: ReadonlyArray<readonly [StreamEvent['type'], Record<string, unknown>]> = [
  // ── Core conversation ─────────────────────────────────────────
  ['text', { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }],
  ['tool_use', {
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } }] },
  }],
  ['tool_result', {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' }] },
  }],
  ['result', {
    type: 'result',
    subtype: 'success',
    result: 'done',
    session_id: 'sess-1',
    usage: { input_tokens: 1, output_tokens: 2 },
    duration_ms: 5,
  }],
  ['error', { type: 'error', message: 'boom', code: 'overloaded' }],
  ['system', { type: 'system', subtype: 'a_future_subtype', payload: 1 }],

  // ── Rate limits ───────────────────────────────────────────────
  ['rate_limit', { type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }],

  // ── Subagent tasks ────────────────────────────────────────────
  ['task_started', { type: 'system', subtype: 'task_started', task_id: 't-1', description: 'go' }],
  ['task_progress', { type: 'system', subtype: 'task_progress', task_id: 't-1', description: 'go' }],
  ['task_notification', {
    type: 'system',
    subtype: 'task_notification',
    task_id: 't-1',
    status: 'completed',
    output_file: '/out.md',
    summary: 'done',
  }],
  ['task_updated', { type: 'system', subtype: 'task_updated', task_id: 't-1', patch: { status: 'paused' } }],
  ['background_tasks_changed', { type: 'system', subtype: 'background_tasks_changed', tasks: [] }],

  // ── Tool lifecycle ────────────────────────────────────────────
  ['tool_progress', {
    type: 'tool_progress',
    tool_use_id: 'tu-1',
    tool_name: 'Bash',
    elapsed_time_seconds: 3,
  }],
  ['tool_use_summary', { type: 'tool_use_summary', summary: 'read two files', preceding_tool_use_ids: ['tu-1'] }],

  // ── Auth ──────────────────────────────────────────────────────
  ['auth_status', { type: 'auth_status', isAuthenticating: true, output: ['open the url'] }],

  // ── Hook lifecycle ────────────────────────────────────────────
  ['hook_started', { type: 'system', subtype: 'hook_started', hook_id: 'h-1', hook_name: 'audit', hook_event: 'PreToolUse' }],
  ['hook_progress', { type: 'system', subtype: 'hook_progress', hook_id: 'h-1', hook_name: 'audit', hook_event: 'PreToolUse' }],
  ['hook_response', { type: 'system', subtype: 'hook_response', hook_id: 'h-1', hook_name: 'audit', hook_event: 'PreToolUse', exit_code: 0 }],

  // ── Workspace & context ───────────────────────────────────────
  ['files_persisted', { type: 'system', subtype: 'files_persisted', files: [], failed: [], processed_at: 'now' }],
  ['compact_boundary', { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 100 } }],
  ['context_usage', {
    type: 'assistant',
    context_usage: { model: 'sonnet', total_tokens: 1, raw_max_tokens: 2, percentage: 50 },
  }],
  ['local_command_output', { type: 'system', subtype: 'local_command_output', content: '/help output' }],

  // ── Extended thinking ─────────────────────────────────────────
  ['thinking', { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'hmm' }] } }],
  ['thinking_tokens', { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 10, estimated_tokens_delta: 2 }],

  // ── API retries & model refusals ──────────────────────────────
  ['api_retry', { type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 3, retry_delay_ms: 10, error_status: 529, error: 'overloaded' }],
  ['model_refusal_fallback', { type: 'system', subtype: 'model_refusal_fallback', direction: 'retry', original_model: 'opus', fallback_model: 'sonnet', request_id: null, content: '' }],
  ['model_refusal_no_fallback', { type: 'system', subtype: 'model_refusal_no_fallback', original_model: 'opus', request_id: null, content: '' }],

  // ── Session & worker lifecycle ────────────────────────────────
  ['session_state_changed', { type: 'system', subtype: 'session_state_changed', state: 'running' }],
  ['status', { type: 'system', subtype: 'status', status: 'requesting' }],
  ['worker_shutting_down', { type: 'system', subtype: 'worker_shutting_down', reason: 'redeploy' }],
  ['conversation_reset', { type: 'conversation_reset', new_conversation_id: 'conv-2' }],
  ['mirror_error', { type: 'system', subtype: 'mirror_error', error: 'nope', key: { projectKey: 'p', sessionId: 's' } }],
  ['init', { type: 'system', subtype: 'init', model: 'sonnet', cwd: '/repo' }],

  // ── Permissions & notifications ───────────────────────────────
  ['permission_denied', { type: 'system', subtype: 'permission_denied', tool_name: 'Bash', tool_use_id: 'tu-1', message: 'no' }],
  ['notification', { type: 'system', subtype: 'notification', key: 'idle', text: 'waiting', priority: 'low' }],
  ['informational', { type: 'system', subtype: 'informational', content: 'fyi', level: 'info' }],
  ['prompt_suggestion', { type: 'prompt_suggestion', suggestion: 'run the tests' }],

  // ── Partial messages & memory ─────────────────────────────────
  ['partial_message', { type: 'stream_event', event: { type: 'ping' }, parent_tool_use_id: null }],
  ['memory_recall', { type: 'system', subtype: 'memory_recall', mode: 'select', memories: [] }],

  // ── Commands, plugins & elicitation ───────────────────────────
  ['commands_changed', { type: 'system', subtype: 'commands_changed', commands: [] }],
  ['plugin_install', { type: 'system', subtype: 'plugin_install', status: 'installed', name: 'ops' }],
  ['elicitation_complete', { type: 'system', subtype: 'elicitation_complete', mcp_server_name: 'linear', elicitation_id: 'e-1' }],
  ['control_request_progress', { type: 'system', subtype: 'control_request_progress', request_id: 'r-1', status: 'started' }],
];

/** The full `StreamEvent` union, as parsed from the fixtures above. */
function parsedEvents(): StreamEvent[] {
  return WIRE_LINES.map(([type, wire]) => {
    const event = parseStreamLine(JSON.stringify(wire));
    if (!event) throw new Error(`fixture for "${type}" parsed to null`);
    return event;
  });
}

/**
 * Register one recording callback per event type.
 *
 * `on()` is a wall of literal-typed overloads, which is exactly the point of the
 * API but useless for iterating the union — so the registration goes through one
 * widened reference instead of 43 individually-typed calls.
 */
function recorderFor(handle: StreamHandle | ChatHandle): Map<string, unknown[]> {
  const register = handle.on.bind(handle) as unknown as
    (type: string, callback: (payload: unknown) => void) => void;

  const seen = new Map<string, unknown[]>();
  for (const [type] of WIRE_LINES) {
    seen.set(type, []);
    register(type, (payload) => { seen.get(type)!.push(payload); });
  }
  return seen;
}

/** Assert every registered callback fired exactly once with a matching payload. */
function expectEachFiredOnce(seen: Map<string, unknown[]>): void {
  for (const [type] of WIRE_LINES) {
    const received = seen.get(type)!;
    expect(received, `no callback fired for "${type}"`).toHaveLength(1);

    // `text` is the one event whose callback receives the payload, not the event.
    if (type === 'text') {
      expect(received[0]).toBe('hello');
    } else {
      expect((received[0] as StreamEvent).type, `wrong event routed to "${type}"`).toBe(type);
    }
  }
}

beforeEach(() => {
  spawned.length = 0;
});

describe('the fixture table covers the whole StreamEvent union', () => {
  it('has one line per event type, with no duplicates', () => {
    const types = WIRE_LINES.map(([type]) => type);

    expect(types).toHaveLength(43);
    expect(new Set(types).size).toBe(43);
  });

  it('parses each line into the event type it claims', () => {
    for (const [type, wire] of WIRE_LINES) {
      const event = parseStreamLine(JSON.stringify(wire));
      expect(event, `fixture for "${type}" parsed to null`).not.toBeNull();
      expect(event!.type, `fixture for "${type}" parsed to "${event!.type}"`).toBe(type);
    }
  });
});

describe('StreamHandle.on()', () => {
  it('routes all 43 event variants to their own callback', async () => {
    const events = parsedEvents();
    const handle = new StreamHandle(async function* () { yield* events; });
    const seen = recorderFor(handle);

    await handle.done();

    expectEachFiredOnce(seen);
  });

  it('returns this from on(), so registrations chain', () => {
    const handle = new StreamHandle(async function* () { /* empty */ });

    expect(handle.on('text', () => {})).toBe(handle);
    expect(handle.on('api_retry', () => {}).on('mirror_error', () => {})).toBe(handle);
  });

  it('fires every callback registered for the same event', async () => {
    const events = parsedEvents();
    const hits: string[] = [];
    const handle = new StreamHandle(async function* () { yield* events; });

    handle.on('thinking_tokens', () => hits.push('first'));
    handle.on('thinking_tokens', () => hits.push('second'));

    await handle.done();

    expect(hits).toEqual(['first', 'second']);
  });

  it('keeps streaming when a callback throws', async () => {
    const events = parsedEvents();
    const handle = new StreamHandle(async function* () { yield* events; });
    let reachedResult = false;

    handle.on('api_retry', () => { throw new Error('callback blew up'); });
    handle.on('result', () => { reachedResult = true; });

    await expect(handle.done()).resolves.toMatchObject({ type: 'result' });
    expect(reachedResult).toBe(true);
  });

  it('dispatches during text() as well as done()', async () => {
    const events = parsedEvents();
    const handle = new StreamHandle(async function* () { yield* events; });
    const seen = recorderFor(handle);

    const text = await handle.text();

    expect(text).toBe('hello');
    expectEachFiredOnce(seen);
  });

  it('leaves events with no listener alone', async () => {
    const events = parsedEvents();
    const handle = new StreamHandle(async function* () { yield* events; });

    // No callbacks registered at all — consuming the stream must still work.
    await expect(handle.done()).resolves.toMatchObject({ type: 'result' });
  });
});

describe('ChatHandle.on()', () => {
  /** Build a chat handle over the fake child process. */
  function createChat(): { chat: ChatHandle; child: FakeChild } {
    const chat = new ChatHandle('claude', ['--print'], { cwd: '/repo', env: {} });
    return { chat, child: spawned.at(-1)! };
  }

  /** Push every fixture line through the fake stdout and let the stream settle. */
  async function feedAll(child: FakeChild): Promise<void> {
    child.stdout.write(WIRE_LINES.map(([, wire]) => JSON.stringify(wire)).join('\n') + '\n');
    await new Promise((resolve) => setImmediate(resolve));
  }

  it('routes all 43 event variants to their own callback', async () => {
    const { chat, child } = createChat();
    const seen = recorderFor(chat);

    await feedAll(child);
    chat.end();

    expectEachFiredOnce(seen);
  });

  it('returns this from on(), so registrations chain', () => {
    const { chat } = createChat();

    expect(chat.on('text', () => {})).toBe(chat);
    expect(chat.on('permission_denied', () => {}).on('context_usage', () => {})).toBe(chat);
    chat.end();
  });

  it('tracks the session id and turn count from routed result events', async () => {
    const { chat, child } = createChat();

    expect(chat.sessionId).toBeNull();
    expect(chat.turnCount).toBe(0);

    await feedAll(child);

    expect(chat.sessionId).toBe('sess-1');
    expect(chat.turnCount).toBe(1);
    chat.end();
  });

  it('re-assembles events split across stdout chunks', async () => {
    const { chat, child } = createChat();
    const seen: string[] = [];
    chat.on('worker_shutting_down', (event) => seen.push(event.reason));

    const line = JSON.stringify({ type: 'system', subtype: 'worker_shutting_down', reason: 'redeploy' });
    child.stdout.write(line.slice(0, 12));
    await new Promise((resolve) => setImmediate(resolve));
    child.stdout.write(line.slice(12) + '\n');
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen).toEqual(['redeploy']);
    chat.end();
  });

  it('keeps reading when a callback throws', async () => {
    const { chat, child } = createChat();
    let sawResult = false;

    chat.on('api_retry', () => { throw new Error('callback blew up'); });
    chat.on('result', () => { sawResult = true; });

    await feedAll(child);

    expect(sawResult).toBe(true);
    chat.end();
  });
});
