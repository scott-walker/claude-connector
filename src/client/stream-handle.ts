import { Readable } from 'node:stream';
import {
  // Core conversation
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_TOOL_RESULT,
  EVENT_RESULT,
  EVENT_ERROR,
  EVENT_SYSTEM,
  // Rate limits
  EVENT_RATE_LIMIT,
  // Subagent tasks
  EVENT_TASK_STARTED,
  EVENT_TASK_PROGRESS,
  EVENT_TASK_NOTIFICATION,
  EVENT_TASK_UPDATED,
  EVENT_BACKGROUND_TASKS_CHANGED,
  // Tool lifecycle
  EVENT_TOOL_PROGRESS,
  EVENT_TOOL_USE_SUMMARY,
  // Auth status
  EVENT_AUTH_STATUS,
  // Hook lifecycle
  EVENT_HOOK_STARTED,
  EVENT_HOOK_PROGRESS,
  EVENT_HOOK_RESPONSE,
  // File persistence
  EVENT_FILES_PERSISTED,
  // Context compaction & usage
  EVENT_COMPACT_BOUNDARY,
  EVENT_CONTEXT_USAGE,
  // Local command output
  EVENT_LOCAL_COMMAND_OUTPUT,
  // Extended thinking
  EVENT_THINKING,
  EVENT_THINKING_TOKENS,
  // API retries & model refusals
  EVENT_API_RETRY,
  EVENT_MODEL_REFUSAL_FALLBACK,
  EVENT_MODEL_REFUSAL_NO_FALLBACK,
  // Session & worker lifecycle
  EVENT_SESSION_STATE_CHANGED,
  EVENT_STATUS,
  EVENT_WORKER_SHUTTING_DOWN,
  EVENT_CONVERSATION_RESET,
  EVENT_MIRROR_ERROR,
  EVENT_INIT,
  // Permissions & notifications
  EVENT_PERMISSION_DENIED,
  EVENT_NOTIFICATION,
  EVENT_INFORMATIONAL,
  EVENT_PROMPT_SUGGESTION,
  // Partial messages & memory
  EVENT_PARTIAL_MESSAGE,
  EVENT_MEMORY_RECALL,
  // Commands, plugins & elicitation
  EVENT_COMMANDS_CHANGED,
  EVENT_PLUGIN_INSTALL,
  EVENT_ELICITATION_COMPLETE,
  EVENT_CONTROL_REQUEST_PROGRESS,
} from '../constants.js';
import type {
  StreamEvent,
  // Core conversation
  StreamTextEvent,
  StreamToolUseEvent,
  StreamToolResultEvent,
  StreamResultEvent,
  StreamErrorEvent,
  StreamSystemEvent,
  // Rate limits
  StreamRateLimitEvent,
  // Subagent tasks
  StreamTaskStartedEvent,
  StreamTaskProgressEvent,
  StreamTaskNotificationEvent,
  StreamTaskUpdatedEvent,
  StreamBackgroundTasksChangedEvent,
  // Tool lifecycle
  StreamToolProgressEvent,
  StreamToolUseSummaryEvent,
  // Auth status
  StreamAuthStatusEvent,
  // Hook lifecycle
  StreamHookStartedEvent,
  StreamHookProgressEvent,
  StreamHookResponseEvent,
  // File persistence
  StreamFilesPersistedEvent,
  // Context compaction & usage
  StreamCompactBoundaryEvent,
  StreamContextUsageEvent,
  // Local command output
  StreamLocalCommandOutputEvent,
  // Extended thinking
  StreamThinkingEvent,
  StreamThinkingTokensEvent,
  // API retries & model refusals
  StreamApiRetryEvent,
  StreamModelRefusalFallbackEvent,
  StreamModelRefusalNoFallbackEvent,
  // Session & worker lifecycle
  StreamSessionStateChangedEvent,
  StreamStatusEvent,
  StreamWorkerShuttingDownEvent,
  StreamConversationResetEvent,
  StreamMirrorErrorEvent,
  StreamInitEvent,
  // Permissions & notifications
  StreamPermissionDeniedEvent,
  StreamNotificationEvent,
  StreamInformationalEvent,
  StreamPromptSuggestionEvent,
  // Partial messages & memory
  StreamPartialMessageEvent,
  StreamMemoryRecallEvent,
  // Commands, plugins & elicitation
  StreamCommandsChangedEvent,
  StreamPluginInstallEvent,
  StreamElicitationCompleteEvent,
  StreamControlRequestProgressEvent,
} from '../types/index.js';

/** Callback for the `text` event — receives the chunk, not the event. */
type TextCallback = (text: StreamTextEvent['text']) => void;

/** Callback for any other event — receives the full event object. */
type EventCallback<T> = (event: T) => void;

/**
 * Type-erased callback list. Element types are recovered by `listeners<T>()`,
 * which is the only place a bucket is read or written with a concrete type.
 */
type ErasedCallback = (payload: never) => void;

/**
 * A streaming response handle with fluent callback API and Node.js stream support.
 *
 * ## 1. Fluent callbacks
 *
 * ```ts
 * await claude.stream('Refactor auth')
 *   .on('text', (text) => process.stdout.write(text))
 *   .on('tool_use', (event) => console.log(event.toolName))
 *   .on('task_started', (event) => console.log(`Task: ${event.description}`))
 *   .done()
 * ```
 *
 * Every variant of {@link StreamEvent} has an overload, so the callback
 * parameter is narrowed to that variant — including the rarer ones:
 *
 * ```ts
 * await claude.stream('Audit deps')
 *   .on('thinking', (event) => log(event.thinking))
 *   .on('context_usage', (event) => meter(event.contextUsage.percentage))
 *   .on('api_retry', (event) => warn(`retry ${event.attempt}/${event.maxRetries}`))
 *   .done()
 * ```
 *
 * ## 2. Convenience methods
 *
 * ```ts
 * const text = await claude.stream('Summarize').text()
 * const result = await claude.stream('Explain').pipe(process.stdout)
 * ```
 *
 * ## 3. Node.js Readable stream
 *
 * ```ts
 * import { pipeline } from 'node:stream/promises'
 * await pipeline(claude.stream('Generate').toReadable(), createGzip(), file)
 * ```
 *
 * ## 4. Raw async iteration (backward compat)
 *
 * ```ts
 * for await (const event of claude.stream('Analyze')) { ... }
 * ```
 */
export class StreamHandle implements AsyncIterable<StreamEvent> {
  private readonly source: () => AsyncIterable<StreamEvent>;

  /** One callback list per event name, created on first registration. */
  private readonly callbacks = new Map<string, ErasedCallback[]>();

  constructor(source: () => AsyncIterable<StreamEvent>) {
    this.source = source;
  }

  /**
   * Register a callback for a specific event type. Returns `this` for chaining.
   *
   * `text` callback receives just the string. All others receive the full event.
   */
  // Core conversation
  on(type: typeof EVENT_TEXT, callback: TextCallback): this;
  on(type: typeof EVENT_TOOL_USE, callback: EventCallback<StreamToolUseEvent>): this;
  on(type: typeof EVENT_TOOL_RESULT, callback: EventCallback<StreamToolResultEvent>): this;
  on(type: typeof EVENT_RESULT, callback: EventCallback<StreamResultEvent>): this;
  on(type: typeof EVENT_ERROR, callback: EventCallback<StreamErrorEvent>): this;
  on(type: typeof EVENT_SYSTEM, callback: EventCallback<StreamSystemEvent>): this;
  // Rate limits
  on(type: typeof EVENT_RATE_LIMIT, callback: EventCallback<StreamRateLimitEvent>): this;
  // Subagent tasks
  on(type: typeof EVENT_TASK_STARTED, callback: EventCallback<StreamTaskStartedEvent>): this;
  on(type: typeof EVENT_TASK_PROGRESS, callback: EventCallback<StreamTaskProgressEvent>): this;
  on(type: typeof EVENT_TASK_NOTIFICATION, callback: EventCallback<StreamTaskNotificationEvent>): this;
  on(type: typeof EVENT_TASK_UPDATED, callback: EventCallback<StreamTaskUpdatedEvent>): this;
  on(type: typeof EVENT_BACKGROUND_TASKS_CHANGED, callback: EventCallback<StreamBackgroundTasksChangedEvent>): this;
  // Tool lifecycle
  on(type: typeof EVENT_TOOL_PROGRESS, callback: EventCallback<StreamToolProgressEvent>): this;
  on(type: typeof EVENT_TOOL_USE_SUMMARY, callback: EventCallback<StreamToolUseSummaryEvent>): this;
  // Auth status
  on(type: typeof EVENT_AUTH_STATUS, callback: EventCallback<StreamAuthStatusEvent>): this;
  // Hook lifecycle
  on(type: typeof EVENT_HOOK_STARTED, callback: EventCallback<StreamHookStartedEvent>): this;
  on(type: typeof EVENT_HOOK_PROGRESS, callback: EventCallback<StreamHookProgressEvent>): this;
  on(type: typeof EVENT_HOOK_RESPONSE, callback: EventCallback<StreamHookResponseEvent>): this;
  // File persistence
  on(type: typeof EVENT_FILES_PERSISTED, callback: EventCallback<StreamFilesPersistedEvent>): this;
  // Context compaction & usage
  on(type: typeof EVENT_COMPACT_BOUNDARY, callback: EventCallback<StreamCompactBoundaryEvent>): this;
  on(type: typeof EVENT_CONTEXT_USAGE, callback: EventCallback<StreamContextUsageEvent>): this;
  // Local command output
  on(type: typeof EVENT_LOCAL_COMMAND_OUTPUT, callback: EventCallback<StreamLocalCommandOutputEvent>): this;
  // Extended thinking
  on(type: typeof EVENT_THINKING, callback: EventCallback<StreamThinkingEvent>): this;
  on(type: typeof EVENT_THINKING_TOKENS, callback: EventCallback<StreamThinkingTokensEvent>): this;
  // API retries & model refusals
  on(type: typeof EVENT_API_RETRY, callback: EventCallback<StreamApiRetryEvent>): this;
  on(type: typeof EVENT_MODEL_REFUSAL_FALLBACK, callback: EventCallback<StreamModelRefusalFallbackEvent>): this;
  on(type: typeof EVENT_MODEL_REFUSAL_NO_FALLBACK, callback: EventCallback<StreamModelRefusalNoFallbackEvent>): this;
  // Session & worker lifecycle
  on(type: typeof EVENT_SESSION_STATE_CHANGED, callback: EventCallback<StreamSessionStateChangedEvent>): this;
  on(type: typeof EVENT_STATUS, callback: EventCallback<StreamStatusEvent>): this;
  on(type: typeof EVENT_WORKER_SHUTTING_DOWN, callback: EventCallback<StreamWorkerShuttingDownEvent>): this;
  on(type: typeof EVENT_CONVERSATION_RESET, callback: EventCallback<StreamConversationResetEvent>): this;
  on(type: typeof EVENT_MIRROR_ERROR, callback: EventCallback<StreamMirrorErrorEvent>): this;
  on(type: typeof EVENT_INIT, callback: EventCallback<StreamInitEvent>): this;
  // Permissions & notifications
  on(type: typeof EVENT_PERMISSION_DENIED, callback: EventCallback<StreamPermissionDeniedEvent>): this;
  on(type: typeof EVENT_NOTIFICATION, callback: EventCallback<StreamNotificationEvent>): this;
  on(type: typeof EVENT_INFORMATIONAL, callback: EventCallback<StreamInformationalEvent>): this;
  on(type: typeof EVENT_PROMPT_SUGGESTION, callback: EventCallback<StreamPromptSuggestionEvent>): this;
  // Partial messages & memory
  on(type: typeof EVENT_PARTIAL_MESSAGE, callback: EventCallback<StreamPartialMessageEvent>): this;
  on(type: typeof EVENT_MEMORY_RECALL, callback: EventCallback<StreamMemoryRecallEvent>): this;
  // Commands, plugins & elicitation
  on(type: typeof EVENT_COMMANDS_CHANGED, callback: EventCallback<StreamCommandsChangedEvent>): this;
  on(type: typeof EVENT_PLUGIN_INSTALL, callback: EventCallback<StreamPluginInstallEvent>): this;
  on(type: typeof EVENT_ELICITATION_COMPLETE, callback: EventCallback<StreamElicitationCompleteEvent>): this;
  on(type: typeof EVENT_CONTROL_REQUEST_PROGRESS, callback: EventCallback<StreamControlRequestProgressEvent>): this;
  on(type: string, callback: (...args: never[]) => void): this {
    this.listeners<never>(type).push(callback as ErasedCallback);
    return this;
  }

  /**
   * Consume the stream, fire all registered callbacks, return the final result.
   */
  async done(): Promise<StreamResultEvent> {
    let result: StreamResultEvent | null = null;

    for await (const event of this.source()) {
      this.dispatch(event);
      if (event.type === EVENT_RESULT) result = event;
    }

    if (!result) {
      throw new Error('Stream ended without a result event');
    }
    return result;
  }

  /**
   * Collect all text chunks into a single string.
   */
  async text(): Promise<string> {
    let collected = '';

    for await (const event of this.source()) {
      if (event.type === EVENT_TEXT) collected += event.text;
      this.dispatch(event);
    }

    return collected;
  }

  /**
   * Pipe text to a writable stream. Returns the final result.
   *
   * ```ts
   * const result = await claude.stream('Explain').pipe(process.stdout)
   * ```
   */
  async pipe(writable: { write(chunk: string): unknown }): Promise<StreamResultEvent> {
    this.on(EVENT_TEXT, (text) => writable.write(text));
    return this.done();
  }

  /**
   * Get a Node.js Readable that emits text chunks.
   * Use for `pipeline()`, standard `.pipe()` chaining, HTTP responses, etc.
   */
  toReadable(): Readable {
    const source = this.source;
    const textStream = async function* () {
      for await (const event of source()) {
        if (event.type === EVENT_TEXT) yield event.text;
      }
    };
    return Readable.from(textStream(), { encoding: 'utf-8' });
  }

  /**
   * Async iteration — yields StreamEvent objects. Backward compatible with `for await`.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    yield* this.source();
  }

  // ── Private ───────────────────────────────────────────────────────

  /**
   * Stable callback list for an event name, created on first access.
   *
   * The array identity never changes, so callers may hold on to it and splice
   * themselves out by reference.
   */
  private listeners<T>(type: string): Array<(payload: T) => void> {
    let list = this.callbacks.get(type);
    if (!list) {
      list = [];
      this.callbacks.set(type, list);
    }
    return list as unknown as Array<(payload: T) => void>;
  }

  private dispatch(event: StreamEvent): void {
    const list = this.callbacks.get(event.type);
    if (!list || list.length === 0) return;

    // `text` is the one event whose callbacks receive the payload, not the event.
    const payload: unknown = event.type === EVENT_TEXT ? event.text : event;

    for (const cb of list as unknown as Array<(payload: unknown) => void>) {
      try { cb(payload); } catch { /* user callback error should not break the stream */ }
    }
  }
}
