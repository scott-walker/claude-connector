import { describe, it, expect } from 'vitest';
import { StreamHandle } from '../src/client/stream-handle.js';
import type {
  StreamEvent,
  StreamRateLimitEvent,
  StreamTaskStartedEvent,
  StreamTaskProgressEvent,
  StreamTaskNotificationEvent,
} from '../src/types/index.js';

function createSource(events: StreamEvent[]): () => AsyncIterable<StreamEvent> {
  return async function* () {
    for (const event of events) yield event;
  };
}

const resultEvent: StreamEvent = {
  type: 'result',
  text: 'Done',
  sessionId: 'sess-1',
  usage: { inputTokens: 10, outputTokens: 20 },
  cost: null,
  durationMs: 100,
};

describe('StreamHandle — task events', () => {
  it('dispatches task_started events', async () => {
    const started: StreamTaskStartedEvent[] = [];
    const events: StreamEvent[] = [
      {
        type: 'task_started',
        taskId: 'task-1',
        toolUseId: 'tu-1',
        description: 'Exploring codebase',
        taskType: 'Explore',
        prompt: 'Find all API endpoints',
      },
      resultEvent,
    ];

    await new StreamHandle(createSource(events))
      .on('task_started', (e) => started.push(e))
      .done();

    expect(started).toHaveLength(1);
    expect(started[0]!.taskId).toBe('task-1');
    expect(started[0]!.description).toBe('Exploring codebase');
    expect(started[0]!.taskType).toBe('Explore');
    expect(started[0]!.prompt).toBe('Find all API endpoints');
  });

  it('dispatches task_progress events', async () => {
    const progress: StreamTaskProgressEvent[] = [];
    const events: StreamEvent[] = [
      {
        type: 'task_progress',
        taskId: 'task-1',
        description: 'Reading files',
        usage: { totalTokens: 500, toolUses: 3, durationMs: 2000 },
        lastToolName: 'Read',
        summary: 'Analyzing authentication module',
      },
      resultEvent,
    ];

    await new StreamHandle(createSource(events))
      .on('task_progress', (e) => progress.push(e))
      .done();

    expect(progress).toHaveLength(1);
    expect(progress[0]!.taskId).toBe('task-1');
    expect(progress[0]!.usage.totalTokens).toBe(500);
    expect(progress[0]!.lastToolName).toBe('Read');
    expect(progress[0]!.summary).toBe('Analyzing authentication module');
  });

  it('dispatches task_notification events', async () => {
    const notifications: StreamTaskNotificationEvent[] = [];
    const events: StreamEvent[] = [
      {
        type: 'task_notification',
        taskId: 'task-1',
        status: 'completed',
        outputFile: '/tmp/output.txt',
        summary: 'Found 5 API endpoints',
        usage: { totalTokens: 1000, toolUses: 8, durationMs: 5000 },
      },
      resultEvent,
    ];

    await new StreamHandle(createSource(events))
      .on('task_notification', (e) => notifications.push(e))
      .done();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.status).toBe('completed');
    expect(notifications[0]!.summary).toBe('Found 5 API endpoints');
    expect(notifications[0]!.usage!.toolUses).toBe(8);
  });

  it('handles full task lifecycle in a single stream', async () => {
    const started: string[] = [];
    const progress: string[] = [];
    const notifications: string[] = [];

    const events: StreamEvent[] = [
      { type: 'text', text: 'Starting analysis...' },
      {
        type: 'task_started',
        taskId: 'task-1',
        description: 'Subagent started',
      },
      {
        type: 'task_progress',
        taskId: 'task-1',
        description: 'Working...',
        usage: { totalTokens: 200, toolUses: 2, durationMs: 1000 },
      },
      {
        type: 'task_progress',
        taskId: 'task-1',
        description: 'Almost done...',
        usage: { totalTokens: 800, toolUses: 6, durationMs: 3000 },
      },
      {
        type: 'task_notification',
        taskId: 'task-1',
        status: 'completed',
        outputFile: '/tmp/out.txt',
        summary: 'Task complete',
      },
      { type: 'text', text: ' Done!' },
      resultEvent,
    ];

    const text = await new StreamHandle(createSource(events))
      .on('task_started', (e) => started.push(e.taskId))
      .on('task_progress', (e) => progress.push(e.description))
      .on('task_notification', (e) => notifications.push(e.status))
      .text();

    expect(text).toBe('Starting analysis... Done!');
    expect(started).toEqual(['task-1']);
    expect(progress).toEqual(['Working...', 'Almost done...']);
    expect(notifications).toEqual(['completed']);
  });

  it('task events do not break backward-compatible async iteration', async () => {
    const events: StreamEvent[] = [
      { type: 'task_started', taskId: 't1', description: 'Start' },
      { type: 'text', text: 'Hello' },
      { type: 'task_notification', taskId: 't1', status: 'completed', outputFile: '', summary: '' },
      resultEvent,
    ];

    const collected: StreamEvent[] = [];
    for await (const event of new StreamHandle(createSource(events))) {
      collected.push(event);
    }

    expect(collected).toHaveLength(4);
    expect(collected[0]!.type).toBe('task_started');
    expect(collected[1]!.type).toBe('text');
    expect(collected[2]!.type).toBe('task_notification');
    expect(collected[3]!.type).toBe('result');
  });

  it('on() chaining works with new task event types', () => {
    const handle = new StreamHandle(createSource([]));

    const result = handle
      .on('text', () => {})
      .on('tool_use', () => {})
      .on('result', () => {})
      .on('error', () => {})
      .on('system', () => {})
      .on('task_started', () => {})
      .on('task_progress', () => {})
      .on('task_notification', () => {});

    expect(result).toBe(handle);
  });

  it('dispatches rate_limit events via on() callback', async () => {
    const rateLimits: StreamRateLimitEvent[] = [];
    const events: StreamEvent[] = [
      {
        type: 'rate_limit',
        status: 'allowed_warning',
        resetsAt: 1700000000000,
        rateLimitType: 'five_hour',
        utilization: 0.85,
        data: { status: 'allowed_warning', utilization: 0.85 },
      } as StreamRateLimitEvent,
      { type: 'text', text: 'Response' },
      resultEvent,
    ];

    await new StreamHandle(createSource(events))
      .on('rate_limit', (e) => rateLimits.push(e))
      .done();

    expect(rateLimits).toHaveLength(1);
    expect(rateLimits[0]!.status).toBe('allowed_warning');
    expect(rateLimits[0]!.utilization).toBe(0.85);
  });

  it('on() chaining works with rate_limit', () => {
    const handle = new StreamHandle(createSource([]));

    const result = handle
      .on('rate_limit', () => {})
      .on('text', () => {});

    expect(result).toBe(handle);
  });
});
