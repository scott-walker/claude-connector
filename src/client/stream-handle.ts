import { Readable } from 'node:stream';
import {
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
  EVENT_ERROR,
  EVENT_SYSTEM,
  EVENT_RATE_LIMIT,
  EVENT_TASK_STARTED,
  EVENT_TASK_PROGRESS,
  EVENT_TASK_NOTIFICATION,
} from '../constants.js';
import type {
  StreamEvent,
  StreamToolUseEvent,
  StreamResultEvent,
  StreamErrorEvent,
  StreamSystemEvent,
  StreamRateLimitEvent,
  StreamTaskStartedEvent,
  StreamTaskProgressEvent,
  StreamTaskNotificationEvent,
} from '../types/index.js';

type TextCallback = (text: string) => void;
type ToolUseCallback = (event: StreamToolUseEvent) => void;
type ResultCallback = (event: StreamResultEvent) => void;
type ErrorCallback = (event: StreamErrorEvent) => void;
type SystemCallback = (event: StreamSystemEvent) => void;
type TaskStartedCallback = (event: StreamTaskStartedEvent) => void;
type TaskProgressCallback = (event: StreamTaskProgressEvent) => void;
type TaskNotificationCallback = (event: StreamTaskNotificationEvent) => void;
type RateLimitCallback = (event: StreamRateLimitEvent) => void;

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
  private readonly textCallbacks: TextCallback[] = [];
  private readonly toolUseCallbacks: ToolUseCallback[] = [];
  private readonly resultCallbacks: ResultCallback[] = [];
  private readonly errorCallbacks: ErrorCallback[] = [];
  private readonly systemCallbacks: SystemCallback[] = [];
  private readonly taskStartedCallbacks: TaskStartedCallback[] = [];
  private readonly taskProgressCallbacks: TaskProgressCallback[] = [];
  private readonly taskNotificationCallbacks: TaskNotificationCallback[] = [];
  private readonly rateLimitCallbacks: RateLimitCallback[] = [];

  constructor(source: () => AsyncIterable<StreamEvent>) {
    this.source = source;
  }

  /**
   * Register a callback for a specific event type. Returns `this` for chaining.
   *
   * `text` callback receives just the string. All others receive the full event.
   */
  on(type: typeof EVENT_TEXT, callback: TextCallback): this;
  on(type: typeof EVENT_TOOL_USE, callback: ToolUseCallback): this;
  on(type: typeof EVENT_RESULT, callback: ResultCallback): this;
  on(type: typeof EVENT_ERROR, callback: ErrorCallback): this;
  on(type: typeof EVENT_SYSTEM, callback: SystemCallback): this;
  on(type: typeof EVENT_TASK_STARTED, callback: TaskStartedCallback): this;
  on(type: typeof EVENT_TASK_PROGRESS, callback: TaskProgressCallback): this;
  on(type: typeof EVENT_TASK_NOTIFICATION, callback: TaskNotificationCallback): this;
  on(type: typeof EVENT_RATE_LIMIT, callback: RateLimitCallback): this;
  on(type: string, callback: (...args: never[]) => void): this {
    switch (type) {
      case EVENT_TEXT: this.textCallbacks.push(callback as TextCallback); break;
      case EVENT_TOOL_USE: this.toolUseCallbacks.push(callback as ToolUseCallback); break;
      case EVENT_RESULT: this.resultCallbacks.push(callback as ResultCallback); break;
      case EVENT_ERROR: this.errorCallbacks.push(callback as ErrorCallback); break;
      case EVENT_SYSTEM: this.systemCallbacks.push(callback as SystemCallback); break;
      case EVENT_TASK_STARTED: this.taskStartedCallbacks.push(callback as TaskStartedCallback); break;
      case EVENT_TASK_PROGRESS: this.taskProgressCallbacks.push(callback as TaskProgressCallback); break;
      case EVENT_TASK_NOTIFICATION: this.taskNotificationCallbacks.push(callback as TaskNotificationCallback); break;
      case EVENT_RATE_LIMIT: this.rateLimitCallbacks.push(callback as RateLimitCallback); break;
    }
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
    this.textCallbacks.push((text) => writable.write(text));
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

  private dispatch(event: StreamEvent): void {
    const safeCall = <T>(callbacks: Array<(arg: T) => void>, arg: T) => {
      for (const cb of callbacks) {
        try { cb(arg); } catch { /* user callback error should not break the stream */ }
      }
    };

    switch (event.type) {
      case EVENT_TEXT:
        safeCall(this.textCallbacks, event.text);
        break;
      case EVENT_TOOL_USE:
        safeCall(this.toolUseCallbacks, event);
        break;
      case EVENT_RESULT:
        safeCall(this.resultCallbacks, event);
        break;
      case EVENT_ERROR:
        safeCall(this.errorCallbacks, event);
        break;
      case EVENT_SYSTEM:
        safeCall(this.systemCallbacks, event);
        break;
      case EVENT_TASK_STARTED:
        safeCall(this.taskStartedCallbacks, event);
        break;
      case EVENT_TASK_PROGRESS:
        safeCall(this.taskProgressCallbacks, event);
        break;
      case EVENT_TASK_NOTIFICATION:
        safeCall(this.taskNotificationCallbacks, event);
        break;
      case EVENT_RATE_LIMIT:
        safeCall(this.rateLimitCallbacks, event);
        break;
    }
  }
}
