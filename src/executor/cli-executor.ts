import { spawn, type ChildProcess } from 'node:child_process';
import { parseJsonResult } from '../parser/json-parser.js';
import { parseStreamEvents } from '../parser/stream-parser.js';
import { CliExecutionError, CliNotFoundError, CliTimeoutError } from '../errors/errors.js';
import type { QueryResult, StreamEvent } from '../types/index.js';
import type { IExecutor, ExecuteOptions } from './interface.js';
import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_EXECUTABLE,
  DEFAULT_MAX_BUFFER_BYTES,
  ERR_ENOENT,
  SIGNAL_SIGTERM,
  EVENT_SYSTEM,
  SYSTEM_STDERR,
  ABORT_MESSAGE,
} from '../constants.js';

/**
 * Executor implementation that spawns the Claude Code CLI as a child process.
 *
 * ## How it works
 *
 * - `execute()` spawns `claude -p <prompt> --output-format json` and collects stdout.
 * - `stream()` spawns `claude -p <prompt> --output-format stream-json` and parses
 *   newline-delimited JSON (NDJSON) from stdout in real time.
 *
 * ## Error handling
 *
 * - Non-zero exit code → {@link CliExecutionError}
 * - `ENOENT` (binary not found) → {@link CliNotFoundError}
 * - Timeout → {@link CliTimeoutError}
 *
 * ## The prompt
 *
 * `args` already carries the prompt as a positional — {@link buildArgs} puts it
 * there. {@link ExecuteOptions.prompt} is the same string passed out of band, and
 * this executor appends it only when argv does not already contain it. That
 * makes the prompt independent of argv layout for every executor, so no one has
 * to re-derive it by parsing flags back apart.
 *
 * ## Lifecycle
 *
 * Each call to `execute()` or `stream()` spawns a fresh process.
 * The executor is stateless — safe to use concurrently from multiple queries.
 */
export class CliExecutor implements IExecutor {
  private readonly executable: string;
  private readonly timeoutMs: number;
  private activeProcess: ChildProcess | null = null;

  constructor(executable: string = DEFAULT_EXECUTABLE, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.executable = executable;
    this.timeoutMs = timeoutMs;
  }

  async execute(args: readonly string[], options: ExecuteOptions): Promise<QueryResult> {
    const { stdout, stderr, exitCode } = await this.spawn(args, options);

    if (exitCode !== 0) {
      throw new CliExecutionError(
        `CLI exited with code ${exitCode}: ${stderr}`,
        exitCode,
        stderr,
      );
    }

    return parseJsonResult(stdout);
  }

  async *stream(args: readonly string[], options: ExecuteOptions): AsyncIterable<StreamEvent> {
    const child = this.spawnProcess(args, options);
    this.activeProcess = child;

    // Wire AbortSignal for per-query cancellation
    const signal = options.signal;
    let detachAbort: (() => void) | undefined;

    if (signal) {
      if (signal.aborted) {
        child.kill(SIGNAL_SIGTERM);
        this.activeProcess = null;
        return;
      }
      const onAbort = () => {
        if (!child.killed) {
          child.kill(SIGNAL_SIGTERM);
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
      detachAbort = () => signal.removeEventListener('abort', onAbort);
    }

    try {
      yield* this.readStream(child);
    } finally {
      // Runs on early `break`/`return` from the consumer too, so a caller that
      // stops iterating does not leave the process running.
      detachAbort?.();
      if (isRunning(child)) {
        child.kill(SIGNAL_SIGTERM);
      }
      this.activeProcess = null;
    }
  }

  abort(): void {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill(SIGNAL_SIGTERM);
      this.activeProcess = null;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────

  private spawnProcess(args: readonly string[], options: ExecuteOptions): ChildProcess {
    try {
      const child = spawn(this.executable, withPrompt(args, options.prompt), {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (options.input && child.stdin) {
        child.stdin.write(options.input);
        child.stdin.end();
      } else if (child.stdin) {
        child.stdin.end();
      }

      return child;
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === ERR_ENOENT) {
        throw new CliNotFoundError(this.executable);
      }
      throw error;
    }
  }

  private spawn(
    args: readonly string[],
    options: ExecuteOptions,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(args, options);
      this.activeProcess = child;

      // Wire AbortSignal to kill the process
      const signal = options.signal;
      let detachAbort: (() => void) | undefined;

      if (signal) {
        if (signal.aborted) {
          child.kill(SIGNAL_SIGTERM);
          this.activeProcess = null;
          reject(new Error(ABORT_MESSAGE));
          return;
        }
        const onAbort = () => {
          if (!child.killed) {
            child.kill(SIGNAL_SIGTERM);
          }
        };
        signal.addEventListener('abort', onAbort, { once: true });
        detachAbort = () => signal.removeEventListener('abort', onAbort);
      }

      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      let totalBytes = 0;

      child.stdout!.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > DEFAULT_MAX_BUFFER_BYTES) {
          child.kill(SIGNAL_SIGTERM);
          reject(new CliExecutionError(
            `Output exceeded ${DEFAULT_MAX_BUFFER_BYTES} bytes limit`,
            1,
            '',
          ));
          return;
        }
        chunks.push(chunk);
      });
      child.stderr!.on('data', (chunk: Buffer) => errChunks.push(chunk));

      const timer = setTimeout(() => {
        child.kill(SIGNAL_SIGTERM);
        reject(new CliTimeoutError(this.timeoutMs));
      }, this.timeoutMs);

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        detachAbort?.();
        this.activeProcess = null;

        if (err.code === ERR_ENOENT) {
          reject(new CliNotFoundError(this.executable));
        } else {
          reject(err);
        }
      });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        detachAbort?.();
        this.activeProcess = null;

        // A kill from the abort listener closes the process with no output;
        // surface the cancellation rather than an empty successful result.
        if (signal?.aborted) {
          reject(new Error(ABORT_MESSAGE));
          return;
        }

        resolve({
          stdout: Buffer.concat(chunks).toString('utf-8'),
          stderr: Buffer.concat(errChunks).toString('utf-8'),
          exitCode: exitCode ?? 1,
        });
      });
    });
  }

  private async *readStream(child: ChildProcess): AsyncIterable<StreamEvent> {
    // Buffer for incomplete lines (NDJSON may arrive in partial chunks)
    let buffer = '';

    // One line can carry several events — an assistant turn with a wrapper error
    // and two content blocks is three — so every parse result is drained, not
    // just its first entry.
    const pushLine = (line: string, push: (event: StreamEvent) => void): void => {
      const trimmed = line.trim();
      if (!trimmed) return;
      for (const event of parseStreamEvents(trimmed)) push(event);
    };

    const iterator = createAsyncIterator<StreamEvent>(
      child,
      (chunk: Buffer, push) => {
        buffer += chunk.toString('utf-8');

        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) pushLine(line, push);
      },
      (push) => {
        // Flush remaining buffer on stream end
        pushLine(buffer, push);
      },
    );

    yield* iterator;
  }
}

// ── Utility ───────────────────────────────────────────────────────

/**
 * Argv actually handed to the binary.
 *
 * {@link buildArgs} already places the prompt as a positional, so this normally
 * returns `args` unchanged. It appends {@link ExecuteOptions.prompt} only when
 * argv does not contain that exact string — the safety net for a caller that
 * built flags without a positional. Two identical strings (a prompt equal to a
 * flag value) are indistinguishable here, and collapsing them is the harmless
 * direction: the prompt was already on the command line.
 */
function withPrompt(args: readonly string[], prompt: string | undefined): string[] {
  if (!prompt || args.includes(prompt)) return [...args];
  return [...args, prompt];
}

/** Whether the process is still alive, i.e. it is safe to signal it. */
function isRunning(child: ChildProcess): boolean {
  return !child.killed && child.exitCode === null && child.signalCode === null;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

/**
 * Creates an async iterator from a child process stdout.
 * Handles backpressure, errors, and process exit.
 *
 * Both callbacks emit through `push`, so a single chunk — or the trailing
 * unterminated line handed to `onEnd` — may yield any number of items.
 */
function createAsyncIterator<T>(
  child: ChildProcess,
  onData: (chunk: Buffer, push: (item: T) => void) => void,
  onEnd: (push: (item: T) => void) => void,
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const queue: T[] = [];
      let resolve: ((value: IteratorResult<T>) => void) | null = null;
      let done = false;
      let error: Error | null = null;

      const push = (item: T) => {
        if (resolve) {
          const r = resolve;
          resolve = null;
          r({ value: item, done: false });
        } else {
          queue.push(item);
        }
      };

      child.stdout!.on('data', (chunk: Buffer) => {
        onData(chunk, push);
      });

      child.stderr!.on('data', (chunk: Buffer) => {
        // Capture stderr but don't fail — CLI may log warnings there
        const text = chunk.toString('utf-8').trim();
        if (text) {
          push({ type: EVENT_SYSTEM, subtype: SYSTEM_STDERR, data: { text } } as T);
        }
      });

      const finish = () => {
        if (done) return;
        done = true;

        onEnd(push);

        if (resolve) {
          const r = resolve;
          resolve = null;
          r({ value: undefined as T, done: true });
        }
      };

      child.on('close', finish);
      child.on('error', (err) => {
        error = err;
        finish();
      });

      return {
        next(): Promise<IteratorResult<T>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          // `error` is checked BEFORE `done`: the 'error' handler calls finish(),
          // which sets `done`, so testing `done` first would report a failed
          // spawn as a clean end-of-stream and swallow the error.
          if (error) {
            return Promise.reject(error);
          }
          if (done) {
            return Promise.resolve({ value: undefined as T, done: true });
          }
          return new Promise((r) => {
            resolve = r;
          });
        },
      };
    },
  };
}
