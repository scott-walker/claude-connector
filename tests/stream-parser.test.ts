import { describe, it, expect } from 'vitest';
import { parseStreamLine } from '../src/parser/stream-parser.js';

describe('parseStreamLine', () => {
  it('parses a text assistant event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
      },
    });

    const event = parseStreamLine(line);

    expect(event).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('parses a tool_use assistant event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', name: 'Read', input: { file_path: '/src/index.ts' } },
        ],
      },
    });

    const event = parseStreamLine(line);

    expect(event).toEqual({
      type: 'tool_use',
      toolName: 'Read',
      toolInput: { file_path: '/src/index.ts' },
    });
  });

  it('parses a result event', () => {
    const line = JSON.stringify({
      type: 'result',
      result: 'Done!',
      session_id: 'sess-123',
      usage: { input_tokens: 200, output_tokens: 100 },
      total_cost_usd: 0.005,
      duration_ms: 3000,
    });

    const event = parseStreamLine(line);

    expect(event).toEqual({
      type: 'result',
      subtype: 'success',
      text: 'Done!',
      sessionId: 'sess-123',
      usage: { inputTokens: 200, outputTokens: 100 },
      cost: 0.005,
      durationMs: 3000,
      isError: false,
      stopReason: null,
      numTurns: undefined,
      structured: null,
    });
  });

  it('parses an error event', () => {
    const line = JSON.stringify({
      type: 'error',
      message: 'Rate limited',
      code: 'rate_limit',
    });

    const event = parseStreamLine(line);

    expect(event).toEqual({
      type: 'error',
      message: 'Rate limited',
      code: 'rate_limit',
    });
  });

  it('returns null for malformed JSON', () => {
    expect(parseStreamLine('not json')).toBeNull();
  });

  it('returns null for assistant event with empty content', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [] },
    });

    expect(parseStreamLine(line)).toBeNull();
  });

  it('forwards unknown types as system events', () => {
    const line = JSON.stringify({
      type: 'custom_event',
      data: { foo: 'bar' },
    });

    const event = parseStreamLine(line);

    expect(event).toEqual({
      type: 'system',
      subtype: 'custom_event',
      data: { type: 'custom_event', data: { foo: 'bar' } },
    });
  });

  it('parses a result event with structured output', () => {
    const structured = { endpoints: ['/api/users', '/api/posts'] };
    const line = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: '{"endpoints":["/api/users","/api/posts"]}',
      session_id: 'sess-456',
      usage: { input_tokens: 100, output_tokens: 50 },
      total_cost_usd: 0.002,
      duration_ms: 1500,
      is_error: false,
      stop_reason: 'end_turn',
      num_turns: 3,
      structured_output: structured,
    });

    const event = parseStreamLine(line);

    expect(event).toEqual({
      type: 'result',
      subtype: 'success',
      text: '{"endpoints":["/api/users","/api/posts"]}',
      sessionId: 'sess-456',
      usage: { inputTokens: 100, outputTokens: 50 },
      cost: 0.002,
      durationMs: 1500,
      isError: false,
      stopReason: 'end_turn',
      numTurns: 3,
      structured,
    });
  });

  it('parses an error result event', () => {
    const line = JSON.stringify({
      type: 'result',
      subtype: 'error_max_turns',
      result: 'Exceeded max turns',
      session_id: 'sess-789',
      usage: { input_tokens: 500, output_tokens: 300 },
      total_cost_usd: 0.01,
      duration_ms: 5000,
      is_error: true,
      stop_reason: 'max_turns',
      num_turns: 10,
    });

    const event = parseStreamLine(line);

    expect(event).toMatchObject({
      type: 'result',
      subtype: 'error_max_turns',
      isError: true,
      stopReason: 'max_turns',
      numTurns: 10,
    });
  });

  it('takes last content block for streaming', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Thinking...' },
          { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    });

    const event = parseStreamLine(line);

    expect(event).toEqual({
      type: 'tool_use',
      toolName: 'Bash',
      toolInput: { command: 'ls' },
    });
  });
});
