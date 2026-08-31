import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ts from 'typescript';

import { Claude } from '../src/client/claude.js';
import { Session } from '../src/client/session.js';
import { ChatHandle } from '../src/client/chat-handle.js';
import { toSdkExecutorOptions } from '../src/client/sdk-options.js';
import { SdkExecutor, type SdkExecutorOptions } from '../src/executor/sdk-executor.js';
import type { ExecuteOptions, IExecutor } from '../src/executor/interface.js';
import { parseJsonResult } from '../src/parser/json-parser.js';
import { parseStreamEvents, parseStreamLine } from '../src/parser/stream-parser.js';
import { validateClientOptions } from '../src/utils/validation.js';
import { ValidationError } from '../src/errors/errors.js';
import type { QueryResult, StreamEvent, StreamResultEvent } from '../src/types/index.js';
import * as barrel from '../src/index.js';
import type { McpSdkServerConfigWithInstance, McpSdkServerStatusConfig } from '../src/index.js';
import {
  ABORT_MESSAGE,
  DEFAULT_TIMEOUT_MS,
  EVENT_RESULT,
  EVENT_SESSION_STATE_CHANGED,
  EVENT_TEXT,
  EVENT_THINKING,
  EVENT_TOOL_RESULT,
  EVENT_TOOL_USE,
  FLAG_RESUME_DROPS_TURN,
  FLAG_RESUME_SESSION_AT,
  MCP_SDK,
  PLUGIN_LOCAL,
  PLUGIN_URL,
  RESULT_ERROR_MAX_TURNS,
} from '../src/constants.js';
import { sdkMock, resultMessage } from './helpers/sdk-mock.js';

/**
 * The hand-applied round of fixes, one describe block per defect.
 *
 * These are the changes no earlier suite covers, so each case is written to
 * fail if the fix is reverted rather than to restate what the code does:
 *
 * 1. `init()` clearing the initialization-timeout timer;
 * 2. an abort landing inside the post-result drain keeping the turn's result,
 *    while one landing before the result still rejects;
 * 3. `parseJsonResult` carrying the whole result payload, not a fraction;
 * 4. a CLI `tool_use` block keeping the id that ties it to its `tool_result`;
 * 5. `ChatHandle` dispatching every event a stream-json line carries;
 * 6. `resumeSessionAt` / `resumeDropsTurn` reaching the args builder;
 * 7. `postResultDrainMs` reaching the SDK executor from `ClientOptions`;
 * 8. the two option combinations neither mode can honour;
 * 9. the barrel exports the follow-ups added.
 *
 * Everything runs against mocks — no `claude` binary, no network, no timers
 * longer than a few milliseconds.
 */

// ── Mocks ─────────────────────────────────────────────────────────

/**
 * Scripting surface for the SDK mock's read side, hoisted so the `vi.mock`
 * factory (which vitest lifts above every import) shares one object with the
 * assertions below.
 */
const sdkHooks = vi.hoisted(() => ({
  /**
   * Aborted synchronously on the first read the executor starts *after* the
   * result — the one moment where the turn is inside its drain window, which is
   * the case fix 2 is about.
   */
  abortAfterResult: null as AbortController | null,

  /** Frame delivered `lateFrameDelayMs` after that same read starts. */
  lateFrame: null as Record<string, unknown> | null,

  /** Long enough to lose to a `setImmediate`, short enough to keep tests fast. */
  lateFrameDelayMs: 10,
}));

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock } = await import('./helpers/sdk-mock.js');
  const { EVENT_RESULT } = await import('../src/constants.js');

  const module = createSdkModuleMock();
  const open = module['query'] as (
    params: { prompt: unknown; options: Record<string, unknown> },
  ) => Record<string, unknown>;

  return {
    ...module,
    query(params: { prompt: unknown; options: Record<string, unknown> }) {
      const query = open(params);
      const read = query['next'] as () => Promise<IteratorResult<Record<string, unknown>>>;
      let pastResult = false;
      let lateFrameSent = false;

      return {
        ...query,
        next(): Promise<IteratorResult<Record<string, unknown>>> {
          if (pastResult) {
            // The executor opens the drain window before starting this read, so
            // an abort raised here is unambiguously a post-result one.
            sdkHooks.abortAfterResult?.abort();

            if (sdkHooks.lateFrame !== null && !lateFrameSent) {
              lateFrameSent = true;
              const value = sdkHooks.lateFrame;
              return new Promise((resolve) => {
                setTimeout(() => resolve({ value, done: false }), sdkHooks.lateFrameDelayMs);
              });
            }
          }

          return read().then((step) => {
            if (!step.done && step.value['type'] === EVENT_RESULT) pastResult = true;
            return step;
          });
        },
        [Symbol.asyncIterator]() { return this; },
      };
    },
  };
});

/** The stdio surface {@link ChatHandle} drives, with no process behind it. */
interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: () => boolean; end: () => void; destroyed: boolean };
  killed: boolean;
  kill: () => boolean;
}

/** Every fake child `spawn()` handed out, newest last. */
const spawned = vi.hoisted(() => ({ children: [] as unknown[] }));

vi.mock('node:child_process', async () => {
  const { EventEmitter: Emitter } = await import('node:events');

  return {
    spawn: () => {
      const child = new Emitter() as EventEmitter & Record<string, unknown>;
      child['stdout'] = new Emitter();
      child['stderr'] = new Emitter();
      child['stdin'] = { write: () => true, end: () => { /* EOF */ }, destroyed: false };
      child['killed'] = false;
      child['kill'] = () => { child['killed'] = true; return true; };
      spawned.children.push(child);
      return child;
    },
  };
});

beforeEach(() => {
  sdkMock.reset();
  sdkHooks.abortAfterResult = null;
  sdkHooks.lateFrame = null;
  sdkHooks.lateFrameDelayMs = 10;
  spawned.children.length = 0;
});

// ── Shared helpers ────────────────────────────────────────────────

const BASE: ExecuteOptions = { cwd: '/repo', env: {}, prompt: 'hi' };

/** A warmed-up SDK executor. */
async function warm(options: SdkExecutorOptions = { model: 'sonnet' }): Promise<SdkExecutor> {
  const executor = new SdkExecutor(options);
  await executor.init();
  return executor;
}

/**
 * Referenced `setTimeout` handles holding the event loop open right now.
 *
 * `process.getActiveResourcesInfo()` lists referenced handles only, so a timer
 * that was cleared — or never armed — does not appear.
 */
function armedTimeouts(): number {
  return process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length;
}

/** Yield to the macrotask queue, so every pending continuation has run. */
const tick = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });

const delay = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

/** The one event of `type` a stream-json line carries, narrowed to its variant. */
function eventOf<T extends StreamEvent['type']>(
  line: string,
  type: T,
): Extract<StreamEvent, { type: T }> {
  const match = parseStreamEvents(line).find((event) => event.type === type);
  if (!match) throw new Error(`no '${type}' event in: ${line}`);
  return match as Extract<StreamEvent, { type: T }>;
}

/** Newest fake child process, for the {@link ChatHandle} cases. */
function lastChild(): FakeChild {
  const child = spawned.children.at(-1);
  if (!child) throw new Error('spawn() was never called');
  return child as FakeChild;
}

/** Feed one stream-json line to a {@link ChatHandle}, synchronously. */
function emitLine(child: FakeChild, payload: Record<string, unknown>): void {
  child.stdout.emit('data', Buffer.from(`${JSON.stringify(payload)}\n`));
}

/** A non-SDK executor, so {@link Session} builds real CLI args for every turn. */
function createMockExecutor(sessionId = 'sess-resume'): IExecutor {
  const result: QueryResult = {
    text: 'response',
    sessionId,
    usage: { inputTokens: 1, outputTokens: 2 },
    cost: null,
    durationMs: 10,
    messages: [],
    structured: null,
    raw: {},
  };

  return {
    execute: vi.fn().mockResolvedValue(result),
    stream: vi.fn().mockImplementation(async function* () {
      yield { type: 'result', text: 'response', sessionId } as StreamEvent;
    }),
    abort: vi.fn(),
  };
}

/** Args of one recorded `execute()` call. */
function argsOfTurn(executor: IExecutor, turn: number): string[] {
  const calls = (executor.execute as ReturnType<typeof vi.fn>).mock.calls;
  const call = calls[turn] as [string[], ExecuteOptions] | undefined;
  if (!call) throw new Error(`execute() was not called ${turn + 1} time(s)`);
  return call[0];
}

/** The value a flag carries, or `undefined` when the flag is absent. */
function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/**
 * The fields a one-shot result and its streaming twin must agree on.
 *
 * `QueryResult` and {@link StreamResultEvent} spell them identically, which is
 * what makes the two comparable at all.
 */
function resultFields(source: QueryResult | StreamResultEvent): Record<string, unknown> {
  return {
    text: source.text,
    sessionId: source.sessionId,
    usage: source.usage,
    cost: source.cost,
    durationMs: source.durationMs,
    structured: source.structured ?? null,
    subtype: source.subtype,
    isError: source.isError,
    errors: source.errors,
    terminalReason: source.terminalReason,
    modelUsage: source.modelUsage,
    permissionDenials: source.permissionDenials,
    deferredToolUse: source.deferredToolUse,
    durationApiMs: source.durationApiMs,
    queuedTurnCount: source.queuedTurnCount,
    ttftMs: source.ttftMs,
    apiErrorStatus: source.apiErrorStatus,
    fastModeState: source.fastModeState,
    origin: source.origin,
  };
}

// ── 1. init() clears its timeout ──────────────────────────────────

describe('init() clears its initialization timeout', () => {
  it('leaves no armed timer behind once the session is warm', async () => {
    // Anything already scheduled has run, so the two samples differ only by
    // what init() itself leaves behind.
    await tick();
    const before = armedTimeouts();

    const executor = new SdkExecutor({ model: 'sonnet', initTimeoutMs: 60_000 });
    await executor.init();

    // The timer was armed for a minute; had it survived, it would still be
    // holding the event loop open here.
    expect(armedTimeouts()).toBe(before);
    executor.close();
  });

  it('uses a probe that really does see a timer left armed', () => {
    const before = armedTimeouts();

    const timer = setTimeout(() => { /* never runs */ }, 60_000);
    expect(armedTimeouts()).toBe(before + 1);

    clearTimeout(timer);
    expect(armedTimeouts()).toBe(before);
  });
});

// ── 2. abort vs. the post-result drain window ─────────────────────

describe('a cancel that lands inside the post-result drain window', () => {
  it('resolves with the turn result instead of rejecting', async () => {
    const controller = new AbortController();
    sdkHooks.abortAfterResult = controller;
    sdkMock.responses = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'answer' }] } },
      resultMessage({ result: 'answer', session_id: 'sess-late-abort' }),
    ];

    const executor = await warm({ model: 'sonnet', postResultDrainMs: 1_000 });
    const result = await executor.execute([], { ...BASE, signal: controller.signal });

    expect(result.text).toBe('answer');
    expect(result.sessionId).toBe('sess-late-abort');
    // The cancel was honoured — the turn was interrupted, its answer was kept.
    expect(sdkMock.called('interrupt')).toBe(true);
    executor.close();
  });

  it('still rejects when the cancel lands before the result', async () => {
    // The turn is held back until interrupt() arrives, so the abort is
    // guaranteed to land while the executor is waiting for the first message.
    sdkMock.holdUntilInterrupt = true;
    const controller = new AbortController();
    const executor = await warm();

    const turn = executor.execute([], { ...BASE, signal: controller.signal });
    await tick();
    controller.abort();

    await expect(turn).rejects.toThrow(ABORT_MESSAGE);
    executor.close();
  });
});

// ── 3. CLI non-streaming carries the full result ──────────────────

/**
 * One `claude -p --output-format json` payload, with every field the result
 * message can carry. Written as wire JSON on purpose: it is external data, and
 * the point of the case is that the snake_case wire spelling survives.
 */
const CLI_RESULT_PAYLOAD: Record<string, unknown> = {
  type: 'result',
  subtype: 'error_max_turns',
  is_error: true,
  result: 'Stopped after three turns.',
  session_id: 'cli-sess-77',
  duration_ms: 8_421,
  duration_api_ms: 6_120,
  num_turns: 3,
  total_cost_usd: 0.0731,
  ttft_ms: 412,
  queued_turn_count: 2,
  api_error_status: 529,
  fast_mode_state: 'cooldown',
  terminal_reason: 'max_turns',
  origin: { kind: 'human' },
  errors: ['Tool Bash exited 1'],
  permission_denials: [
    { tool_name: 'Bash', tool_use_id: 'toolu_denied', tool_input: { command: 'rm -rf /' } },
  ],
  deferred_tool_use: { id: 'toolu_deferred', name: 'Write', input: { file_path: '/tmp/out' } },
  modelUsage: {
    'claude-sonnet-4-6': {
      inputTokens: 1_200,
      outputTokens: 340,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 64,
      webSearchRequests: 1,
      costUSD: 0.0731,
      contextWindow: 200_000,
      maxOutputTokens: 64_000,
      canonicalModel: 'claude-sonnet-4-6',
      provider: 'anthropic',
      costBasis: 'api',
    },
  },
  usage: {
    input_tokens: 1_200,
    output_tokens: 340,
    cache_creation_input_tokens: 64,
    cache_read_input_tokens: 900,
    server_tool_use: { web_search_requests: 1, web_fetch_requests: 2 },
    service_tier: 'standard',
  },
};

describe('parseJsonResult carries the whole result payload', () => {
  const result = parseJsonResult(JSON.stringify(CLI_RESULT_PAYLOAD));

  it('keeps the turn outcome', () => {
    expect(result.text).toBe('Stopped after three turns.');
    expect(result.sessionId).toBe('cli-sess-77');
    expect(result.subtype).toBe(RESULT_ERROR_MAX_TURNS);
    expect(result.isError).toBe(true);
    expect(result.errors).toEqual(['Tool Bash exited 1']);
    expect(result.terminalReason).toBe('max_turns');
    expect(result.origin).toEqual({ kind: 'human' });
  });

  it('keeps the accounting', () => {
    expect(result.cost).toBe(0.0731);
    expect(result.durationMs).toBe(8_421);
    expect(result.durationApiMs).toBe(6_120);
    expect(result.ttftMs).toBe(412);
    expect(result.queuedTurnCount).toBe(2);
    expect(result.apiErrorStatus).toBe(529);
    expect(result.fastModeState).toBe('cooldown');
    expect(result.modelUsage).toEqual({
      'claude-sonnet-4-6': {
        inputTokens: 1_200,
        outputTokens: 340,
        cacheReadInputTokens: 900,
        cacheCreationInputTokens: 64,
        webSearchRequests: 1,
        costUsd: 0.0731,
        contextWindow: 200_000,
        maxOutputTokens: 64_000,
        canonicalModel: 'claude-sonnet-4-6',
        provider: 'anthropic',
        costBasis: 'api',
      },
    });
  });

  it('keeps the four cache and usage fields', () => {
    expect(result.usage).toEqual({
      inputTokens: 1_200,
      outputTokens: 340,
      cacheCreationInputTokens: 64,
      cacheReadInputTokens: 900,
      serverToolUse: { webSearchRequests: 1, webFetchRequests: 2 },
      serviceTier: 'standard',
    });
  });

  it('keeps the tool bookkeeping', () => {
    expect(result.permissionDenials).toEqual([
      { toolName: 'Bash', toolUseId: 'toolu_denied', toolInput: { command: 'rm -rf /' } },
    ]);
    expect(result.deferredToolUse).toEqual({
      id: 'toolu_deferred',
      name: 'Write',
      input: { file_path: '/tmp/out' },
    });
  });

  it('reports exactly what the streaming parser reports for the same payload', () => {
    // Both entry points now go through parseResultEvent, so the one-shot JSON
    // and the stream-json twin of a turn can only drift together.
    const streamed = eventOf(JSON.stringify(CLI_RESULT_PAYLOAD), EVENT_RESULT);

    expect(resultFields(result)).toEqual(resultFields(streamed));
    // The single-event reader sees the same message, so a caller on the older
    // entry point keeps the same view.
    expect(parseStreamLine(JSON.stringify(CLI_RESULT_PAYLOAD))).toEqual(streamed);
  });
});

// ── 4. tool_use keeps the id its tool_result answers ──────────────

describe('a CLI tool_use event carries its toolUseId', () => {
  const TOOL_USE_ID = 'toolu_01HZ3kQ';

  const invocation = JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: TOOL_USE_ID, name: 'Read', input: { file_path: '/repo/src/index.ts' } },
      ],
    },
  });

  const answer = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: TOOL_USE_ID, content: 'export class Claude {}', is_error: false },
      ],
    },
  });

  it('reads the id off the block', () => {
    const toolUse = eventOf(invocation, EVENT_TOOL_USE);

    expect(toolUse.toolName).toBe('Read');
    expect(toolUse.toolUseId).toBe(TOOL_USE_ID);
  });

  it('matches the id on the tool_result that answers it', () => {
    const toolUse = eventOf(invocation, EVENT_TOOL_USE);
    const toolResult = eventOf(answer, EVENT_TOOL_RESULT);

    expect(toolResult.toolUseId).toBe(toolUse.toolUseId);
  });
});

// ── 5. ChatHandle drains every event of a line ────────────────────

describe('ChatHandle drains every event a line carries', () => {
  function openChat(): { chat: ChatHandle; child: FakeChild } {
    const chat = new ChatHandle('claude', [], { cwd: '/repo', env: {} });
    return { chat, child: lastChild() };
  }

  it('dispatches both blocks of one assistant line', () => {
    const { chat, child } = openChat();
    const seen: string[] = [];
    chat.on(EVENT_THINKING, (event) => seen.push(`thinking:${event.thinking}`));
    chat.on(EVENT_TEXT, (text) => seen.push(`text:${text}`));

    emitLine(child, {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'weighing two options', signature: 'sig-1' },
          { type: 'text', text: 'the second one' },
        ],
      },
    });

    expect(seen).toEqual(['thinking:weighing two options', 'text:the second one']);
    chat.abort();
  });

  it('dispatches one event per tool_result of one user line', () => {
    const { chat, child } = openChat();
    const answered: string[] = [];
    chat.on(EVENT_TOOL_RESULT, (event) => answered.push(event.toolUseId));

    emitLine(child, {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_a', content: 'first' },
          { type: 'tool_result', tool_use_id: 'toolu_b', content: 'second' },
        ],
      },
    });

    expect(answered).toEqual(['toolu_a', 'toolu_b']);
    chat.abort();
  });
});

// ── 6. session resume options reach the args builder ──────────────

describe('SessionOptions.resumeSessionAt / resumeDropsTurn', () => {
  it('reach the args builder on the first turn only', async () => {
    const executor = createMockExecutor();
    const session = new Session({}, executor, {
      resume: 'sess-old',
      resumeSessionAt: '2026-08-30T10:15:00.000Z',
      resumeDropsTurn: 'msg-42',
    });

    await session.query('pick up where we stopped');
    await session.query('and now finish it');

    const first = argsOfTurn(executor, 0);
    expect(flagValue(first, FLAG_RESUME_SESSION_AT)).toBe('2026-08-30T10:15:00.000Z');
    expect(flagValue(first, FLAG_RESUME_DROPS_TURN)).toBe('msg-42');

    // A truncating resume rewrites the transcript at a chain entry. Repeating it
    // would re-truncate back to the same entry on every later turn — or be
    // rejected outright once that entry is no longer in the chain.
    const second = argsOfTurn(executor, 1);
    expect(second).not.toContain(FLAG_RESUME_SESSION_AT);
    expect(second).not.toContain(FLAG_RESUME_DROPS_TURN);
  });

  it('emit neither flag when the session does not ask for them', async () => {
    const executor = createMockExecutor();
    const session = new Session({}, executor, { resume: 'sess-old' });

    await session.query('pick up where we stopped');

    const args = argsOfTurn(executor, 0);
    expect(args).not.toContain(FLAG_RESUME_SESSION_AT);
    expect(args).not.toContain(FLAG_RESUME_DROPS_TURN);
  });
});

// ── 7. postResultDrainMs reaches the executor ─────────────────────

describe('postResultDrainMs', () => {
  /** A trailing frame the SDK sends after the result — the turn-over signal. */
  const IDLE_FRAME: Record<string, unknown> = {
    type: 'system',
    subtype: EVENT_SESSION_STATE_CHANGED,
    state: 'idle',
  };

  it('is projected from ClientOptions onto the SDK executor options', () => {
    expect(toSdkExecutorOptions({ postResultDrainMs: 250 }).postResultDrainMs).toBe(250);
    expect(toSdkExecutorOptions({}).postResultDrainMs).toBeUndefined();
  });

  it('widens the window a client turn drains trailing frames in', async () => {
    sdkHooks.lateFrame = IDLE_FRAME;
    const claude = new Claude({ postResultDrainMs: 1_000 });
    const states: string[] = [];

    await claude
      .stream('hi')
      .on(EVENT_SESSION_STATE_CHANGED, (event) => states.push(event.state))
      .done();

    expect(states).toEqual(['idle']);
    claude.close();
  });

  it('and the default window ends the turn before that frame lands', async () => {
    sdkHooks.lateFrame = IDLE_FRAME;
    const claude = new Claude({});
    const states: string[] = [];

    await claude
      .stream('hi')
      .on(EVENT_SESSION_STATE_CHANGED, (event) => states.push(event.state))
      .done();

    expect(states).toEqual([]);
    claude.close();
    // Let the frame's timer fire, so it cannot outlive this case.
    await delay(sdkHooks.lateFrameDelayMs + 10);
  });
});

// ── 8. the combinations neither mode can honour ───────────────────

describe('validateClientOptions rejects the impossible combinations', () => {
  it('rejects a url plugin in SDK mode', () => {
    const plugins = [{ type: PLUGIN_URL, url: 'https://example.com/plugin.zip' }] as const;

    expect(() => validateClientOptions({ plugins })).toThrow(ValidationError);
    expect(() => validateClientOptions({ plugins })).toThrow(/plugins/);
    expect(() => validateClientOptions({ plugins, useSdk: true })).toThrow(ValidationError);
  });

  it('accepts a url plugin in CLI mode, and a local one in either', () => {
    const url = [{ type: PLUGIN_URL, url: 'https://example.com/plugin.zip' }] as const;
    const local = [{ type: PLUGIN_LOCAL, path: '/plugins/ops' }] as const;

    expect(() => validateClientOptions({ plugins: url, useSdk: false })).not.toThrow();
    expect(() => validateClientOptions({ plugins: local })).not.toThrow();
    expect(() => validateClientOptions({ plugins: local, useSdk: false })).not.toThrow();
  });

  it('rejects an in-process MCP server in CLI mode', () => {
    const mcpServers = { calc: { type: MCP_SDK, name: 'calc', instance: {} } } as const;

    expect(() => validateClientOptions({ mcpServers, useSdk: false })).toThrow(ValidationError);
    expect(() => validateClientOptions({ mcpServers, useSdk: false })).toThrow(/calc/);
  });

  it('accepts an in-process MCP server in SDK mode, and a stdio one in either', () => {
    const inProcess = { calc: { type: MCP_SDK, name: 'calc', instance: {} } } as const;
    const stdio = { fs: { command: 'mcp-fs', args: ['--root', '/repo'] } } as const;

    expect(() => validateClientOptions({ mcpServers: inProcess })).not.toThrow();
    expect(() => validateClientOptions({ mcpServers: stdio, useSdk: false })).not.toThrow();
  });
});

// ── 9. the barrel exports the follow-ups added ────────────────────

/**
 * Names the package root re-exports, read off the barrel's own AST.
 *
 * Values can be probed at runtime; types cannot, and two of the five names
 * below are type-only — so both kinds are checked the same way, against what
 * `src/index.ts` actually declares.
 */
function barrelExportNames(): ReadonlySet<string> {
  const path = fileURLToPath(new URL('../src/index.ts', import.meta.url));
  const source = ts.createSourceFile(path, readFileSync(path, 'utf-8'), ts.ScriptTarget.ES2022, true);
  const names = new Set<string>();

  for (const statement of source.statements) {
    // `export { a, b } from '...'` / `export type { A, B } from '...'`
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) names.add(element.name.text);
      }
      continue;
    }

    // `export function f()`, `export interface I {}`, `export const c = …`
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
      continue;
    }

    const named = statement as ts.Node & { name?: ts.Node };
    if (named.name && ts.isIdentifier(named.name)) names.add(named.name.text);
  }

  return names;
}

describe('the package root exports the follow-ups', () => {
  it('exports the values at runtime', () => {
    expect(typeof barrel.parseStreamEvents).toBe('function');
    expect(typeof barrel.getUsageLimitPrefixes).toBe('function');
    expect(barrel.DEFAULT_TIMEOUT_MS).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('declares every follow-up name, type-only ones included', () => {
    const exported = barrelExportNames();

    // The probe itself must be able to fail.
    expect(exported.has('Claude')).toBe(true);
    expect(exported.has('NotAnExportOfThisPackage')).toBe(false);

    for (const name of [
      'parseStreamEvents',
      'getUsageLimitPrefixes',
      'DEFAULT_TIMEOUT_MS',
      'McpSdkServerStatusConfig',
      'McpSdkServerConfigWithInstance',
    ]) {
      expect(exported.has(name)).toBe(true);
    }
  });

  it('types an in-process MCP server through the root-exported aliases', () => {
    // Compile-time half of the case above: these two names have to resolve as
    // types when imported from the package root.
    const status: McpSdkServerStatusConfig = { type: MCP_SDK, name: 'calc' };
    const configured: McpSdkServerConfigWithInstance = { ...status, instance: {} };

    expect(configured.name).toBe('calc');
    expect(configured.instance).toEqual({});
  });
});
