import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SdkExecutor, type SdkExecutorOptions } from '../src/executor/sdk-executor.js';
import type { StreamEvent } from '../src/types/index.js';

/**
 * Mock the @anthropic-ai/claude-agent-sdk module.
 *
 * The mock simulates the V1 query() API:
 * - query() creates an AsyncGenerator that reads from the input iterable
 * - Each user message triggers a response (assistant + result)
 * - Control methods (setModel, accountInfo, etc.) are tracked
 */

// Track all calls for assertions
let queryCalls: Array<{ prompt: unknown; options: unknown }> = [];
let controlCalls: Record<string, unknown[]> = {};
let inputIterable: AsyncIterable<unknown> | null = null;
let customResponses: unknown[] | null = null;

function resetMocks() {
  queryCalls = [];
  controlCalls = {};
  inputIterable = null;
  customResponses = null;
}

// Create a mock Query object (AsyncGenerator + control methods)
function createMockQuery(prompt: unknown): AsyncGenerator<unknown, void> & {
  close: () => void;
  interrupt: () => Promise<void>;
  setModel: (model?: string) => Promise<void>;
  setPermissionMode: (mode: string) => Promise<void>;
  rewindFiles: (id: string, opts?: unknown) => Promise<unknown>;
  stopTask: (id: string) => Promise<void>;
  setMcpServers: (servers: unknown) => Promise<unknown>;
  reconnectMcpServer: (name: string) => Promise<void>;
  toggleMcpServer: (name: string, enabled: boolean) => Promise<void>;
  accountInfo: () => Promise<unknown>;
  supportedModels: () => Promise<unknown[]>;
  supportedCommands: () => Promise<unknown[]>;
  supportedAgents: () => Promise<unknown[]>;
  mcpServerStatus: () => Promise<unknown[]>;
  streamInput: (stream: AsyncIterable<unknown>) => Promise<void>;
} {
  // Store the input iterable for multi-turn
  if (typeof prompt === 'object' && prompt !== null && Symbol.asyncIterator in (prompt as object)) {
    inputIterable = prompt as AsyncIterable<unknown>;
  }

  let messageCount = 0;
  let closed = false;
  const pendingResolves: Array<(value: IteratorResult<unknown>) => void> = [];
  const messageQueue: unknown[] = [];

  // Simulate responses for each user message
  async function processUserMessage(): Promise<unknown[]> {
    messageCount++;
    if (messageCount === 1) {
      // First message — init response
      return [
        {
          type: 'system',
          subtype: 'init',
          model: 'sonnet',
          tools: ['Read', 'Edit', 'Bash'],
          mcp_servers: [],
          session_id: 'mock-session',
        },
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Initialized.' }] },
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Initialized.',
          session_id: 'mock-session',
          usage: { input_tokens: 5, output_tokens: 3 },
          total_cost_usd: 0.001,
          duration_ms: 100,
        },
      ];
    }
    // Subsequent messages — use custom responses if set, else default
    if (customResponses) {
      return customResponses;
    }
    return [
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: `Response ${messageCount}` }] },
      },
      {
        type: 'result',
        subtype: 'success',
        result: `Response ${messageCount}`,
        session_id: 'mock-session',
        usage: { input_tokens: 10, output_tokens: 20 },
        total_cost_usd: 0.01,
        duration_ms: 50,
      },
    ];
  }

  // Start reading from the input iterable in the background
  if (inputIterable) {
    (async () => {
      for await (const _msg of inputIterable!) {
        if (closed) break;
        const responses = await processUserMessage();
        for (const resp of responses) {
          if (pendingResolves.length > 0) {
            pendingResolves.shift()!({ value: resp, done: false });
          } else {
            messageQueue.push(resp);
          }
        }
      }
    })().catch(() => {});
  }

  const gen: any = {
    next(): Promise<IteratorResult<unknown>> {
      if (closed) return Promise.resolve({ value: undefined, done: true });
      if (messageQueue.length > 0) {
        return Promise.resolve({ value: messageQueue.shift()!, done: false });
      }
      return new Promise((resolve) => pendingResolves.push(resolve));
    },
    return(): Promise<IteratorResult<unknown>> {
      // Unlike a raw generator, the SDK Query's return() does NOT close the
      // underlying process. The explicit close() method is used for that.
      // This allows for await ... break to work without killing the session.
      return Promise.resolve({ value: undefined, done: true });
    },
    throw(err: Error): Promise<IteratorResult<unknown>> {
      closed = true;
      return Promise.reject(err);
    },
    [Symbol.asyncIterator]() {
      return this;
    },

    // Control methods
    close() {
      closed = true;
      for (const r of pendingResolves) {
        r({ value: undefined, done: true });
      }
      pendingResolves.length = 0;
    },
    async interrupt() {
      controlCalls['interrupt'] = controlCalls['interrupt'] || [];
      controlCalls['interrupt'].push([]);
    },
    async setModel(model?: string) {
      controlCalls['setModel'] = controlCalls['setModel'] || [];
      controlCalls['setModel'].push([model]);
    },
    async setPermissionMode(mode: string) {
      controlCalls['setPermissionMode'] = controlCalls['setPermissionMode'] || [];
      controlCalls['setPermissionMode'].push([mode]);
    },
    async rewindFiles(id: string, opts?: unknown) {
      controlCalls['rewindFiles'] = controlCalls['rewindFiles'] || [];
      controlCalls['rewindFiles'].push([id, opts]);
      return { canRewind: true, filesChanged: ['file.ts'], insertions: 5, deletions: 2 };
    },
    async stopTask(id: string) {
      controlCalls['stopTask'] = controlCalls['stopTask'] || [];
      controlCalls['stopTask'].push([id]);
    },
    async setMcpServers(servers: unknown) {
      controlCalls['setMcpServers'] = controlCalls['setMcpServers'] || [];
      controlCalls['setMcpServers'].push([servers]);
      return { added: ['srv1'], removed: [], errors: {} };
    },
    async reconnectMcpServer(name: string) {
      controlCalls['reconnectMcpServer'] = controlCalls['reconnectMcpServer'] || [];
      controlCalls['reconnectMcpServer'].push([name]);
    },
    async toggleMcpServer(name: string, enabled: boolean) {
      controlCalls['toggleMcpServer'] = controlCalls['toggleMcpServer'] || [];
      controlCalls['toggleMcpServer'].push([name, enabled]);
    },
    async accountInfo() {
      controlCalls['accountInfo'] = controlCalls['accountInfo'] || [];
      controlCalls['accountInfo'].push([]);
      return { email: 'test@example.com', subscriptionType: 'max' };
    },
    async supportedModels() {
      controlCalls['supportedModels'] = controlCalls['supportedModels'] || [];
      controlCalls['supportedModels'].push([]);
      return [{ value: 'sonnet', displayName: 'Sonnet', description: 'Fast' }];
    },
    async supportedCommands() {
      controlCalls['supportedCommands'] = controlCalls['supportedCommands'] || [];
      controlCalls['supportedCommands'].push([]);
      return [{ name: '/help' }];
    },
    async supportedAgents() {
      controlCalls['supportedAgents'] = controlCalls['supportedAgents'] || [];
      controlCalls['supportedAgents'].push([]);
      return [{ name: 'Explore', description: 'Fast explorer' }];
    },
    async mcpServerStatus() {
      controlCalls['mcpServerStatus'] = controlCalls['mcpServerStatus'] || [];
      controlCalls['mcpServerStatus'].push([]);
      return [{ name: 'github', status: 'connected' }];
    },
    async streamInput(stream: AsyncIterable<unknown>) {
      controlCalls['streamInput'] = controlCalls['streamInput'] || [];
      controlCalls['streamInput'].push([stream]);
    },
  };

  return gen;
}

// Mock the SDK module
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (params: { prompt: unknown; options: unknown }) => {
    queryCalls.push(params);
    return createMockQuery(params.prompt);
  },
}));

describe('SdkExecutor V1 — warm session lifecycle', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('init() creates exactly ONE query() call', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    expect(queryCalls).toHaveLength(1);

    executor.close();
  });

  it('init() is idempotent — second call is a no-op', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });

    await executor.init();
    await executor.init(); // second call

    expect(queryCalls).toHaveLength(1);

    executor.close();
  });

  it('ready is false before init, true after', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });

    expect(executor.ready).toBe(false);
    await executor.init();
    expect(executor.ready).toBe(true);

    executor.close();
  });

  it('emits init stage events', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });
    const stages: string[] = [];

    executor.on('init:stage', (stage) => stages.push(stage));

    await executor.init();

    expect(stages).toContain('importing');
    expect(stages).toContain('creating');
    expect(stages).toContain('connecting');
    expect(stages).toContain('ready');

    executor.close();
  });

  it('emits init:ready event', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });
    const readyFn = vi.fn();

    executor.on('init:ready', readyFn);

    await executor.init();

    expect(readyFn).toHaveBeenCalledOnce();

    executor.close();
  });

  it('multiple execute() calls do NOT create additional query() instances', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    expect(queryCalls).toHaveLength(1);

    const args = ['--print', '--output-format', 'json', 'First query'];
    await executor.execute(args, { cwd: '/tmp', env: {} });

    // Still only ONE query() call
    expect(queryCalls).toHaveLength(1);

    const args2 = ['--print', '--output-format', 'json', 'Second query'];
    await executor.execute(args2, { cwd: '/tmp', env: {} });

    // Still only ONE query() call
    expect(queryCalls).toHaveLength(1);

    executor.close();
  });

  it('multiple stream() calls reuse the same query', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    // First stream
    const args = ['--print', '--output-format', 'stream-json', '--verbose', 'Stream query 1'];
    const events1: StreamEvent[] = [];
    for await (const event of executor.stream(args, { cwd: '/tmp', env: {} })) {
      events1.push(event);
    }

    // Second stream
    const args2 = ['--print', '--output-format', 'stream-json', '--verbose', 'Stream query 2'];
    const events2: StreamEvent[] = [];
    for await (const event of executor.stream(args2, { cwd: '/tmp', env: {} })) {
      events2.push(event);
    }

    // Still only ONE query() call — both used the same persistent session
    expect(queryCalls).toHaveLength(1);

    // Both streams produced result events (the mock generates them)
    const hasResult1 = events1.some(e => e.type === 'result');
    const hasResult2 = events2.some(e => e.type === 'result');
    expect(hasResult1).toBe(true);
    expect(hasResult2).toBe(true);

    executor.close();
  });

  it('auto-initializes on first execute() if init() was not called', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });

    expect(executor.ready).toBe(false);

    const args = ['--print', '--output-format', 'json', 'Auto-init query'];
    await executor.execute(args, { cwd: '/tmp', env: {} });

    // init() was called implicitly
    expect(executor.ready).toBe(true);
    expect(queryCalls).toHaveLength(1);

    executor.close();
  });

  it('close() resets state — next call re-initializes', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    expect(queryCalls).toHaveLength(1);

    executor.close();
    expect(executor.ready).toBe(false);

    await executor.init();
    // New query() call after close
    expect(queryCalls).toHaveLength(2);

    executor.close();
  });
});

describe('SdkExecutor V1 — control methods', () => {
  let executor: SdkExecutor;

  beforeEach(async () => {
    resetMocks();
    executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();
  });

  it('setModel() delegates to Query.setModel()', async () => {
    await executor.setModel('opus');

    expect(controlCalls['setModel']).toEqual([['opus']]);
  });

  it('setPermissionMode() delegates to Query', async () => {
    await executor.setPermissionMode('plan');

    expect(controlCalls['setPermissionMode']).toEqual([['plan']]);
  });

  it('rewindFiles() returns result from Query', async () => {
    const result = await executor.rewindFiles('msg-123', { dryRun: true });

    expect(result.canRewind).toBe(true);
    expect(result.filesChanged).toEqual(['file.ts']);
    expect(controlCalls['rewindFiles']).toEqual([['msg-123', { dryRun: true }]]);
  });

  it('stopTask() delegates to Query', async () => {
    await executor.stopTask('task-42');

    expect(controlCalls['stopTask']).toEqual([['task-42']]);
  });

  it('setMcpServers() delegates and returns result', async () => {
    const result = await executor.setMcpServers({
      'my-server': { type: 'stdio', command: 'node', args: ['server.js'] },
    });

    expect(result.added).toEqual(['srv1']);
    expect(controlCalls['setMcpServers']).toHaveLength(1);
  });

  it('reconnectMcpServer() delegates to Query', async () => {
    await executor.reconnectMcpServer('github');

    expect(controlCalls['reconnectMcpServer']).toEqual([['github']]);
  });

  it('toggleMcpServer() delegates to Query', async () => {
    await executor.toggleMcpServer('github', false);

    expect(controlCalls['toggleMcpServer']).toEqual([['github', false]]);
  });

  it('accountInfo() returns account data', async () => {
    const info = await executor.accountInfo();

    expect(info.email).toBe('test@example.com');
    expect(info.subscriptionType).toBe('max');
  });

  it('supportedModels() returns model list', async () => {
    const models = await executor.supportedModels();

    expect(models).toHaveLength(1);
    expect(models[0]!.value).toBe('sonnet');
  });

  it('supportedCommands() returns command list', async () => {
    const commands = await executor.supportedCommands();

    expect(commands).toHaveLength(1);
  });

  it('supportedAgents() returns agent list', async () => {
    const agents = await executor.supportedAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]!.name).toBe('Explore');
  });

  it('mcpServerStatus() returns server statuses', async () => {
    const statuses = await executor.mcpServerStatus();

    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.status).toBe('connected');
  });

  it('interrupt() delegates to Query', async () => {
    await executor.interrupt();

    expect(controlCalls['interrupt']).toHaveLength(1);
  });

  it('control methods throw before init', async () => {
    const freshExecutor = new SdkExecutor({ model: 'sonnet' });

    await expect(freshExecutor.setModel('opus')).rejects.toThrow('No active SDK query');
    await expect(freshExecutor.accountInfo()).rejects.toThrow('No active SDK query');

    freshExecutor.close();
  });

  afterEach(() => {
    executor.close();
  });
});

describe('SdkExecutor V1 — options passthrough', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('passes canUseTool to query options', async () => {
    const canUseTool = vi.fn().mockResolvedValue({ behavior: 'allow' });
    const executor = new SdkExecutor({ model: 'sonnet', canUseTool });
    await executor.init();

    expect(queryCalls).toHaveLength(1);
    expect((queryCalls[0]!.options as Record<string, unknown>).canUseTool).toBe(canUseTool);

    executor.close();
  });

  it('passes thinking config to query options', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      thinking: { type: 'enabled', budgetTokens: 5000 },
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.thinking).toEqual({ type: 'enabled', budgetTokens: 5000 });

    executor.close();
  });

  it('passes enableFileCheckpointing to query options', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      enableFileCheckpointing: true,
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.enableFileCheckpointing).toBe(true);

    executor.close();
  });

  it('passes hookCallbacks to query options as hooks', async () => {
    const hookFn = vi.fn().mockResolvedValue({ continue: true });
    const executor = new SdkExecutor({
      model: 'sonnet',
      hookCallbacks: {
        PreToolUse: [{ hooks: [hookFn] }],
      },
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    const hooks = opts.hooks as Record<string, unknown[]>;
    expect(hooks).toBeDefined();
    expect(hooks['PreToolUse']).toHaveLength(1);

    executor.close();
  });

  it('passes onElicitation to query options', async () => {
    const onElicitation = vi.fn().mockResolvedValue({ action: 'accept' });
    const executor = new SdkExecutor({ model: 'sonnet', onElicitation });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.onElicitation).toBe(onElicitation);

    executor.close();
  });

  it('passes betas to query options', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      betas: ['context-1m-2025-08-07'],
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.betas).toEqual(['context-1m-2025-08-07']);

    executor.close();
  });

  it('passes mcpServers including SDK type', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      mcpServers: {
        'my-sdk': { type: 'sdk', name: 'my-sdk', instance: {} },
        'my-stdio': { type: 'stdio', command: 'node', args: ['srv.js'] },
      },
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.mcpServers).toBeDefined();

    executor.close();
  });

  it('passes effort level', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      effortLevel: 'max',
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.effort).toBe('max');

    executor.close();
  });

  it('passes agentProgressSummaries', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      agentProgressSummaries: true,
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.agentProgressSummaries).toBe(true);

    executor.close();
  });

  it('passes debug options', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      debug: true,
      debugFile: '/tmp/debug.log',
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.debug).toBe(true);
    expect(opts.debugFile).toBe('/tmp/debug.log');

    executor.close();
  });

  it('passes stderr callback', async () => {
    const stderrFn = vi.fn();
    const executor = new SdkExecutor({
      model: 'sonnet',
      stderr: stderrFn,
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.stderr).toBe(stderrFn);

    executor.close();
  });

  it('passes allowDangerouslySkipPermissions', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.allowDangerouslySkipPermissions).toBe(true);

    executor.close();
  });

  it('passes settingSources', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      settingSources: ['user', 'project'],
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.settingSources).toEqual(['user', 'project']);

    executor.close();
  });

  it('passes inline settings object', async () => {
    const settings = { permissions: { allow: ['Bash(*)'] } };
    const executor = new SdkExecutor({
      model: 'sonnet',
      settings,
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.settings).toEqual(settings);

    executor.close();
  });

  it('passes settings as file path', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      settings: '/path/to/settings.json',
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.settings).toBe('/path/to/settings.json');

    executor.close();
  });

  it('passes plugins', async () => {
    const executor = new SdkExecutor({
      model: 'sonnet',
      plugins: [{ type: 'local', path: './my-plugin' }],
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.plugins).toEqual([{ type: 'local', path: './my-plugin' }]);

    executor.close();
  });

  it('passes spawnClaudeCodeProcess', async () => {
    const spawnFn = vi.fn();
    const executor = new SdkExecutor({
      model: 'sonnet',
      spawnClaudeCodeProcess: spawnFn,
    });
    await executor.init();

    const opts = queryCalls[0]!.options as Record<string, unknown>;
    expect(opts.spawnClaudeCodeProcess).toBe(spawnFn);

    executor.close();
  });
});

describe('SdkExecutor — structured output and error handling', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('extracts structured_output from result into result.structured', async () => {
    const structured = { endpoints: ['/api/users', '/api/posts'] };
    customResponses = [
      {
        type: 'result',
        subtype: 'success',
        result: '{"endpoints":["/api/users","/api/posts"]}',
        session_id: 'mock-session',
        usage: { input_tokens: 10, output_tokens: 20 },
        total_cost_usd: 0.01,
        duration_ms: 50,
        structured_output: structured,
      },
    ];

    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    const result = await executor.execute(
      ['--print', '--output-format', 'json', 'Extract endpoints'],
      { cwd: '/tmp', env: {} },
    );

    expect(result.structured).toEqual(structured);
    executor.close();
  });

  it('result.structured is null when no schema was used', async () => {
    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    const result = await executor.execute(
      ['--print', '--output-format', 'json', 'Hello'],
      { cwd: '/tmp', env: {} },
    );

    expect(result.structured).toBeNull();
    executor.close();
  });

  it('stream result event includes structured output', async () => {
    const structured = { name: 'Test' };
    customResponses = [
      {
        type: 'result',
        subtype: 'success',
        result: '{"name":"Test"}',
        session_id: 'mock-session',
        usage: { input_tokens: 10, output_tokens: 20 },
        total_cost_usd: 0.01,
        duration_ms: 50,
        structured_output: structured,
      },
    ];

    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    const events: StreamEvent[] = [];
    for await (const event of executor.stream(
      ['--print', '--output-format', 'stream-json', '--verbose', 'Extract'],
      { cwd: '/tmp', env: {} },
    )) {
      events.push(event);
    }

    const resultEvent = events.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();
    expect((resultEvent as any).structured).toEqual(structured);
    executor.close();
  });

  it('result event includes isError, stopReason, numTurns', async () => {
    customResponses = [
      {
        type: 'result',
        subtype: 'error_max_turns',
        result: 'Exceeded max turns',
        session_id: 'mock-session',
        usage: { input_tokens: 100, output_tokens: 200 },
        total_cost_usd: 0.05,
        duration_ms: 5000,
        is_error: true,
        stop_reason: 'max_turns',
        num_turns: 10,
      },
    ];

    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    const events: StreamEvent[] = [];
    for await (const event of executor.stream(
      ['--print', '--output-format', 'stream-json', '--verbose', 'Do many things'],
      { cwd: '/tmp', env: {} },
    )) {
      events.push(event);
    }

    const resultEvent = events.find((e) => e.type === 'result') as any;
    expect(resultEvent.subtype).toBe('error');
    expect(resultEvent.isError).toBe(true);
    expect(resultEvent.stopReason).toBe('max_turns');
    expect(resultEvent.numTurns).toBe(10);
    executor.close();
  });

  it('maps rate_limit_event to rate_limit stream event', async () => {
    customResponses = [
      {
        type: 'rate_limit_event',
        rate_limit_info: {
          status: 'allowed_warning',
          resetsAt: 1700000000000,
          rateLimitType: 'five_hour',
          utilization: 0.85,
        },
        uuid: 'rl-1',
        session_id: 'mock-session',
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'Done',
        session_id: 'mock-session',
        usage: { input_tokens: 10, output_tokens: 20 },
        total_cost_usd: 0.01,
        duration_ms: 50,
      },
    ];

    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    const events: StreamEvent[] = [];
    for await (const event of executor.stream(
      ['--print', '--output-format', 'stream-json', '--verbose', 'Hello'],
      { cwd: '/tmp', env: {} },
    )) {
      events.push(event);
    }

    const rlEvent = events.find((e) => e.type === 'rate_limit') as any;
    expect(rlEvent).toBeDefined();
    expect(rlEvent.status).toBe('allowed_warning');
    expect(rlEvent.utilization).toBe(0.85);
    expect(rlEvent.resetsAt).toBe(1700000000000);
    executor.close();
  });

  it('forwards unknown SDK message types as system events', async () => {
    customResponses = [
      {
        type: 'tool_progress',
        tool_use_id: 'tu-1',
        tool_name: 'Bash',
        elapsed_time_seconds: 5,
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'Done',
        session_id: 'mock-session',
        usage: { input_tokens: 10, output_tokens: 20 },
        total_cost_usd: 0.01,
        duration_ms: 50,
      },
    ];

    const executor = new SdkExecutor({ model: 'sonnet' });
    await executor.init();

    const events: StreamEvent[] = [];
    for await (const event of executor.stream(
      ['--print', '--output-format', 'stream-json', '--verbose', 'Hello'],
      { cwd: '/tmp', env: {} },
    )) {
      events.push(event);
    }

    const sysEvent = events.find((e) => e.type === 'system' && (e as any).subtype === 'tool_progress') as any;
    expect(sysEvent).toBeDefined();
    expect(sysEvent.data.tool_name).toBe('Bash');
    executor.close();
  });

  it('init can be retried after failure', async () => {
    let callCount = 0;

    // Temporarily override the mock to fail on first call
    const originalQuery = vi.mocked(await import('@anthropic-ai/claude-agent-sdk')).query;
    const mockQuery = vi.fn().mockImplementation((params: { prompt: unknown; options: unknown }) => {
      callCount++;
      if (callCount === 1) {
        // Return a generator that immediately throws
        const gen: any = {
          next: () => Promise.reject(new Error('SDK init failed')),
          return: () => Promise.resolve({ value: undefined, done: true }),
          throw: (err: Error) => Promise.reject(err),
          [Symbol.asyncIterator]() { return this; },
          close() {},
        };
        queryCalls.push(params);
        return gen;
      }
      // Second call succeeds normally
      queryCalls.push(params);
      return createMockQuery(params.prompt);
    });

    vi.mocked(await import('@anthropic-ai/claude-agent-sdk')).query = mockQuery as any;

    const executor = new SdkExecutor({ model: 'sonnet' });

    // First init should fail
    await expect(executor.init()).rejects.toThrow('SDK init failed');
    expect(executor.ready).toBe(false);

    // Second init should succeed (initPromise was reset)
    await executor.init();
    expect(executor.ready).toBe(true);

    // Restore original mock
    vi.mocked(await import('@anthropic-ai/claude-agent-sdk')).query = originalQuery;
    executor.close();
  });
});
