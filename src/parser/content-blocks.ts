import type { ContentBlock } from '../types/result.js';
import {
  KEY_TYPE, KEY_TEXT, KEY_ID, KEY_NAME, KEY_INPUT, KEY_TOOL_USE_ID, KEY_CONTENT,
  KEY_THINKING, KEY_SIGNATURE, KEY_DATA,
  BLOCK_TEXT, BLOCK_TOOL_USE, BLOCK_TOOL_RESULT, BLOCK_THINKING, BLOCK_REDACTED_THINKING,
} from '../constants.js';

/**
 * Normalises the `content` of a `tool_result` block onto the library's types.
 *
 * A tool answers either with plain text or with a list of content blocks, and
 * that list is open-ended on the wire — an image, a document, whatever a future
 * tool returns. {@link ContentBlock} is a closed union, so a raw cast would hand
 * the consumer a block wearing a type it does not satisfy: `switch (b.type)`
 * matches no case and `b.text` is `undefined` where the type promises a string.
 *
 * Every block is therefore rebuilt field by field, and blocks the union does not
 * name are dropped rather than forwarded. Both execution modes call this, so the
 * SDK session and `--output-format stream-json` cannot disagree about what a
 * tool result contains.
 *
 * @param raw - The block's `content` exactly as it arrived on the wire.
 * @returns The string verbatim, or the modelled blocks in wire order. A payload
 *   that is neither (missing, a number, an object) becomes an empty string.
 */
export function mapToolResultContent(raw: unknown): string | readonly ContentBlock[] {
  if (typeof raw === 'string') return raw;
  if (!Array.isArray(raw)) return '';

  const blocks: ContentBlock[] = [];
  for (const block of raw) {
    if (!isRecord(block)) continue;

    const blockType = block[KEY_TYPE];
    if (blockType === BLOCK_TEXT) {
      blocks.push({ type: BLOCK_TEXT, text: String(block[KEY_TEXT] ?? '') });
    } else if (blockType === BLOCK_TOOL_USE) {
      blocks.push({
        type: BLOCK_TOOL_USE,
        id: String(block[KEY_ID] ?? ''),
        name: String(block[KEY_NAME] ?? ''),
        input: isRecord(block[KEY_INPUT]) ? block[KEY_INPUT] : {},
      });
    } else if (blockType === BLOCK_TOOL_RESULT) {
      blocks.push({
        type: BLOCK_TOOL_RESULT,
        tool_use_id: String(block[KEY_TOOL_USE_ID] ?? ''),
        content: typeof block[KEY_CONTENT] === 'string' ? block[KEY_CONTENT] : '',
      });
    } else if (blockType === BLOCK_THINKING) {
      blocks.push({
        type: BLOCK_THINKING,
        thinking: String(block[KEY_THINKING] ?? ''),
        signature: typeof block[KEY_SIGNATURE] === 'string' ? block[KEY_SIGNATURE] : undefined,
      });
    } else if (blockType === BLOCK_REDACTED_THINKING) {
      blocks.push({ type: BLOCK_REDACTED_THINKING, data: String(block[KEY_DATA] ?? '') });
    }
  }
  return blocks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
