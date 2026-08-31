import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { HookEvent as SdkHookEvent } from '@anthropic-ai/claude-agent-sdk';
import { VALID_HOOK_EVENTS } from '../src/constants.js';
import type {
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  HookJSONOutput,
  SyncHookJSONOutput,
  UnknownHookInput,
} from '../src/types/hooks.js';
import type { ClientOptions } from '../src/types/client.js';

/**
 * The hook surface added by the 0.3.x parity work.
 *
 * Three things are checked, and they are deliberately redundant:
 *
 * 1. a **type-level** assertion that `HookEvent` and the SDK's own `HookEvent`
 *    are the same union (compile-time only — it is here so an editor and any
 *    `tsc` run over `tests/` catch drift);
 * 2. a **runtime** comparison of `VALID_HOOK_EVENTS` against the union parsed
 *    out of the SDK's own `sdk.d.ts`, which is what actually executes;
 * 3. a **structural** check that every literal is registerable on
 *    `hookCallbacks` and that inputs narrow under `switch`.
 */

// ── Type-level equality ────────────────────────────────────────────

/** `true` only when `A` and `B` are the same type, mutually assignable. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;

/** Compiles only when `T` is exactly `true`. */
type Expect<T extends true> = T;

// Fails to compile the moment the library union and the SDK union diverge.
type _HookEventsMatchSdk = Expect<Equal<HookEvent, SdkHookEvent>>;

// Every member of the runtime list is a valid `HookEvent`, and vice versa.
type _RuntimeListIsHookEvent = Expect<Equal<(typeof VALID_HOOK_EVENTS)[number], HookEvent>>;

// ── The 33 literals, spelled out ───────────────────────────────────

/**
 * The SDK's `HookEvent` union, transcribed by hand in declaration order.
 * Typed as `HookEvent[]`, so a typo is a compile error as well as a test
 * failure.
 */
const EXPECTED_HOOK_EVENTS: readonly HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'Notification',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PreModelSwitch',
  'PostModelSwitch',
  'PermissionRequest',
  'PermissionDenied',
  'Setup',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'Elicitation',
  'ElicitationResult',
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
  'InstructionsLoaded',
  'CwdChanged',
  'FileChanged',
  'DirectoryAdded',
  'MessageDisplay',
];

/** `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, next to `sdk.mjs`. */
const SDK_DTS = fileURLToPath(
  new URL('../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts', import.meta.url),
);

/** Pull the string literals out of the SDK's `HookEvent` declaration. */
function sdkHookEventLiterals(): string[] {
  const source = readFileSync(SDK_DTS, 'utf-8');
  const declaration = /export declare type HookEvent =([^;]*);/.exec(source);
  if (!declaration?.[1]) {
    throw new Error(`No "export declare type HookEvent" declaration found in ${SDK_DTS}`);
  }
  return [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]!);
}

describe('VALID_HOOK_EVENTS vs the SDK HookEvent union', () => {
  it('lists exactly 33 events', () => {
    expect(VALID_HOOK_EVENTS).toHaveLength(33);
    expect(EXPECTED_HOOK_EVENTS).toHaveLength(33);
  });

  it('matches the hand-transcribed union, in order', () => {
    expect([...VALID_HOOK_EVENTS]).toEqual(EXPECTED_HOOK_EVENTS);
  });

  it('has no duplicates', () => {
    expect(new Set(VALID_HOOK_EVENTS).size).toBe(VALID_HOOK_EVENTS.length);
  });

  it.skipIf(!existsSync(SDK_DTS))('matches the SDK declaration exactly', () => {
    const fromSdk = sdkHookEventLiterals();

    // Same members, and same declaration order — the constant documents itself
    // as "in SDK declaration order".
    expect(fromSdk).toEqual([...VALID_HOOK_EVENTS]);
  });
});

describe('hookCallbacks accepts every HookEvent literal', () => {
  const noop: HookCallback = async () => ({ continue: true });
  const matcher: HookCallbackMatcher = { hooks: [noop] };

  it('registers all 33 events on ClientOptions.hookCallbacks', () => {
    const hookCallbacks: NonNullable<ClientOptions['hookCallbacks']> = Object.fromEntries(
      VALID_HOOK_EVENTS.map((event) => [event, [matcher]]),
    ) as NonNullable<ClientOptions['hookCallbacks']>;

    const options: ClientOptions = { hookCallbacks };

    expect(Object.keys(options.hookCallbacks!)).toHaveLength(33);
    for (const event of VALID_HOOK_EVENTS) {
      expect(options.hookCallbacks![event]).toEqual([matcher]);
    }
  });

  it('accepts a per-event literal key without a cast', () => {
    // Each key below is checked against `HookEvent` by the compiler; an event
    // dropped from the union would stop compiling here.
    const options: ClientOptions = {
      hookCallbacks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [noop] }],
        PostToolBatch: [matcher],
        UserPromptExpansion: [matcher],
        StopFailure: [matcher],
        PostCompact: [matcher],
        PreModelSwitch: [matcher],
        PostModelSwitch: [matcher],
        PermissionDenied: [matcher],
        TaskCreated: [matcher],
        CwdChanged: [matcher],
        FileChanged: [matcher],
        DirectoryAdded: [matcher],
        MessageDisplay: [matcher],
      },
    };

    expect(options.hookCallbacks!.PreToolUse?.[0]?.matcher).toBe('Bash');
    expect(Object.keys(options.hookCallbacks!)).toHaveLength(13);
  });
});

describe('HookInput narrows under switch (input.hook_event_name)', () => {
  /**
   * Reads one event-specific field per branch. Everything here is a compile
   * error unless the union really is discriminated on `hook_event_name`.
   */
  function describeInput(input: HookInput): string {
    switch (input.hook_event_name) {
      case 'PreToolUse':
        return `pre:${input.tool_name}:${input.tool_use_id}`;
      case 'PostToolUse':
        return `post:${input.tool_name}`;
      case 'PostToolUseFailure':
        return `fail:${input.tool_name}`;
      case 'PostToolBatch':
        return `batch:${input.tool_calls.length}`;
      case 'PermissionDenied':
        return `denied:${input.tool_name}`;
      case 'Notification':
        return `notify:${input.message}`;
      case 'UserPromptSubmit':
        return `submit:${input.prompt}`;
      case 'UserPromptExpansion':
        return `expand:${input.prompt}`;
      case 'SessionStart':
        return `start:${input.source}`;
      case 'SessionEnd':
        return `end:${input.reason}`;
      case 'StopFailure':
        return `stopfail:${input.error}`;
      case 'SubagentStart':
        return `subagent:${input.agent_type}`;
      case 'PreCompact':
        return `precompact:${input.trigger}`;
      case 'PostCompact':
        return `postcompact:${input.trigger}`;
      case 'PreModelSwitch':
        return `premodel:${input.to_model}`;
      case 'PostModelSwitch':
        return `postmodel:${input.to_model}`;
      case 'PermissionRequest':
        return `request:${input.tool_name}`;
      case 'TaskCreated':
        return `task:${input.task_id}`;
      case 'CwdChanged':
        return `cwd:${input.new_cwd}`;
      case 'FileChanged':
        return `file:${input.file_path}`;
      case 'DirectoryAdded':
        return `dir:${input.directory}`;
      case 'MessageDisplay':
        return input.final ? 'display:final' : `display:${input.delta}`;
      default:
        // The union's remaining members still carry the base fields.
        return `other:${input.hook_event_name}:${input.session_id}`;
    }
  }

  const base = {
    session_id: 'sess-1',
    transcript_path: '/tmp/t.jsonl',
    cwd: '/repo',
    permission_mode: 'default',
  } as const;

  it('narrows PreToolUse to its tool fields', () => {
    const input = {
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'tu-1',
    } as HookInput;

    expect(describeInput(input)).toBe('pre:Bash:tu-1');
  });

  it('narrows the events added in 0.3.x', () => {
    const cases: Array<[HookInput, string]> = [
      [{ ...base, hook_event_name: 'PostToolBatch', tool_calls: [] } as unknown as HookInput, 'batch:0'],
      [{ ...base, hook_event_name: 'UserPromptExpansion', prompt: 'hi' } as unknown as HookInput, 'expand:hi'],
      [{ ...base, hook_event_name: 'StopFailure', error: 'overloaded' } as unknown as HookInput, 'stopfail:overloaded'],
      [{ ...base, hook_event_name: 'PostCompact', trigger: 'auto' } as unknown as HookInput, 'postcompact:auto'],
      [{ ...base, hook_event_name: 'PreModelSwitch', to_model: 'opus' } as unknown as HookInput, 'premodel:opus'],
      [{ ...base, hook_event_name: 'PostModelSwitch', to_model: 'opus' } as unknown as HookInput, 'postmodel:opus'],
      [{ ...base, hook_event_name: 'PermissionDenied', tool_name: 'Write' } as unknown as HookInput, 'denied:Write'],
      [{ ...base, hook_event_name: 'TaskCreated', task_id: 't-9' } as unknown as HookInput, 'task:t-9'],
      [{ ...base, hook_event_name: 'CwdChanged', new_cwd: '/other' } as unknown as HookInput, 'cwd:/other'],
      [{ ...base, hook_event_name: 'FileChanged', file_path: '/a.ts' } as unknown as HookInput, 'file:/a.ts'],
      [{ ...base, hook_event_name: 'DirectoryAdded', directory: '/pkg' } as unknown as HookInput, 'dir:/pkg'],
      [
        { ...base, hook_event_name: 'MessageDisplay', delta: 'chunk', final: false } as unknown as HookInput,
        'display:chunk',
      ],
    ];

    for (const [input, expected] of cases) {
      expect(describeInput(input)).toBe(expected);
    }
  });

  it('falls through to the base fields for observe-only events', () => {
    const input = { ...base, hook_event_name: 'TeammateIdle' } as unknown as HookInput;

    expect(describeInput(input)).toBe('other:TeammateIdle:sess-1');
  });

  it('reads unmodelled fields through UnknownHookInput without breaking narrowing', () => {
    const input = {
      ...base,
      hook_event_name: 'SomeFutureEvent',
      future_field: 42,
    } as unknown as HookInput;

    const raw = input as unknown as UnknownHookInput;

    expect(raw['future_field']).toBe(42);
    expect(describeInput(input)).toBe('other:SomeFutureEvent:sess-1');
  });
});

describe('hookSpecificOutput round-trips', () => {
  it('carries a PreToolUse decision through a HookCallback', async () => {
    const deny: HookCallback = async (input) => {
      if (input.hook_event_name !== 'PreToolUse') return {};
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'no shelling out',
        },
      };
    };

    const output = await deny(
      {
        session_id: 's',
        transcript_path: '/t',
        cwd: '/',
        permission_mode: 'default',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
        tool_use_id: 'tu-1',
      } as HookInput,
      'tu-1',
      { signal: new AbortController().signal },
    );

    const sync = output as SyncHookJSONOutput;
    expect(sync.hookSpecificOutput).toEqual({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'no shelling out',
    });

    // The discriminator narrows the output half too.
    if (sync.hookSpecificOutput?.hookEventName === 'PreToolUse') {
      expect(sync.hookSpecificOutput.permissionDecision).toBe('deny');
    } else {
      throw new Error('hookSpecificOutput did not narrow to PreToolUse');
    }
  });

  it('round-trips a FileChanged output', () => {
    const output: SyncHookJSONOutput = {
      hookSpecificOutput: { hookEventName: 'FileChanged', watchPaths: ['/a.ts', '/b.ts'] },
    };

    expect(output.hookSpecificOutput).toMatchObject({
      hookEventName: 'FileChanged',
      watchPaths: ['/a.ts', '/b.ts'],
    });
  });

  it('accepts the async acknowledgement form', () => {
    const output: HookJSONOutput = { async: true, asyncTimeout: 5_000 };

    expect(output).toEqual({ async: true, asyncTimeout: 5_000 });
    expect('hookSpecificOutput' in output).toBe(false);
  });
});
