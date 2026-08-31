import { ParseError } from '../errors/errors.js';
import type { QueryResult, Message } from '../types/index.js';
import { parseResultEvent } from './stream-parser.js';
import {
  KEY_RESULT, KEY_MESSAGES, KEY_CONTENT, KEY_ROLE, KEY_TEXT,
  KEY_TYPE, ROLE_ASSISTANT,
} from '../constants.js';

/**
 * Parses the JSON output from `claude -p --output-format json`.
 *
 * ## Expected CLI output structure
 *
 * ```json
 * {
 *   "session_id": "uuid",
 *   "result": "text response",
 *   "messages": [...],
 *   "usage": { "input_tokens": N, "output_tokens": N },
 *   "duration_ms": N,
 *   "total_cost_usd": N | null
 * }
 * ```
 *
 * The parser is intentionally lenient — it extracts known fields and passes
 * the rest through as `raw`. This way new CLI fields don't break the parser.
 */
export function parseJsonResult(stdout: string): QueryResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new ParseError('Empty output from CLI', stdout);
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new ParseError(`Failed to parse CLI JSON output: ${trimmed.slice(0, 200)}`, stdout);
  }

  // The one-shot JSON payload is the same object the stream emits as its
  // `result` message, so it goes through the same mapping — otherwise CLI mode
  // would keep reporting a fraction of the fields QueryResult declares.
  const result = parseResultEvent(json);
  const messages = parseMessages(json[KEY_MESSAGES]);

  return {
    text: typeof json[KEY_RESULT] === 'string' ? json[KEY_RESULT] : extractText(json),
    sessionId: result.sessionId,
    usage: result.usage,
    cost: result.cost,
    durationMs: result.durationMs,
    messages,
    structured: result.structured ?? null,
    raw: json,
    subtype: result.subtype,
    isError: result.isError,
    errors: result.errors,
    terminalReason: result.terminalReason,
    modelUsage: result.modelUsage,
    permissionDenials: result.permissionDenials,
    deferredToolUse: result.deferredToolUse,
    durationApiMs: result.durationApiMs,
    queuedTurnCount: result.queuedTurnCount,
    ttftMs: result.ttftMs,
    apiErrorStatus: result.apiErrorStatus,
    fastModeState: result.fastModeState,
    origin: result.origin,
  };
}

function parseMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((msg: Record<string, unknown>) => ({
    role: msg[KEY_ROLE] as 'user' | 'assistant',
    content: typeof msg[KEY_CONTENT] === 'string' ? msg[KEY_CONTENT] : msg[KEY_CONTENT] as Message['content'],
  }));
}

/**
 * Fallback text extraction when 'result' field is missing.
 * Looks for the last assistant message content.
 */
function extractText(json: Record<string, unknown>): string {
  const messages = json[KEY_MESSAGES];
  if (!Array.isArray(messages)) return '';

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg[KEY_ROLE] === ROLE_ASSISTANT) {
      if (typeof msg[KEY_CONTENT] === 'string') return msg[KEY_CONTENT];
      if (Array.isArray(msg[KEY_CONTENT])) {
        const textBlocks = (msg[KEY_CONTENT] as Record<string, unknown>[])
          .filter((b) => b[KEY_TYPE] === KEY_TEXT)
          .map((b) => b[KEY_TEXT] as string);
        return textBlocks.join('');
      }
    }
  }
  return '';
}
