import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('SDK control methods in CLI mode', () => {
  it('setModel() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.setModel('opus')).rejects.toThrow('only available in SDK mode');
  });

  it('setPermissionMode() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.setPermissionMode('plan')).rejects.toThrow('only available in SDK mode');
  });

  it('rewindFiles() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.rewindFiles('msg-id')).rejects.toThrow('only available in SDK mode');
  });

  it('stopTask() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.stopTask('task-1')).rejects.toThrow('only available in SDK mode');
  });

  it('setMcpServers() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.setMcpServers({})).rejects.toThrow('only available in SDK mode');
  });

  it('reconnectMcpServer() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.reconnectMcpServer('srv')).rejects.toThrow('only available in SDK mode');
  });

  it('toggleMcpServer() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.toggleMcpServer('srv', true)).rejects.toThrow('only available in SDK mode');
  });

  it('accountInfo() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.accountInfo()).rejects.toThrow('only available in SDK mode');
  });

  it('supportedModels() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.supportedModels()).rejects.toThrow('only available in SDK mode');
  });

  it('supportedCommands() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.supportedCommands()).rejects.toThrow('only available in SDK mode');
  });

  it('supportedAgents() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.supportedAgents()).rejects.toThrow('only available in SDK mode');
  });

  it('mcpServerStatus() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.mcpServerStatus()).rejects.toThrow('only available in SDK mode');
  });

  it('interrupt() throws in CLI mode', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({ useSdk: false }, executor);

    await expect(claude.interrupt()).rejects.toThrow('only available in SDK mode');
  });
});

describe('signal (per-query abort) passes through to executor', () => {
  it('passes signal in execute options', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({}, executor);
    const controller = new AbortController();

    await claude.query('Test', { signal: controller.signal });

    const [, options] = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0] as [string[], ExecuteOptions];
    expect(options.signal).toBe(controller.signal);
  });

  it('passes signal in stream options', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({}, executor);
    const controller = new AbortController();

    for await (const _ of claude.stream('Test', { signal: controller.signal })) { /* consume */ }

    const [, options] = (executor.stream as ReturnType<typeof vi.fn>).mock.calls[0] as [string[], ExecuteOptions];
    expect(options.signal).toBe(controller.signal);
  });
});

describe('new ClientOptions pass through to SdkExecutorOptions', () => {
  // These tests verify options are accepted without error.
  // Actual SDK behavior requires a real SDK session (integration tests).

  it('accepts canUseTool callback', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      canUseTool: async () => ({ behavior: 'allow' as const }),
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts thinking config', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      thinking: { type: 'adaptive' },
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts enableFileCheckpointing', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      enableFileCheckpointing: true,
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts hookCallbacks with a representative set of hook event types', () => {
    const executor = createMockExecutor();
    const noop = async () => ({ continue: true as const });
    const claude = new Claude({
      hookCallbacks: {
        PreToolUse: [{ hooks: [noop] }],
        PostToolUse: [{ hooks: [noop] }],
        PostToolUseFailure: [{ hooks: [noop] }],
        Notification: [{ hooks: [noop] }],
        UserPromptSubmit: [{ hooks: [noop] }],
        SessionStart: [{ hooks: [noop] }],
        SessionEnd: [{ hooks: [noop] }],
        Stop: [{ hooks: [noop] }],
        SubagentStart: [{ hooks: [noop] }],
        SubagentStop: [{ hooks: [noop] }],
        PreCompact: [{ hooks: [noop] }],
        PermissionRequest: [{ hooks: [noop] }],
        Setup: [{ hooks: [noop] }],
        TeammateIdle: [{ hooks: [noop] }],
        TaskCompleted: [{ hooks: [noop] }],
        Elicitation: [{ hooks: [noop] }],
        ElicitationResult: [{ hooks: [noop] }],
        ConfigChange: [{ hooks: [noop] }],
        WorktreeCreate: [{ hooks: [noop] }],
        WorktreeRemove: [{ hooks: [noop] }],
        InstructionsLoaded: [{ hooks: [noop] }],
      },
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts onElicitation callback', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      onElicitation: async () => ({ action: 'accept' as const }),
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts betas option', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      betas: ['context-1m-2025-08-07'],
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts McpSdkServerConfig in mcpServers', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      mcpServers: {
        'my-sdk-server': {
          type: 'sdk',
          name: 'my-sdk-server',
          instance: {}, // opaque McpServer
        },
      },
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts promptSuggestions and agentProgressSummaries', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      promptSuggestions: true,
      agentProgressSummaries: true,
      includePartialMessages: true,
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts debug and debugFile', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      debug: true,
      debugFile: '/tmp/debug.log',
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts per-query thinking override', async () => {
    const executor = createMockExecutor();
    const claude = new Claude({}, executor);

    await claude.query('Test', { thinking: { type: 'disabled' } });
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it('accepts stderr callback', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      stderr: (data) => console.error(data),
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts allowDangerouslySkipPermissions', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts settingSources', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      settingSources: ['user', 'project'],
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts inline settings object', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      settings: { permissions: { allow: ['Bash(*)'] } },
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts settings as path', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      settings: '/etc/claude/settings.json',
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts plugins', () => {
    const executor = createMockExecutor();
    const claude = new Claude({
      plugins: [{ type: 'local', path: './my-plugin' }],
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });

  it('accepts spawnClaudeCodeProcess', () => {
    const executor = createMockExecutor();
    // `SpawnedProcess` now mirrors the SDK's own interface: a synchronous
    // `exitCode`, a `killed` flag, a boolean-returning `kill()`, and the
    // on/once/off listeners the SDK uses to observe exit.
    const claude = new Claude({
      spawnClaudeCodeProcess: () => ({
        stdout: process.stdin,
        stderr: process.stdin,
        stdin: process.stdout,
        killed: false,
        exitCode: null,
        kill: () => true,
        on: () => {},
        once: () => {},
        off: () => {},
      }),
    }, executor);

    expect(claude).toBeInstanceOf(Claude);
  });
});
