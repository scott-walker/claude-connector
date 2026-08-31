import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session } from '../src/client/session.js';
import { SdkExecutor } from '../src/executor/sdk-executor.js';
import { ValidationError } from '../src/errors/errors.js';
import type { IExecutor } from '../src/executor/interface.js';
import type { QueryResult, StreamEvent } from '../src/types/index.js';
import { sdkMock } from './helpers/sdk-mock.js';

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock } = await import('./helpers/sdk-mock.js');
  return createSdkModuleMock();
});

/**
 * The stored-session management surface added by the 0.3.x parity work.
 *
 * These methods never touch the executor: they call the SDK module's own
 * session helpers, which is why they work in CLI mode too. The mocked executor
 * below is deliberately a plain object — if a method ever started routing
 * through it, `execute` would record a call it should not have.
 */

function createExecutor(sessionId = 'sess-001'): IExecutor {
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

beforeEach(() => {
  sdkMock.reset();
});

describe('delegation to the SDK session helpers', () => {
  it('rename() calls renameSession with the id, title and scope', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    await session.rename('src audit');

    expect(sdkMock.argsOf('renameSession')).toEqual(['sess-1', 'src audit', { dir: '/repo' }]);
  });

  it('tag() calls tagSession, and null clears the tag', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    await session.tag('review');
    await session.tag(null);

    expect(sdkMock.callsTo('tagSession').map((call) => call.args)).toEqual([
      ['sess-1', 'review', { dir: '/repo' }],
      ['sess-1', null, { dir: '/repo' }],
    ]);
  });

  it('info() calls getSessionInfo and returns its payload', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    const info = await session.info();

    expect(sdkMock.argsOf('getSessionInfo')).toEqual(['sess-1', { dir: '/repo' }]);
    expect(info).toEqual({ sessionId: 'sess-1', summary: 'An audit', lastModified: 1 });
  });

  it('info() passes an undefined result straight through', async () => {
    sdkMock.returns['getSessionInfo'] = undefined;
    const session = new Session({}, createExecutor(), { resume: 'sess-1' });

    await expect(session.info()).resolves.toBeUndefined();
  });

  it('messages() calls getSessionMessages with pagination options', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    const messages = await session.messages({ limit: 10, offset: 5, includeSystemMessages: true });

    expect(sdkMock.argsOf('getSessionMessages')).toEqual([
      'sess-1',
      { dir: '/repo', limit: 10, offset: 5, includeSystemMessages: true },
    ]);
    expect(messages).toEqual([{ type: 'user', uuid: 'm1' }]);
  });

  it('subagents() calls listSubagents and returns the ids', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    const ids = await session.subagents();

    expect(sdkMock.argsOf('listSubagents')).toEqual(['sess-1', { dir: '/repo' }]);
    expect(ids).toEqual(['agent-a', 'agent-b']);
  });

  it('subagentMessages() passes the session id AND the agent id', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    const messages = await session.subagentMessages('agent-a', { limit: 2 });

    expect(sdkMock.argsOf('getSubagentMessages')).toEqual([
      'sess-1',
      'agent-a',
      { dir: '/repo', limit: 2 },
    ]);
    expect(messages).toEqual([{ type: 'assistant', uuid: 'm2' }]);
  });

  it('never routes a stored-session call through the executor', async () => {
    const executor = createExecutor();
    const session = new Session({ cwd: '/repo' }, executor, { resume: 'sess-1' });

    await session.rename('x');
    await session.info();
    await session.messages();
    await session.subagents();

    expect(executor.execute).not.toHaveBeenCalled();
    expect(executor.stream).not.toHaveBeenCalled();
  });
});

describe('project scope', () => {
  it('defaults dir to the client cwd', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    await session.rename('x');

    expect(sdkMock.argsOf('renameSession')[2]).toEqual({ dir: '/repo' });
  });

  it('lets an explicit dir in the options win', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    await session.rename('x', { dir: '/elsewhere' });

    expect(sdkMock.argsOf('renameSession')[2]).toEqual({ dir: '/elsewhere' });
  });

  it('omits dir entirely when the client has no cwd', async () => {
    const session = new Session({}, createExecutor(), { resume: 'sess-1' });

    await session.rename('x');

    expect(sdkMock.argsOf('renameSession')[2]).toEqual({ dir: undefined });
  });

  it('carries a caller-supplied sessionStore into the scope', async () => {
    const sessionStore = { append: async () => {}, load: async () => null };
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    await session.delete({ sessionStore });

    expect(sdkMock.argsOf('deleteSession')[1]).toEqual({ dir: '/repo', sessionStore });
  });
});

describe('the null-sessionId guard', () => {
  const methods: Array<[string, (session: Session) => Promise<unknown>]> = [
    ['rename', (session) => session.rename('x')],
    ['tag', (session) => session.tag('x')],
    ['delete', (session) => session.delete()],
    ['fork', (session) => session.fork()],
    ['info', (session) => session.info()],
    ['messages', (session) => session.messages()],
    ['subagents', (session) => session.subagents()],
    ['subagentMessages', (session) => session.subagentMessages('agent-a')],
  ];

  it.each(methods)('%s() throws a ValidationError naming itself', async (name, call) => {
    const session = new Session({}, createExecutor());
    expect(session.sessionId).toBeNull();

    await expect(call(session)).rejects.toThrow(ValidationError);
    await expect(call(session)).rejects.toThrow(`is required by ${name}()`);
  });

  it('does not reach the SDK at all when the guard fires', async () => {
    const session = new Session({}, createExecutor());

    await expect(session.rename('x')).rejects.toThrow(ValidationError);

    expect(sdkMock.calls).toHaveLength(0);
  });

  it('stops throwing once a query has produced an id', async () => {
    const session = new Session({}, createExecutor('sess-fresh'));

    await session.query('Hello');

    expect(session.sessionId).toBe('sess-fresh');
    await expect(session.rename('x')).resolves.toBeUndefined();
    expect(sdkMock.argsOf('renameSession')[0]).toBe('sess-fresh');
  });

  it('is satisfied up front by a pinned sessionId', async () => {
    const session = new Session({}, createExecutor(), { sessionId: 'pinned-uuid' });

    await session.rename('x');

    expect(sdkMock.argsOf('renameSession')[0]).toBe('pinned-uuid');
  });
});

/**
 * Which transport the branch runs on is the whole of `fork()`'s contract.
 *
 * The plain mock executor stands in for CLI mode, where every turn spawns its
 * own process and `--resume` on the branch's argv is enough. The last case uses
 * a real {@link SdkExecutor}, because there `--resume` is inert against a
 * session opened at client construction — so the branch has to get an SDK
 * session of its own or it silently appends to the transcript it forked away
 * from.
 */
describe('fork()', () => {
  it('returns a NEW Session resuming the forked transcript', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const executor = createExecutor();
    const session = new Session({ cwd: '/repo' }, executor, { resume: 'sess-1' });

    const branch = await session.fork({ title: 'alternative plan' });

    expect(sdkMock.argsOf('forkSession')).toEqual([
      'sess-1',
      { dir: '/repo', title: 'alternative plan' },
    ]);
    expect(branch).toBeInstanceOf(Session);
    expect(branch).not.toBe(session);
    expect(branch.sessionId).toBe('forked-1');
    expect(branch.queryCount).toBe(0);
  });

  it('leaves the original session untouched', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const session = new Session({ cwd: '/repo' }, createExecutor('sess-1'), { resume: 'sess-1' });
    await session.query('First');

    await session.fork();

    expect(session.sessionId).toBe('sess-1');
    expect(session.queryCount).toBe(1);
  });

  it('in CLI mode keeps the executor and resumes the fork on the branch turn', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const executor = createExecutor('forked-1');
    const session = new Session({ cwd: '/repo', model: 'opus' }, executor, { resume: 'sess-1' });

    const branch = await session.fork();
    await branch.query('Try the other approach');

    // One process per turn, so sharing the executor is free and the fork
    // resumes its own transcript on its very first argv.
    expect(executor.execute).toHaveBeenCalledTimes(1);
    const [args] = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string[]];
    expect(args).toContain('--resume');
    expect(args[args.indexOf('--resume') + 1]).toBe('forked-1');
    expect(args).toContain('--model');
  });

  it('in SDK mode opens a session of its own, bound to the fork', async () => {
    sdkMock.returns['forkSession'] = { sessionId: 'forked-1' };
    const parent = new SdkExecutor({ cwd: '/repo', resume: 'sess-1' });
    const session = new Session(
      { cwd: '/repo', resume: 'sess-1', model: 'opus' },
      parent,
      { resume: 'sess-1' },
    );

    const branch = await session.fork();
    await branch.query('Try the other approach');

    // The turn opened one SDK session, and it resumes 'forked-1' — had the
    // branch reused the parent's executor, the turn would have landed on
    // 'sess-1' while `branch.sessionId` still reported the fork.
    expect(sdkMock.queries).toHaveLength(1);
    expect(sdkMock.lastOptions()['resume']).toBe('forked-1');
    // Everything that does not name the parent transcript is inherited.
    expect(sdkMock.lastOptions()['model']).toBe('opus');

    // The branch owns that session, so it is the one that has to release it.
    branch.close();
    expect(sdkMock.openQueries).toBe(0);
  });

  it('slices the transcript when upToMessageId is given', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor(), { resume: 'sess-1' });

    await session.fork({ upToMessageId: 'msg-9' });

    expect(sdkMock.argsOf('forkSession')[1]).toEqual({ dir: '/repo', upToMessageId: 'msg-9' });
  });
});

describe('delete()', () => {
  it('calls deleteSession and resets the local state', async () => {
    const session = new Session({ cwd: '/repo' }, createExecutor('sess-1'), { resume: 'sess-1' });
    await session.query('First');
    expect(session.queryCount).toBe(1);

    await session.delete();

    expect(sdkMock.argsOf('deleteSession')).toEqual(['sess-1', { dir: '/repo' }]);
    expect(session.sessionId).toBeNull();
    expect(session.queryCount).toBe(0);
  });

  it('leaves the instance usable — the next query starts a fresh session', async () => {
    const executor = createExecutor('sess-new');
    const session = new Session({}, executor, { resume: 'sess-old' });

    await session.delete();
    await session.query('Start over');

    const [args] = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string[]];
    expect(args).not.toContain('--resume');
    expect(session.sessionId).toBe('sess-new');
    expect(session.queryCount).toBe(1);
  });

  it('re-arms the null-sessionId guard', async () => {
    const session = new Session({}, createExecutor(), { resume: 'sess-1' });

    await session.delete();

    await expect(session.rename('x')).rejects.toThrow('is required by rename()');
  });
});
