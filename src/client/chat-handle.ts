import { spawn, type ChildProcess } from 'node:child_process';
import { Readable, Duplex } from 'node:stream';
import { parseStreamEvents } from '../parser/stream-parser.js';
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
  // Chat protocol
  CHAT_USER_MESSAGE,
  SIGNAL_SIGTERM,
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
 * Bidirectional streaming handle for real-time conversation.
 *
 * Uses `--input-format stream-json` to maintain a persistent CLI process.
 * Send prompts with `.send()`, receive responses via callbacks or Node.js streams.
 *
 * ## Fluent callbacks
 *
 * ```ts
 * const chat = claude.chat()
 *   .on('text', (text) => process.stdout.write(text))
 *   .on('result', (event) => console.log('Turn done'))
 *
 * await chat.send('What files are in src?')
 * await chat.send('Fix the largest one')
 * chat.end()
 * ```
 *
 * Every variant of {@link StreamEvent} has an overload, so the callback
 * parameter is narrowed to that variant — including the rarer ones:
 *
 * ```ts
 * chat
 *   .on('tool_result', (event) => audit(event.toolUseId, event.isError))
 *   .on('permission_denied', (event) => warn(event.toolName, event.reason))
 *   .on('context_usage', (event) => meter(event.contextUsage.percentage))
 * ```
 *
 * ## Node.js Duplex stream
 *
 * ```ts
 * const duplex = claude.chat().toDuplex()
 * inputStream.pipe(duplex).pipe(process.stdout)
 * ```
 */
export class ChatHandle {
  private readonly child: ChildProcess;

  /** One callback list per event name, created on first registration. */
  private readonly callbacks = new Map<string, ErasedCallback[]>();

  private buffer = '';
  private _closed = false;
  private _sessionId: string | null = null;
  private _turnCount = 0;

  constructor(
    executable: string,
    args: readonly string[],
    options: { cwd: string; env: Record<string, string> },
  ) {
    this.child = spawn(executable, args as string[], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.on('error', (err) => {
      this._closed = true;
      this.rejectPending(err);
    });

    this.child.on('close', (code) => {
      this._closed = true;
      if (code !== 0 && code !== null) {
        this.rejectPending(new Error(`CLI process exited with code ${code}`));
      }
    });

    this.startReading();
  }

  /** Session ID (populated after the first result). */
  get sessionId(): string | null {
    return this._sessionId;
  }

  /** Number of completed turns. */
  get turnCount(): number {
    return this._turnCount;
  }

  /** Whether the chat has been closed. */
  get closed(): boolean {
    return this._closed;
  }

  /**
   * Register a callback. Returns `this` for chaining.
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
   * Send a prompt and wait for the complete response.
   * Returns the result event when this turn finishes.
   *
   * ```ts
   * const result = await chat.send('Find bugs in auth.ts')
   * console.log(result.durationMs)
   *
   * const result2 = await chat.send('Now fix them')
   * ```
   */
  send(prompt: string): Promise<StreamResultEvent> {
    if (this._closed) {
      return Promise.reject(new Error('Chat is closed'));
    }

    const message = JSON.stringify({ type: CHAT_USER_MESSAGE, content: prompt });
    this.child.stdin!.write(message + '\n');

    const resultCallbacks = this.listeners<StreamResultEvent>(EVENT_RESULT);
    const errorCallbacks = this.listeners<StreamErrorEvent>(EVENT_ERROR);

    return new Promise<StreamResultEvent>((resolve, reject) => {
      const onResult = (event: StreamResultEvent) => {
        const idx = resultCallbacks.indexOf(onResult);
        if (idx >= 0) resultCallbacks.splice(idx, 1);
        resolve(event);
      };
      const onError = (event: StreamErrorEvent) => {
        const idx = errorCallbacks.indexOf(onError);
        if (idx >= 0) errorCallbacks.splice(idx, 1);
        reject(new Error(event.message));
      };
      resultCallbacks.push(onResult);
      errorCallbacks.push(onError);
    });
  }

  /**
   * Pipe text output to a writable stream.
   * Returns the destination for chaining (Node.js convention).
   *
   * ```ts
   * chat.pipe(process.stdout)
   * chat.pipe(fs.createWriteStream('log.txt'))
   * ```
   */
  pipe<T extends NodeJS.WritableStream>(dest: T): T {
    this.on(EVENT_TEXT, (text) => dest.write(text));
    return dest;
  }

  /**
   * Get a Node.js Readable that emits text chunks.
   *
   * ```ts
   * claude.chat().toReadable().pipe(res)
   * ```
   */
  toReadable(): Readable {
    const readable = new Readable({
      encoding: 'utf-8',
      read() { /* data is pushed asynchronously */ },
    });

    this.on(EVENT_TEXT, (text) => readable.push(text));
    this.child.on('close', () => readable.push(null));

    return readable;
  }

  /**
   * Get a Node.js Duplex stream.
   * Write side accepts prompts (one per write). Read side emits text.
   *
   * ```ts
   * const duplex = claude.chat().toDuplex()
   * inputStream.pipe(duplex).pipe(process.stdout)
   * ```
   */
  toDuplex(): Duplex {
    const chat = this;

    const duplex = new Duplex({
      encoding: 'utf-8',
      write(chunk, _encoding, callback) {
        const prompt = chunk.toString().trim();
        if (prompt) {
          const message = JSON.stringify({ type: CHAT_USER_MESSAGE, content: prompt });
          chat.child.stdin!.write(message + '\n');
        }
        callback();
      },
      read() { /* data is pushed asynchronously */ },
    });

    this.on(EVENT_TEXT, (text) => duplex.push(text));
    this.child.on('close', () => duplex.push(null));

    return duplex;
  }

  /**
   * Close the chat gracefully — signals EOF to the CLI process.
   */
  end(): void {
    if (this._closed) return;
    this._closed = true;
    if (this.child.stdin && !this.child.stdin.destroyed) {
      this.child.stdin.end();
    }
  }

  /**
   * Abort the chat — kills the CLI process immediately.
   */
  abort(): void {
    this._closed = true;
    if (!this.child.killed) {
      this.child.kill(SIGNAL_SIGTERM);
    }
  }

  // ── Private ───────────────────────────────────────────────────────

  /**
   * Stable callback list for an event name, created on first access.
   *
   * The array identity never changes, so `send()` can hold on to it and splice
   * its one-shot listeners out by reference.
   */
  private listeners<T>(type: string): Array<(payload: T) => void> {
    let list = this.callbacks.get(type);
    if (!list) {
      list = [];
      this.callbacks.set(type, list);
    }
    return list as unknown as Array<(payload: T) => void>;
  }

  private startReading(): void {
    this.child.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');

      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // One stream-json line can carry several events (an assistant turn
        // with a thinking and a text block, a user turn answering parallel
        // tool calls), so drain them all — the singular reader dropped them.
        for (const event of parseStreamEvents(trimmed)) {
          if (event.type === EVENT_RESULT) {
            this._sessionId = event.sessionId || this._sessionId;
            this._turnCount++;
          }
          this.dispatch(event);
        }
      }
    });

    // Flush remaining buffer on close
    this.child.stdout!.on('end', () => {
      const trimmed = this.buffer.trim();
      if (trimmed) {
        for (const event of parseStreamEvents(trimmed)) this.dispatch(event);
      }
    });
  }

  private rejectPending(error: Error): void {
    // Reject any pending send() promises by dispatching an error event
    const callbacks = [...this.listeners<StreamErrorEvent>(EVENT_ERROR)];
    for (const cb of callbacks) {
      try { cb({ type: EVENT_ERROR, message: error.message }); } catch { /* ignore */ }
    }
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
