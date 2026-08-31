/**
 * In-memory stand-in for `@anthropic-ai/claude-agent-sdk`.
 *
 * The real module is replaced per test file with:
 *
 * ```ts
 * vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
 *   const { createSdkModuleMock } = await import('./helpers/sdk-mock.js')
 *   return createSdkModuleMock()
 * })
 * ```
 *
 * and the recorded traffic is read back through the {@link sdkMock} singleton,
 * which is a plain (unmocked) module and therefore shares one instance with the
 * factory above inside a single test file.
 *
 * Everything here is synchronous-by-construction: no timers, no I/O, no real
 * process. A turn resolves as soon as a user message is pushed onto the input
 * iterable, so every test finishes in well under a millisecond.
 */

/** One recorded `query()` invocation. */
export interface RecordedQuery {
  /** The `prompt` argument — normally the executor's input iterable. */
  readonly prompt: unknown;

  /** The `options` object the executor built, verbatim. */
  readonly options: Record<string, unknown>;
}

/** One recorded control-protocol call on the fake `Query`, or a session helper. */
export interface RecordedCall {
  /** Method name, e.g. `'setModel'` or `'renameSession'`. */
  readonly method: string;

  /** Positional arguments, verbatim. */
  readonly args: readonly unknown[];
}

/** Default payloads returned by the fake control methods. */
function defaultReturns(): Record<string, unknown> {
  return {
    initializationResult: {
      commands: [{ name: 'help', description: 'Show help', 'argument-hint': null }],
      agents: [{ agentType: 'Explore', whenToUse: 'fast search', tools: ['Read'], source: 'built-in' }],
      output_style: 'concise',
      available_output_styles: ['concise', 'verbose'],
      models: [{ value: 'sonnet', displayName: 'Sonnet', description: 'Fast' }],
      account: { email: 'dev@example.com', subscriptionType: 'max' },
      hooks_applied: 3,
      fast_mode_state: 'available',
      fast_mode_disabled_reason: undefined,
    },
    reloadPlugins: {
      commands: [{ name: 'deploy' }],
      agents: [{ agentType: 'Deployer' }],
      plugins: [{ name: 'ops', path: '/plugins/ops' }],
      mcpServers: [{ name: 'github', status: 'connected' }],
      error_count: 2,
    },
    reloadSkills: { skills: [{ name: 'pdf' }, { name: 'xlsx' }] },
    getContextUsage: {
      model: 'sonnet',
      totalTokens: 42_000,
      rawMaxTokens: 200_000,
      percentage: 21,
      categories: [{ name: 'System prompt', tokens: 1_200, kind: 'system' }],
      mcpTools: [],
      memoryFiles: [],
      agents: [],
      apiUsage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 7,
      },
    },
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: {
      session: {
        total_cost_usd: 1.25,
        total_api_duration_ms: 900,
        total_duration_ms: 1_500,
        total_lines_added: 30,
        total_lines_removed: 4,
        model_usage: {
          sonnet: {
            inputTokens: 100,
            outputTokens: 200,
            cacheReadInputTokens: 10,
            cacheCreationInputTokens: 20,
            webSearchRequests: 1,
            costUSD: 0.5,
            contextWindow: 200_000,
            maxOutputTokens: 64_000,
            canonicalModel: 'claude-sonnet',
            provider: 'anthropic',
            costBasis: 'api',
          },
        },
      },
      subscription_type: 'max',
      rate_limits_available: true,
      rate_limits: {
        five_hour: { utilization: 12, resets_at: '2026-08-31T12:00:00Z', display_name: '5h' },
        seven_day: null,
        model_scoped: [{ utilization: 3, resets_at: null, display_name: 'opus' }],
        extra_usage: {
          is_enabled: true,
          monthly_limit: 100,
          used_credits: 25,
          utilization: 25,
          currency: 'USD',
        },
      },
      behaviors: {
        day: {
          request_count: 5,
          session_count: 2,
          behaviors: ['plan'],
          agents: ['Explore'],
          skills: ['pdf'],
          plugins: ['ops'],
          mcp_servers: ['github'],
        },
        week: {
          request_count: 40,
          session_count: 9,
          behaviors: [],
          agents: [],
          skills: [],
          plugins: [],
          mcp_servers: [],
        },
      },
    },
    readFile: { content: 'file body', truncated: false, encoding: 'utf-8' },
    setMcpPermissionModeOverride: { ok: true },
    backgroundTasks: true,
    interrupt: { still_queued: ['queued-1'], cancelled: 2 },
    rewindFiles: { canRewind: true, filesChanged: ['src/a.ts'], insertions: 3, deletions: 1 },
    setMcpServers: { added: ['srv'], removed: [], errors: {} },
    accountInfo: { email: 'dev@example.com', subscriptionType: 'max' },
    supportedModels: [{ value: 'sonnet', displayName: 'Sonnet', description: 'Fast' }],
    supportedCommands: [{ name: 'help' }],
    supportedAgents: [{ agentType: 'Explore' }],
    mcpServerStatus: [{ name: 'github', status: 'connected' }],
    // Session helpers exported by the SDK module itself.
    forkSession: { sessionId: 'forked-session' },
    getSessionInfo: { sessionId: 'sess-1', summary: 'An audit', lastModified: 1 },
    getSessionMessages: [{ type: 'user', uuid: 'm1' }],
    listSubagents: ['agent-a', 'agent-b'],
    getSubagentMessages: [{ type: 'assistant', uuid: 'm2' }],
  };
}

/** The two messages a turn produces when a test does not supply its own. */
function defaultTurn(): readonly unknown[] {
  return [
    { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } },
    {
      type: 'result',
      subtype: 'success',
      result: 'ok',
      session_id: 'mock-session',
      usage: { input_tokens: 1, output_tokens: 2 },
      total_cost_usd: 0.01,
      duration_ms: 5,
    },
  ];
}

/**
 * Recording + scripting surface shared by a test file and its module mock.
 *
 * One instance per test file (vitest gives every file its own module registry),
 * so `reset()` in a `beforeEach` is enough to isolate cases.
 */
class SdkMock {
  /** Every `query()` call, in order. */
  queries: RecordedQuery[] = [];

  /** Every control-protocol / session-helper call, in order. */
  calls: RecordedCall[] = [];

  /** Messages the fake session emits per turn. `null` uses {@link defaultTurn}. */
  responses: readonly unknown[] | null = null;

  /**
   * Hold a turn's messages back until `interrupt()` arrives, the way the real
   * CLI does when a turn is cancelled mid-flight.
   */
  holdUntilInterrupt = false;

  /**
   * How many `interrupt()` calls the fake session ignores before the cancel
   * takes effect. Stands in for the real gap between `ensureReady()` and the
   * CLI picking up the turn, where there is nothing yet to interrupt.
   */
  ignoreInterrupts = 0;

  /** Return values by method name; overwrite one to script a response. */
  returns: Record<string, unknown> = defaultReturns();

  /** Number of live (not closed) fake queries — leak detector for `close()`. */
  openQueries = 0;

  private gateResolve: (() => void) | null = null;
  private gatePromise: Promise<void> | null = null;

  reset(): void {
    this.queries = [];
    this.calls = [];
    this.responses = null;
    this.holdUntilInterrupt = false;
    this.ignoreInterrupts = 0;
    this.returns = defaultReturns();
    this.openQueries = 0;
    this.gateResolve = null;
    this.gatePromise = null;
  }

  /** Options handed to the most recent `query()` call. */
  lastOptions(): Record<string, unknown> {
    const last = this.queries.at(-1);
    if (!last) throw new Error('sdkMock: query() was never called');
    return last.options;
  }

  /** Every recorded call to one method. */
  callsTo(method: string): RecordedCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  /** Arguments of the first recorded call to one method. */
  argsOf(method: string): readonly unknown[] {
    const call = this.callsTo(method)[0];
    if (!call) throw new Error(`sdkMock: ${method}() was never called`);
    return call.args;
  }

  /** Whether a method was called at least once. */
  called(method: string): boolean {
    return this.callsTo(method).length > 0;
  }

  /** Record a call and resolve its scripted return value. */
  record(method: string, args: readonly unknown[]): unknown {
    this.calls.push({ method, args });
    return this.returns[method];
  }

  /** Await the interrupt gate — resolved immediately when it is already open. */
  gate(): Promise<void> {
    this.gatePromise ??= new Promise<void>((resolve) => { this.gateResolve = resolve; });
    return this.gatePromise;
  }

  /** Open the interrupt gate so a held turn completes. */
  openGate(): void {
    this.gatePromise ??= Promise.resolve();
    this.gateResolve?.();
    this.gateResolve = null;
  }
}

/** Singleton shared between a test file and its `vi.mock` factory. */
export const sdkMock = new SdkMock();

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

/** Build one fake `Query` for a `query()` call. */
function createQuery(prompt: unknown): Record<string, unknown> {
  let closed = false;
  const waiting: Array<(step: IteratorResult<unknown>) => void> = [];
  const backlog: unknown[] = [];
  sdkMock.openQueries++;

  const emit = (message: unknown): void => {
    const next = waiting.shift();
    if (next) next({ value: message, done: false });
    else backlog.push(message);
  };

  if (isAsyncIterable(prompt)) {
    void (async () => {
      for await (const _userMessage of prompt) {
        if (closed) break;
        if (sdkMock.holdUntilInterrupt) await sdkMock.gate();
        for (const message of sdkMock.responses ?? defaultTurn()) emit(message);
      }
    })().catch(() => { /* the executor closed the session */ });
  }

  /**
   * A fake control method: records the call under `method` and resolves the
   * scripted return value stored under `returnsKey` (the method name by default,
   * so `reinitialize` can reuse the `initializationResult` payload).
   */
  const control = (method: string, returnsKey: string = method) =>
    (...args: unknown[]): Promise<unknown> => {
      sdkMock.record(method, args);
      return Promise.resolve(sdkMock.returns[returnsKey]);
    };

  return {
    next(): Promise<IteratorResult<unknown>> {
      if (backlog.length > 0) return Promise.resolve({ value: backlog.shift(), done: false });
      if (closed) return Promise.resolve({ value: undefined, done: true });
      return new Promise((resolve) => waiting.push(resolve));
    },
    // The real Query keeps the session alive across `for await ... break`.
    return(): Promise<IteratorResult<unknown>> {
      return Promise.resolve({ value: undefined, done: true });
    },
    throw(error: Error): Promise<IteratorResult<unknown>> {
      closed = true;
      return Promise.reject(error);
    },
    [Symbol.asyncIterator]() { return this; },

    close(): void {
      if (!closed) sdkMock.openQueries--;
      closed = true;
      sdkMock.record('close', []);
      for (const resolve of waiting.splice(0)) resolve({ value: undefined, done: true });
    },

    interrupt(): Promise<unknown> {
      const receipt = sdkMock.record('interrupt', []);
      if (sdkMock.ignoreInterrupts > 0) sdkMock.ignoreInterrupts--;
      else sdkMock.openGate();
      return Promise.resolve(receipt);
    },

    setModel: control('setModel'),
    setPermissionMode: control('setPermissionMode'),
    setMaxThinkingTokens: control('setMaxThinkingTokens'),
    applyFlagSettings: control('applyFlagSettings'),
    rewindFiles: control('rewindFiles'),
    seedReadState: control('seedReadState'),
    readFile: control('readFile'),
    stopTask: control('stopTask'),
    backgroundTasks: control('backgroundTasks'),
    setMcpServers: control('setMcpServers'),
    reconnectMcpServer: control('reconnectMcpServer'),
    toggleMcpServer: control('toggleMcpServer'),
    setMcpPermissionModeOverride: control('setMcpPermissionModeOverride'),
    accountInfo: control('accountInfo'),
    supportedModels: control('supportedModels'),
    supportedCommands: control('supportedCommands'),
    supportedAgents: control('supportedAgents'),
    mcpServerStatus: control('mcpServerStatus'),
    initializationResult: control('initializationResult'),
    reinitialize: control('reinitialize', 'initializationResult'),
    reloadPlugins: control('reloadPlugins'),
    reloadSkills: control('reloadSkills'),
    getContextUsage: control('getContextUsage'),
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: control(
      'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET',
    ),
    streamInput: control('streamInput'),
  };
}

/** The module shape `vi.mock('@anthropic-ai/claude-agent-sdk')` should return. */
export function createSdkModuleMock(): Record<string, unknown> {
  const helper = (method: string) => (...args: unknown[]): Promise<unknown> =>
    Promise.resolve(sdkMock.record(method, args));

  return {
    query(params: { prompt: unknown; options: Record<string, unknown> }) {
      sdkMock.queries.push({ prompt: params.prompt, options: params.options ?? {} });
      return createQuery(params.prompt);
    },
    renameSession: helper('renameSession'),
    tagSession: helper('tagSession'),
    deleteSession: helper('deleteSession'),
    forkSession: helper('forkSession'),
    getSessionInfo: helper('getSessionInfo'),
    getSessionMessages: helper('getSessionMessages'),
    listSubagents: helper('listSubagents'),
    getSubagentMessages: helper('getSubagentMessages'),
  };
}

/** A `result` message, so a scripted turn terminates the executor's read loop. */
export function resultMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'result',
    subtype: 'success',
    result: 'done',
    session_id: 'mock-session',
    usage: { input_tokens: 1, output_tokens: 2 },
    total_cost_usd: 0.01,
    duration_ms: 5,
    ...overrides,
  };
}
