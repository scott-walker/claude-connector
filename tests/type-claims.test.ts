import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type {
  AgentConfig,
  ClientOptions,
  McpSdkServerConfig,
  McpSdkServerStatusConfig,
  McpServerStatusConfig,
  QueryOptions,
} from '../src/types/client.js';
import type { SessionOptions } from '../src/types/session.js';
import type { HookEvent, HookMatcher, HooksConfig } from '../src/types/hooks.js';

/**
 * Guards for the type-surface fixes of 0.7.0.
 *
 * The theme is that a JSDoc claim is part of the contract: a field documented
 * as "CLI mode only" that SDK mode forwards, or an event documented as "SDK
 * mode only" that the CLI parser emits, is a defect even though it compiles.
 * Most of what follows therefore reads the sources and checks the prose against
 * the wiring, rather than exercising behaviour.
 */

// ── Source access ──────────────────────────────────────────────────

const src = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), 'utf-8');

const CLIENT_TYPES = src('types/client.ts');
const RESULT_TYPES = src('types/result.ts');
const HOOK_TYPES = src('types/hooks.ts');
const SDK_OPTIONS = src('client/sdk-options.ts');
const ARGS_BUILDER = src('builder/args-builder.ts');
const STREAM_PARSER = src('parser/stream-parser.ts');

/** Slice a source file between two anchors, failing loudly if either moved. */
function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  if (from === -1) throw new Error(`anchor not found: ${start}`);
  const to = source.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`closing anchor not found: ${end}`);
  return source.slice(from, to);
}

/** Drop comments, so prose naming an option never counts as wiring. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Every field of one interface, paired with the JSDoc block above it.
 * Good enough for a hand-written declaration file, which this is.
 */
function documentedFields(source: string, interfaceName: string): Map<string, string> {
  const body = section(source, `export interface ${interfaceName} {`, '\n}');
  const fields = new Map<string, string>();
  const pattern = /(\/\*\*[\s\S]*?\*\/|\/\*\*.*?\*\/)?\s*readonly (\w+)\??:/g;

  for (const match of body.matchAll(pattern)) {
    fields.set(match[2]!, match[1] ?? '');
  }
  return fields;
}

// ── 1. McpServerStatusConfig vs the wire ───────────────────────────

describe('McpSdkServerConfig split', () => {
  it('types an sdk-transport status row, which carries no instance', () => {
    // The CLI reports the transport by name; the live server object cannot
    // travel over the wire. This is the assignment that used to be TS2322.
    const wire: McpServerStatusConfig = { type: 'sdk', name: 'my-tools' };
    expect(wire).toEqual({ type: 'sdk', name: 'my-tools' });

    const narrowed = wire as Extract<McpServerStatusConfig, { type: 'sdk' }>;
    expect('instance' in narrowed).toBe(false);
  });

  it('keeps the instance on the configurable form', () => {
    const configured: McpSdkServerConfig = { type: 'sdk', name: 'my-tools', instance: {} };
    expect(configured.instance).toEqual({});

    // The configurable form is still accepted wherever servers are declared.
    const options: ClientOptions = { mcpServers: { tools: configured } };
    expect(options.mcpServers?.['tools']).toBe(configured);

    // ...and it is a status config too, since it satisfies the instance-less shape.
    const status: McpSdkServerStatusConfig = configured;
    expect(status.name).toBe('my-tools');
  });

  it('does not let a status row stand in for a configured server', () => {
    const wire = { type: 'sdk', name: 'my-tools' } as const;
    // @ts-expect-error — `instance` is required to configure a server.
    const configured: McpSdkServerConfig = wire;
    expect(configured.name).toBe('my-tools');
  });
});

// ── 2. Stream-event mode claims vs the CLI parser ──────────────────

describe('stream event JSDoc vs the CLI parser', () => {
  /** `EVENT_*` constants the CLI stream parser can emit. */
  const parserEvents = new Set(
    [...STREAM_PARSER.matchAll(/type: (EVENT_[A-Z_]+)/g)].map((match) => match[1]!),
  );

  /** Each `Stream*Event` interface, with the JSDoc block above it. */
  const eventDocs = [
    ...RESULT_TYPES.matchAll(
      /(\/\*\*[\s\S]*?\*\/)\s*export interface (Stream\w*Event) \{\s*readonly type: typeof (EVENT_[A-Z_]+);/g,
    ),
  ].map((match) => ({ doc: match[1]!, name: match[2]!, event: match[3]! }));

  it('found the event interfaces to check', () => {
    expect(eventDocs.length).toBeGreaterThan(20);
    expect(parserEvents.size).toBeGreaterThan(20);
  });

  it('never says "SDK mode only" about an event the CLI parser produces', () => {
    const lying = eventDocs
      .filter((entry) => parserEvents.has(entry.event))
      .filter((entry) => /SDK mode only\./.test(entry.doc))
      .map((entry) => entry.name);

    expect(lying).toEqual([]);
  });

  it('produces StreamInitEvent in CLI mode — the starkest case', () => {
    // `init` is the CLI's own first stream-json line, so a handler registered
    // in CLI mode does fire.
    expect(parserEvents.has('EVENT_INIT')).toBe(true);
  });
});

// ── 3. HooksConfig: completion yes, typo-checking no ───────────────

describe('HooksConfig forward-compat hatch', () => {
  const matcher: HookMatcher = { hooks: [{ type: 'command', command: 'true' }] };

  it('accepts an event name this library does not know', () => {
    // The index signature is deliberate — events newer than this library stay
    // usable — and it is why a typo compiles too.
    const config: HooksConfig = { PreToolUseX: [matcher] };
    expect(Object.keys(config)).toEqual(['PreToolUseX']);
  });

  it('rejects the same typo when the object is annotated as a HookEvent record', () => {
    const strict: Partial<Record<HookEvent, readonly HookMatcher[]>> = {
      // @ts-expect-error — the documented way to have the compiler catch typos.
      PreToolUseX: [matcher],
    };
    expect(strict).toBeTruthy();
  });

  it('does not promise typo-checking it cannot deliver', () => {
    const doc = section(HOOK_TYPES, ' * Shell-command hook configuration', 'export type HooksConfig');
    expect(doc).not.toMatch(/typo-checked/);
    expect(doc).toMatch(/misspelled/);
  });
});

// ── 4. ClientOptions mode claims vs the actual wiring ──────────────

describe('ClientOptions mode claims', () => {
  const fields = documentedFields(CLIENT_TYPES, 'ClientOptions');

  /** The one module client options reach SDK mode through. */
  const toSdk = stripComments(SDK_OPTIONS);

  /** The one place client options reach CLI argv. */
  const merge = stripComments(section(ARGS_BUILDER, 'export function mergeOptions', '\n}'));

  const reachesSdk = (field: string): boolean =>
    new RegExp(`options\\.${field}\\b`).test(toSdk);
  const reachesCli = (field: string): boolean =>
    new RegExp(`client\\.${field}\\b`).test(merge);

  /**
   * Fields that reach a mode by a route these two anchors do not cover.
   *
   * - `useSdk` picks the executor and is not an option of either.
   * - `executable` is the binary CLI mode spawns, read straight off the client.
   * - `env` goes through `resolveEnv()` rather than `mergeOptions()`.
   */
  const OFF_ROUTE = new Set(['useSdk', 'executable', 'env']);

  it('found both wiring sites and the field list', () => {
    expect(fields.size).toBeGreaterThan(60);
    expect(toSdk).toContain('pathToClaudeCodeExecutable');
    expect(merge).toContain('outputFormat');
  });

  it('marks every field SDK mode drops as CLI mode only', () => {
    const undocumented = [...fields]
      .filter(([name]) => !OFF_ROUTE.has(name))
      .filter(([name]) => !reachesSdk(name))
      .filter(([, doc]) => !/CLI mode only/.test(doc))
      .map(([name]) => name);

    expect(undocumented).toEqual([]);
  });

  it('marks every field CLI mode drops as SDK mode only', () => {
    const undocumented = [...fields]
      .filter(([name]) => !OFF_ROUTE.has(name))
      .filter(([name]) => !reachesCli(name))
      .filter(([, doc]) => !/SDK mode only/.test(doc))
      .map(([name]) => name);

    expect(undocumented).toEqual([]);
  });

  it('never claims "CLI mode only" for a field SDK mode forwards', () => {
    const overclaimed = [...fields]
      .filter(([, doc]) => /CLI mode only/.test(doc))
      .filter(([name]) => reachesSdk(name))
      .map(([name]) => name);

    expect(overclaimed).toEqual([]);
  });

  it('never claims "SDK mode only" for a field CLI mode emits', () => {
    const overclaimed = [...fields]
      .filter(([, doc]) => /SDK mode only/.test(doc))
      .filter(([name]) => reachesCli(name))
      .map(([name]) => name);

    expect(overclaimed).toEqual([]);
  });

  it('no longer calls settingSources SDK-only, since CLI mode emits it', () => {
    expect(fields.get('settingSources')).not.toMatch(/SDK mode only/);
    expect(merge).toContain('client.settingSources');
    expect(ARGS_BUILDER).toContain('FLAG_SETTING_SOURCES');
  });
});

// ── 5. QueryOptions overrides that no mode honours ─────────────────

describe('QueryOptions inert overrides', () => {
  const fields = documentedFields(CLIENT_TYPES, 'QueryOptions');

  it('marks skills as inert and never emits a --skills flag', () => {
    expect(fields.get('skills')).toMatch(/Inert in both modes/);
    expect(ARGS_BUILDER).not.toMatch(/--skills/);
    expect(src('constants.ts')).not.toMatch(/'--skills'/);
  });

  it('marks background as inert, because --background conflicts with --print', () => {
    expect(fields.get('background')).toMatch(/Inert in both modes/);
    // Declared as a constant, deliberately never pushed onto argv.
    expect(ARGS_BUILDER).not.toMatch(/args\.push\(FLAG_BACKGROUND/);
  });

  it('still accepts both fields, so the public API is unbroken', () => {
    const options: QueryOptions = { skills: ['pdf'], background: true };
    expect(options.skills).toEqual(['pdf']);
    expect(options.background).toBe(true);
  });

  it('no longer says per-query thinking is SDK mode only', () => {
    expect(fields.get('thinking')).not.toMatch(/SDK mode only/);
    expect(ARGS_BUILDER).toContain('FLAG_THINKING');
  });
});

// ── 5b. Which per-query overrides SDK mode really bridges ──────────

describe('QueryOptions bridging claims', () => {
  const fields = documentedFields(CLIENT_TYPES, 'QueryOptions');

  /**
   * `SdkExecutor` reads a bridged per-query override off `ExecuteOptions`, and
   * `options.<field>` is that read. Nothing else in the executor destructures a
   * bare `options`, so the whole file is a safe haystack — and a stable one,
   * unlike an anchor inside a method that keeps being refactored.
   */
  const executor = stripComments(src('executor/sdk-executor.ts'));
  const bridges = (field: string): boolean =>
    new RegExp(`\\boptions\\.${field}\\b`).test(executor);

  /**
   * Two fields are neither bridged nor ignored, and each says so in its own
   * words: `systemPrompt` is folded into the prompt text, since SDK mode cannot
   * replace a running session's prompt, and `signal` cancels the turn in both
   * modes rather than overriding anything.
   */
  const SPECIAL_CASED = new Set(['systemPrompt', 'signal']);

  it('bridges every field it claims to bridge', () => {
    const unbridged = [...fields]
      .filter(([name]) => !SPECIAL_CASED.has(name))
      .filter(([, doc]) => /Bridged in both modes/.test(doc))
      .filter(([name]) => !bridges(name))
      .map(([name]) => name);

    expect(unbridged).toEqual([]);
  });

  it('bridges nothing it claims to ignore', () => {
    const overlooked = [...fields]
      .filter(([name]) => !SPECIAL_CASED.has(name))
      .filter(([, doc]) => /Ignored in SDK mode|CLI mode only|Inert in both modes/.test(doc))
      .filter(([name]) => bridges(name))
      .map(([name]) => name);

    expect(overlooked).toEqual([]);
  });

  it('says something about the mode reach of every per-query field', () => {
    const silent = [...fields]
      .filter(([name]) => !SPECIAL_CASED.has(name))
      .filter(([, doc]) => !/Bridged in both modes|Ignored in SDK mode|CLI mode only|Inert in both modes/.test(doc))
      .map(([name]) => name);

    expect(silent).toEqual([]);
  });
});

// ── 6. SessionOptions truncating resume ────────────────────────────

describe('SessionOptions', () => {
  it('accepts the truncating-resume fields', () => {
    const options: SessionOptions = {
      resume: 'a2f0c9de-0000-4000-8000-000000000000',
      resumeSessionAt: 'b3e1d0ef-0000-4000-8000-000000000000',
      resumeDropsTurn: 'c4f2e1a0-0000-4000-8000-000000000000',
    };

    expect(options.resumeSessionAt).toBe('b3e1d0ef-0000-4000-8000-000000000000');
    expect(options.resumeDropsTurn).toBe('c4f2e1a0-0000-4000-8000-000000000000');
  });

  it('names the same fields the client-level options do', () => {
    const client: ClientOptions = { resumeSessionAt: 'x', resumeDropsTurn: 'y' };
    expect([client.resumeSessionAt, client.resumeDropsTurn]).toEqual(['x', 'y']);
  });
});

// ── 7. AgentConfig.prompt — a recorded deviation ───────────────────

describe('AgentConfig.prompt', () => {
  it('stays optional so the public API is unbroken', () => {
    const agent: AgentConfig = { description: 'reviews diffs' };
    expect(agent.prompt).toBeUndefined();
  });

  it('records that both executors require it anyway', () => {
    const doc = documentedFields(CLIENT_TYPES, 'AgentConfig').get('prompt') ?? '';
    expect(doc).toMatch(/Required in practice/);
    expect(doc).toMatch(/next major/);
  });
});
