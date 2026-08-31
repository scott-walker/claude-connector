import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SdkExecutor } from '../src/executor/sdk-executor.js';
import type { ExecuteOptions } from '../src/executor/interface.js';
import type { StreamEvent } from '../src/types/index.js';
import { sdkMock, resultMessage } from './helpers/sdk-mock.js';

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const { createSdkModuleMock } = await import('./helpers/sdk-mock.js');
  return createSdkModuleMock();
});

/**
 * Every SDK message shape the 0.3.x parity work taught `mapMessages()` about,
 * fed through a mocked session and checked against the typed `StreamEvent` it
 * must produce.
 *
 * The recurring assertion is that nothing lands on the generic
 * `{ type: 'system', subtype, data }` fallback — that fallback is the symptom
 * of an unmapped message, so every case asserts a concrete `type`.
 */

const EXEC_OPTIONS: ExecuteOptions = { cwd: '/repo', env: {}, prompt: 'hi' };

/** Run one scripted turn and return every event the executor yielded. */
async function collect(...messages: readonly unknown[]): Promise<StreamEvent[]> {
  sdkMock.responses = [...messages];

  const executor = new SdkExecutor({ model: 'sonnet' });
  await executor.init();

  const events: StreamEvent[] = [];
  try {
    for await (const event of executor.stream([], EXEC_OPTIONS)) {
      events.push(event);
    }
  } finally {
    executor.close();
  }
  return events;
}

/**
 * Map one message and return the single event it produced.
 * A trailing `result` terminates the turn and is dropped from the return value.
 */
async function mapOne(message: unknown): Promise<StreamEvent> {
  const events = await collect(message, resultMessage());
  expect(events).toHaveLength(2);
  expect(events[1]!.type).toBe('result');

  const mapped = events[0]!;
  expect(mapped.type).not.toBe('system');
  return mapped;
}

/** A `type: 'system'` frame with the given subtype. */
function system(subtype: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'system', subtype, uuid: 'u-1', session_id: 'sess-1', ...fields };
}

beforeEach(() => {
  sdkMock.reset();
});

describe('system frames → typed stream events', () => {
  it('maps api_retry', async () => {
    const event = await mapOne(system('api_retry', {
      attempt: 2,
      max_retries: 5,
      retry_delay_ms: 1_500,
      error_status: 529,
      error: 'overloaded',
    }));

    expect(event).toEqual({
      type: 'api_retry',
      attempt: 2,
      maxRetries: 5,
      retryDelayMs: 1_500,
      errorStatus: 529,
      error: 'overloaded',
    });
  });

  it('maps api_retry with a null error_status', async () => {
    const event = await mapOne(system('api_retry', {
      attempt: 1,
      max_retries: 3,
      retry_delay_ms: 100,
      error_status: null,
      error: 'server_error',
    }));

    expect(event).toMatchObject({ type: 'api_retry', errorStatus: null });
  });

  it('maps model_refusal_fallback', async () => {
    const event = await mapOne(system('model_refusal_fallback', {
      trigger: 'refusal',
      direction: 'retry',
      scope: 'session',
      original_model: 'opus',
      fallback_model: 'sonnet',
      request_id: 'req-9',
      api_refusal_category: 'safety',
      api_refusal_explanation: 'declined',
      retracted_message_uuids: ['m-1', 'm-2'],
      refused_user_message_uuid: 'u-7',
      content: 'switching models',
    }));

    expect(event).toEqual({
      type: 'model_refusal_fallback',
      direction: 'retry',
      scope: 'session',
      originalModel: 'opus',
      fallbackModel: 'sonnet',
      requestId: 'req-9',
      refusalCategory: 'safety',
      refusalExplanation: 'declined',
      retractedMessageUuids: ['m-1', 'm-2'],
      refusedUserMessageUuid: 'u-7',
      content: 'switching models',
    });
  });

  it('defaults model_refusal_fallback.direction and leaves absent optionals undefined', async () => {
    const event = await mapOne(system('model_refusal_fallback', {
      original_model: 'opus',
      fallback_model: 'sonnet',
      request_id: null,
      content: '',
    }));

    expect(event).toMatchObject({
      type: 'model_refusal_fallback',
      direction: 'retry',
      scope: undefined,
      requestId: null,
      refusalCategory: undefined,
      retractedMessageUuids: undefined,
    });
  });

  it('maps model_refusal_no_fallback', async () => {
    const event = await mapOne(system('model_refusal_no_fallback', {
      original_model: 'opus',
      request_id: 'req-4',
      api_refusal_category: null,
      api_refusal_explanation: null,
      refused_user_message_uuid: 'u-3',
      content: 'refused',
    }));

    expect(event).toEqual({
      type: 'model_refusal_no_fallback',
      originalModel: 'opus',
      requestId: 'req-4',
      refusalCategory: null,
      refusalExplanation: null,
      refusedUserMessageUuid: 'u-3',
      content: 'refused',
    });
  });

  it('maps permission_denied', async () => {
    const event = await mapOne(system('permission_denied', {
      tool_name: 'Bash',
      tool_use_id: 'tu-2',
      agent_id: 'agent-1',
      decision_reason_type: 'rule',
      decision_reason: 'denied by Bash(rm:*)',
      message: 'Permission denied',
    }));

    expect(event).toEqual({
      type: 'permission_denied',
      toolName: 'Bash',
      toolUseId: 'tu-2',
      agentId: 'agent-1',
      decisionReasonType: 'rule',
      decisionReason: 'denied by Bash(rm:*)',
      message: 'Permission denied',
    });
  });

  it('maps session_state_changed', async () => {
    const event = await mapOne(system('session_state_changed', { state: 'requires_action' }));

    expect(event).toEqual({ type: 'session_state_changed', state: 'requires_action' });
  });

  it('defaults session_state_changed.state to idle', async () => {
    const event = await mapOne(system('session_state_changed', {}));

    expect(event).toEqual({ type: 'session_state_changed', state: 'idle' });
  });

  it('maps task_updated with its patch', async () => {
    const event = await mapOne(system('task_updated', {
      task_id: 't-1',
      patch: {
        status: 'paused',
        description: 'audit deps',
        end_time: 1_700_000,
        total_paused_ms: 250,
        error: 'nope',
        is_backgrounded: true,
      },
    }));

    expect(event).toEqual({
      type: 'task_updated',
      taskId: 't-1',
      patch: {
        status: 'paused',
        description: 'audit deps',
        endTime: 1_700_000,
        totalPausedMs: 250,
        error: 'nope',
        isBackgrounded: true,
      },
    });
  });

  it('maps task_updated with an absent patch to an empty patch', async () => {
    const event = await mapOne(system('task_updated', { task_id: 't-2' }));

    expect(event).toMatchObject({ type: 'task_updated', taskId: 't-2' });
    expect((event as { patch: Record<string, unknown> }).patch).toEqual({
      status: undefined,
      description: undefined,
      endTime: undefined,
      totalPausedMs: undefined,
      error: undefined,
      isBackgrounded: undefined,
    });
  });

  it('maps background_tasks_changed', async () => {
    const event = await mapOne(system('background_tasks_changed', {
      tasks: [
        { task_id: 't-1', task_type: 'shell', description: 'npm test', ambient: false },
        { task_id: 't-2', task_type: 'subagent', description: 'explore' },
      ],
    }));

    expect(event).toEqual({
      type: 'background_tasks_changed',
      tasks: [
        { taskId: 't-1', taskType: 'shell', description: 'npm test', ambient: false },
        { taskId: 't-2', taskType: 'subagent', description: 'explore', ambient: undefined },
      ],
    });
  });

  it('maps background_tasks_changed with an empty set (the clear signal)', async () => {
    const event = await mapOne(system('background_tasks_changed', { tasks: [] }));

    expect(event).toEqual({ type: 'background_tasks_changed', tasks: [] });
  });

  it('maps informational', async () => {
    const event = await mapOne(system('informational', {
      content: 'Stop hook denied continuation',
      level: 'warning',
      tool_use_id: 'tu-5',
      prevent_continuation: true,
    }));

    expect(event).toEqual({
      type: 'informational',
      content: 'Stop hook denied continuation',
      level: 'warning',
      toolUseId: 'tu-5',
      preventContinuation: true,
    });
  });

  it('defaults informational.level to info', async () => {
    const event = await mapOne(system('informational', { content: 'fyi' }));

    expect(event).toMatchObject({ type: 'informational', level: 'info', preventContinuation: undefined });
  });

  it('maps thinking_tokens', async () => {
    const event = await mapOne(system('thinking_tokens', {
      estimated_tokens: 1_234,
      estimated_tokens_delta: 56,
    }));

    expect(event).toEqual({
      type: 'thinking_tokens',
      estimatedTokens: 1_234,
      estimatedTokensDelta: 56,
    });
  });

  it('maps notification', async () => {
    const event = await mapOne(system('notification', {
      key: 'idle',
      text: 'Waiting for input',
      priority: 'immediate',
      color: 'yellow',
      timeout_ms: 3_000,
    }));

    expect(event).toEqual({
      type: 'notification',
      key: 'idle',
      text: 'Waiting for input',
      priority: 'immediate',
      color: 'yellow',
      timeoutMs: 3_000,
    });
  });

  it('defaults notification.priority to low', async () => {
    const event = await mapOne(system('notification', { key: 'k', text: 't' }));

    expect(event).toMatchObject({ type: 'notification', priority: 'low' });
  });

  it('maps memory_recall', async () => {
    const event = await mapOne(system('memory_recall', {
      mode: 'synthesize',
      memories: [
        { path: '/mem/a.md', scope: 'team', content: 'remember this' },
        { path: '/mem/b.md' },
      ],
    }));

    expect(event).toEqual({
      type: 'memory_recall',
      mode: 'synthesize',
      memories: [
        { path: '/mem/a.md', scope: 'team', content: 'remember this' },
        { path: '/mem/b.md', scope: 'personal', content: undefined },
      ],
    });
  });

  it('maps commands_changed', async () => {
    const commands = [{ name: 'deploy', description: 'ship it' }];
    const event = await mapOne(system('commands_changed', { commands }));

    expect(event).toEqual({ type: 'commands_changed', commands });
  });

  it('maps plugin_install', async () => {
    const event = await mapOne(system('plugin_install', {
      status: 'failed',
      name: 'ops',
      error: 'registry unreachable',
    }));

    expect(event).toEqual({
      type: 'plugin_install',
      status: 'failed',
      name: 'ops',
      error: 'registry unreachable',
    });
  });

  it('defaults plugin_install.status to started', async () => {
    const event = await mapOne(system('plugin_install', { name: 'ops' }));

    expect(event).toMatchObject({ type: 'plugin_install', status: 'started', error: undefined });
  });

  it('maps worker_shutting_down', async () => {
    const event = await mapOne(system('worker_shutting_down', { reason: 'redeploy' }));

    expect(event).toEqual({ type: 'worker_shutting_down', reason: 'redeploy' });
  });

  it('maps elicitation_complete', async () => {
    const event = await mapOne(system('elicitation_complete', {
      mcp_server_name: 'linear',
      elicitation_id: 'el-1',
    }));

    expect(event).toEqual({
      type: 'elicitation_complete',
      mcpServerName: 'linear',
      elicitationId: 'el-1',
    });
  });

  it('maps control_request_progress', async () => {
    const event = await mapOne(system('control_request_progress', {
      request_id: 'req-1',
      status: 'api_retry',
      attempt: 3,
      max_retries: 5,
      retry_delay_ms: 750,
      error_status: 500,
    }));

    expect(event).toEqual({
      type: 'control_request_progress',
      requestId: 'req-1',
      status: 'api_retry',
      attempt: 3,
      maxRetries: 5,
      retryDelayMs: 750,
      errorStatus: 500,
    });
  });

  it('omits control_request_progress.errorStatus when the key is absent', async () => {
    const event = await mapOne(system('control_request_progress', {
      request_id: 'req-2',
      status: 'started',
    }));

    expect(event).toMatchObject({
      type: 'control_request_progress',
      status: 'started',
      errorStatus: undefined,
    });
  });

  it('maps mirror_error with its session key', async () => {
    const event = await mapOne(system('mirror_error', {
      error: 'store unavailable',
      key: { projectKey: 'proj', sessionId: 'sess-1', subpath: 'agents/a' },
    }));

    expect(event).toEqual({
      type: 'mirror_error',
      error: 'store unavailable',
      key: { projectKey: 'proj', sessionId: 'sess-1', subpath: 'agents/a' },
    });
  });

  it('maps status', async () => {
    const event = await mapOne(system('status', {
      status: 'compacting',
      permissionMode: 'plan',
      compact_result: 'failed',
      compact_error: 'too large',
    }));

    expect(event).toEqual({
      type: 'status',
      status: 'compacting',
      permissionMode: 'plan',
      compactResult: 'failed',
      compactError: 'too large',
    });
  });

  it('maps status with a null status (activity finished)', async () => {
    const event = await mapOne(system('status', {}));

    expect(event).toMatchObject({ type: 'status', status: null });
  });

  it('maps init with the full session handshake', async () => {
    const event = await mapOne(system('init', {
      model: 'claude-sonnet',
      cwd: '/repo',
      tools: ['Read', 'Bash'],
      skills: ['pdf'],
      slash_commands: ['help'],
      terminal_slash_commands: ['clear'],
      mcp_servers: [{ name: 'github', status: 'connected' }],
      plugins: [{ name: 'ops', path: '/plugins/ops', version: '1.0.0' }],
      agents: ['Explore'],
      permissionMode: 'plan',
      apiKeySource: 'ANTHROPIC_API_KEY',
      claude_code_version: '2.1.234',
      output_style: 'concise',
      betas: ['context-1m-2025-08-07'],
      effort: 'high',
      capabilities: ['sandbox'],
      fast_mode_state: 'active',
      fast_mode_disabled_reason: undefined,
    }));

    expect(event).toEqual({
      type: 'init',
      model: 'claude-sonnet',
      cwd: '/repo',
      tools: ['Read', 'Bash'],
      skills: ['pdf'],
      slashCommands: ['help'],
      terminalSlashCommands: ['clear'],
      mcpServers: [{ name: 'github', status: 'connected' }],
      plugins: [{ name: 'ops', path: '/plugins/ops', version: '1.0.0' }],
      agents: ['Explore'],
      permissionMode: 'plan',
      apiKeySource: 'ANTHROPIC_API_KEY',
      claudeCodeVersion: '2.1.234',
      outputStyle: 'concise',
      betas: ['context-1m-2025-08-07'],
      effort: 'high',
      capabilities: ['sandbox'],
      fastModeState: 'active',
      fastModeDisabledReason: undefined,
    });
  });

  it('leaves init fields the CLI omitted undefined rather than empty', async () => {
    const event = await mapOne(system('init', { model: 'sonnet', cwd: '/repo' })) as unknown as Record<string, unknown>;

    expect(event['terminalSlashCommands']).toBeUndefined();
    expect(event['agents']).toBeUndefined();
    expect(event['betas']).toBeUndefined();
    expect(event['capabilities']).toBeUndefined();
    // Defaults that ARE applied.
    expect(event['permissionMode']).toBe('default');
    expect(event['effort']).toBeNull();
    expect(event['tools']).toEqual([]);
  });
});

describe('top-level message types → typed stream events', () => {
  it('maps stream_event to partial_message', async () => {
    const event = await mapOne({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
      parent_tool_use_id: 'tu-9',
      ttft_ms: 320,
      user_message_uuid: 'um-1',
      session_id: 'sess-1',
      uuid: 'u-2',
    });

    expect(event).toEqual({
      type: 'partial_message',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
      parentToolUseId: 'tu-9',
      ttftMs: 320,
      userMessageUuid: 'um-1',
    });
  });

  it('maps conversation_reset', async () => {
    const event = await mapOne({
      type: 'conversation_reset',
      new_conversation_id: 'conv-2',
      session_id: 'sess-1',
    });

    expect(event).toEqual({ type: 'conversation_reset', newConversationId: 'conv-2' });
  });

  it('maps prompt_suggestion', async () => {
    const event = await mapOne({
      type: 'prompt_suggestion',
      suggestion: 'Run the tests next',
      session_id: 'sess-1',
    });

    expect(event).toEqual({ type: 'prompt_suggestion', suggestion: 'Run the tests next' });
  });

  it('maps rate_limit_event through its nested rate_limit_info', async () => {
    const info = {
      status: 'allowed_warning',
      resetsAt: 1_760_000_000,
      rateLimitType: 'five_hour',
      utilization: 88,
      overageStatus: 'allowed',
      overageResetsAt: 1_770_000_000,
      overageDisabledReason: 'org policy',
      isUsingOverage: true,
      overageInUse: false,
    };
    const event = await mapOne({ type: 'rate_limit_event', rate_limit_info: info });

    expect(event).toEqual({
      type: 'rate_limit',
      status: 'allowed_warning',
      resetsAt: 1_760_000_000,
      rateLimitType: 'five_hour',
      utilization: 88,
      overageStatus: 'allowed',
      overageResetsAt: 1_770_000_000,
      overageDisabledReason: 'org policy',
      isUsingOverage: true,
      overageInUse: false,
      data: info,
    });
  });
});

describe('assistant message content blocks', () => {
  it('lifts thinking blocks out of the assistant message', async () => {
    const events = await collect(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'let me check', signature: 'sig-1' },
            { type: 'redacted_thinking', data: 'ENCRYPTED' },
            { type: 'text', text: 'done' },
          ],
        },
      },
      resultMessage(),
    );

    expect(events.slice(0, 3)).toEqual([
      { type: 'thinking', thinking: 'let me check', signature: 'sig-1' },
      { type: 'thinking', thinking: 'ENCRYPTED', redacted: true },
      { type: 'text', text: 'done' },
    ]);
  });

  it('maps the context_usage report carried on an assistant message', async () => {
    const events = await collect(
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'ok' }] },
        context_usage: {
          model: 'sonnet',
          total_tokens: 42_000,
          raw_max_tokens: 200_000,
          percentage: 21,
          over_limit: { tokens_over: 10, kind: 'compaction_window' },
          categories: [{ name: 'System prompt', tokens: 1_200, kind: 'system' }],
          mcp_tools: [{ name: 'search', server_name: 'github', tokens: 300 }],
          memory_files: [{ path: '/CLAUDE.md', type: 'project', tokens: 500 }],
          agents: [{ agent_type: 'Explore', source: 'built-in', tokens: 120 }],
          skills: [{ name: 'pdf', source: 'plugin', plugin_name: 'ops', tokens: 90 }],
        },
      },
      resultMessage(),
    );

    expect(events[1]).toEqual({
      type: 'context_usage',
      contextUsage: {
        model: 'sonnet',
        totalTokens: 42_000,
        rawMaxTokens: 200_000,
        percentage: 21,
        overLimit: { tokensOver: 10, kind: 'compaction_window' },
        categories: [{ name: 'System prompt', tokens: 1_200, kind: 'system' }],
        mcpTools: [{ name: 'search', serverName: 'github', tokens: 300 }],
        memoryFiles: [{ path: '/CLAUDE.md', type: 'project', tokens: 500 }],
        agents: [{ agentType: 'Explore', source: 'built-in', tokens: 120 }],
        skills: [{ name: 'pdf', source: 'plugin', pluginName: 'ops', tokens: 90 }],
      },
    });
  });

  it('surfaces the wrapper-level assistant error as an error event', async () => {
    const events = await collect(
      {
        type: 'assistant',
        message: { content: [] },
        error: 'overloaded',
        aborted: true,
        request_id: 'req-7',
      },
      resultMessage(),
    );

    expect(events[0]).toEqual({
      type: 'error',
      message: 'overloaded',
      code: 'overloaded',
      aborted: true,
      requestId: 'req-7',
    });
  });
});

describe('user messages', () => {
  it('maps tool_result blocks with their message-level metadata', async () => {
    const event = await mapOne({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu-1',
            content: [{ type: 'text', text: 'file contents' }],
            is_error: false,
          },
        ],
      },
      tool_use_result: { filePath: '/a.ts' },
      parent_tool_use_id: 'parent-1',
      isReplay: true,
      isSynthetic: false,
      subagent_type: 'Explore',
      task_description: 'read the file',
      timestamp: '2026-08-31T10:00:00Z',
      origin: 'sdk',
    });

    expect(event).toEqual({
      type: 'tool_result',
      toolUseId: 'tu-1',
      content: [{ type: 'text', text: 'file contents' }],
      isError: false,
      toolUseResult: { filePath: '/a.ts' },
      parentToolUseId: 'parent-1',
      isReplay: true,
      isSynthetic: false,
      subagentType: 'Explore',
      taskDescription: 'read the file',
      timestamp: '2026-08-31T10:00:00Z',
      origin: 'sdk',
    });
  });

  it('keeps a plain-string tool_result payload as a string', async () => {
    const event = await mapOne({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu-2', content: 'ok' }] },
    });

    expect(event).toMatchObject({ type: 'tool_result', content: 'ok', parentToolUseId: null });
  });

  it('emits one event per tool_result block', async () => {
    const events = await collect(
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', content: 'a' },
            { type: 'tool_result', tool_use_id: 'tu-2', content: 'b' },
          ],
        },
      },
      resultMessage(),
    );

    expect(events.slice(0, 2).map((event) => (event as { toolUseId: string }).toolUseId))
      .toEqual(['tu-1', 'tu-2']);
  });

  it('falls back to a system event for a user message with no tool results', async () => {
    const events = await collect(
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'replayed' }] } },
      resultMessage(),
    );

    expect(events[0]).toMatchObject({ type: 'system', subtype: 'user' });
  });
});

describe('result messages', () => {
  it('maps the rich result payload to camelCase', async () => {
    const events = await collect(resultMessage({
      subtype: 'error_max_turns',
      result: 'stopped',
      is_error: true,
      errors: ['too many turns'],
      terminal_reason: 'max_turns',
      stop_reason: 'end_turn',
      num_turns: 12,
      structured_output: { ok: false },
      permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tu-1', tool_input: { command: 'rm' } }],
      deferred_tool_use: { id: 'd-1', name: 'Task', input: { prompt: 'x' } },
      duration_api_ms: 800,
      queued_turn_count: 2,
      ttft_ms: 120,
      api_error_status: 429,
      fast_mode_state: 'disabled',
      origin: 'sdk',
      modelUsage: {
        sonnet: {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadInputTokens: 1,
          cacheCreationInputTokens: 2,
          webSearchRequests: 0,
          costUSD: 0.02,
          contextWindow: 200_000,
          maxOutputTokens: 64_000,
          canonicalModel: 'claude-sonnet',
          provider: 'anthropic',
          costBasis: 'api',
        },
      },
    }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'result',
      subtype: 'error_max_turns',
      isError: true,
      errors: ['too many turns'],
      terminalReason: 'max_turns',
      stopReason: 'end_turn',
      numTurns: 12,
      structured: { ok: false },
      permissionDenials: [{ toolName: 'Bash', toolUseId: 'tu-1', toolInput: { command: 'rm' } }],
      deferredToolUse: { id: 'd-1', name: 'Task', input: { prompt: 'x' } },
      durationApiMs: 800,
      queuedTurnCount: 2,
      ttftMs: 120,
      apiErrorStatus: 429,
      fastModeState: 'disabled',
      origin: 'sdk',
      modelUsage: {
        sonnet: expect.objectContaining({ costUsd: 0.02, canonicalModel: 'claude-sonnet' }),
      },
    });
  });

  it('prepends an error event for a --resume-drops-turn refusal', async () => {
    const events = await collect(resultMessage({
      subtype: 'error_during_execution',
      is_error: true,
      errors: ['Resume rejected by --resume-drops-turn: uuid mismatch'],
    }));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'error',
      message: 'Resume rejected by --resume-drops-turn: uuid mismatch',
      code: 'error_during_execution',
    });
    expect(events[1]!.type).toBe('result');
  });

  it('maps the token usage block, cache fields and server tool use', async () => {
    const events = await collect(resultMessage({
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
        server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 },
        service_tier: 'standard',
      },
    }));

    expect(events[0]).toMatchObject({
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationInputTokens: 20,
        cacheReadInputTokens: 30,
        serverToolUse: { webSearchRequests: 2, webFetchRequests: 1 },
        serviceTier: 'standard',
      },
    });
  });
});

describe('unknown shapes still reach the caller', () => {
  it('forwards an unmodelled system subtype as a generic system event', async () => {
    const events = await collect(system('some_future_subtype', { payload: 7 }), resultMessage());

    expect(events[0]).toMatchObject({
      type: 'system',
      subtype: 'some_future_subtype',
      data: expect.objectContaining({ payload: 7 }),
    });
  });

  it('forwards an unmodelled top-level type as a generic system event', async () => {
    const events = await collect({ type: 'some_future_message', payload: 8 }, resultMessage());

    expect(events[0]).toMatchObject({ type: 'system', subtype: 'some_future_message' });
  });
});
