import { describe, it, expect } from 'vitest';
import { buildArgs, mergeOptions, resolveEnv } from '../src/builder/args-builder.js';
import type { ClientOptions, QueryOptions } from '../src/types/index.js';

describe('buildArgs', () => {
  it('builds minimal args for a simple prompt', () => {
    const resolved = mergeOptions({}, undefined, {
      prompt: 'Hello',
      outputFormat: 'json',
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--print');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
    expect(args).toContain('Hello');
  });

  it('includes model flag when specified', () => {
    const resolved = mergeOptions({ model: 'opus' }, undefined, {
      prompt: 'Test',
      outputFormat: 'json',
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--model');
    expect(args).toContain('opus');
  });

  it('includes permission mode', () => {
    const resolved = mergeOptions({ permissionMode: 'plan' }, undefined, {
      prompt: 'Test',
      outputFormat: 'json',
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--permission-mode');
    expect(args).toContain('plan');
  });

  it('includes allowed tools', () => {
    const resolved = mergeOptions(
      { allowedTools: ['Read', 'Edit', 'Bash(npm run *)'] },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--allowedTools');
    expect(args).toContain('Read');
    expect(args).toContain('Edit');
    expect(args).toContain('Bash(npm run *)');
  });

  it('includes session resume flag', () => {
    const resolved = mergeOptions({}, undefined, {
      prompt: 'Continue',
      outputFormat: 'json',
      sessionId: 'abc-123',
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--resume');
    expect(args).toContain('abc-123');
  });

  it('includes continue flag', () => {
    const resolved = mergeOptions({}, undefined, {
      prompt: 'Continue',
      outputFormat: 'json',
      continueSession: true,
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--continue');
  });

  it('includes fork-session flag', () => {
    const resolved = mergeOptions({}, undefined, {
      prompt: 'Fork',
      outputFormat: 'json',
      sessionId: 'abc-123',
      forkSession: true,
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--fork-session');
    expect(args).toContain('--resume');
  });

  it('includes max-turns and max-budget', () => {
    const resolved = mergeOptions(
      { maxTurns: 5, maxBudget: 2.5 },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--max-turns');
    expect(args).toContain('5');
    expect(args).toContain('--max-budget-usd');
    expect(args).toContain('2.5');
  });

  it('includes system prompt', () => {
    const resolved = mergeOptions(
      { systemPrompt: 'You are a Go developer' },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--system-prompt');
    expect(args).toContain('You are a Go developer');
  });

  it('includes worktree with name', () => {
    const resolved = mergeOptions({}, { worktree: 'feature-auth' }, {
      prompt: 'Test',
      outputFormat: 'json',
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--worktree');
    expect(args).toContain('feature-auth');
  });

  it('includes worktree without name (boolean)', () => {
    const resolved = mergeOptions({}, { worktree: true }, {
      prompt: 'Test',
      outputFormat: 'json',
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--worktree');
    expect(args).not.toContain('true');
  });

  it('includes json-schema for structured output', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    const resolved = mergeOptions({}, { schema }, {
      prompt: 'Extract',
      outputFormat: 'json',
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--json-schema');
    expect(args).toContain(JSON.stringify(schema));
  });

  it('includes no-session-persistence', () => {
    const resolved = mergeOptions(
      { noSessionPersistence: true },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--no-session-persistence');
  });

  it('includes add-dir for additional directories', () => {
    const resolved = mergeOptions(
      { additionalDirs: ['../lib', '../shared'] },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--add-dir');
    expect(args).toContain('../lib');
    expect(args).toContain('../shared');
  });

  it('includes mcp-config paths', () => {
    const resolved = mergeOptions(
      { mcpConfig: ['./mcp1.json', './mcp2.json'] },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    const mcpIdx = args.indexOf('--mcp-config');
    expect(mcpIdx).toBeGreaterThan(-1);
    expect(args.filter(a => a === '--mcp-config')).toHaveLength(2);
  });

  it('serializes agents as JSON', () => {
    const agents = {
      reviewer: { description: 'Review code', tools: ['Read'] },
    };
    const resolved = mergeOptions(
      { agents },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--agents');
    expect(args).toContain(JSON.stringify(agents));
  });

  it('uses stream-json format for streaming', () => {
    const resolved = mergeOptions({}, undefined, {
      prompt: 'Stream this',
      outputFormat: 'stream-json',
    });
    const args = buildArgs(resolved);

    expect(args).toContain('stream-json');
  });

  // ── BUG-1 fix: --verbose for stream-json ──────────────────────

  it('adds --verbose when outputFormat is stream-json', () => {
    const resolved = mergeOptions({}, undefined, {
      prompt: 'Stream',
      outputFormat: 'stream-json',
    });
    const args = buildArgs(resolved);

    expect(args).toContain('--verbose');
  });

  it('does not add --verbose when outputFormat is json', () => {
    const resolved = mergeOptions({}, undefined, {
      prompt: 'Query',
      outputFormat: 'json',
    });
    const args = buildArgs(resolved);

    expect(args).not.toContain('--verbose');
  });

  // ── mcpServers inline → --mcp-config JSON ─────────────────────

  it('serializes mcpServers as inline JSON for --mcp-config', () => {
    const mcpServers = {
      fs: { type: 'stdio', command: 'mcp-fs', args: ['--root', '/tmp'] },
    };
    const resolved = mergeOptions(
      { mcpServers } as ClientOptions,
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--mcp-config');
    const mcpIdx = args.lastIndexOf('--mcp-config');
    expect(JSON.parse(args[mcpIdx + 1]!)).toEqual({ mcpServers });
  });

  it('passes both mcpConfig paths and mcpServers inline', () => {
    const resolved = mergeOptions(
      {
        mcpConfig: './servers.json',
        mcpServers: { db: { type: 'stdio', command: 'mcp-db' } },
      } as ClientOptions,
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args.filter(a => a === '--mcp-config')).toHaveLength(2);
  });

  // ── hooks → --settings JSON ───────────────────────────────────

  it('serializes hooks as --settings JSON', () => {
    const hooks = {
      PreToolUse: [{ matcher: '.*', hooks: [{ command: 'echo pre' }] }],
    };
    const resolved = mergeOptions(
      { hooks } as ClientOptions,
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--settings');
    const idx = args.indexOf('--settings');
    expect(JSON.parse(args[idx + 1]!)).toEqual({ hooks });
  });

  // ── New flags ─────────────────────────────────────────────────

  it('includes --agent flag', () => {
    const resolved = mergeOptions(
      { agent: 'reviewer' },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--agent');
    expect(args).toContain('reviewer');
  });

  it('query agent overrides client agent', () => {
    const resolved = mergeOptions(
      { agent: 'reviewer' },
      { agent: 'fixer' },
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('fixer');
    expect(args).not.toContain('reviewer');
  });

  it('includes --tools flag', () => {
    const resolved = mergeOptions(
      { tools: ['Bash', 'Read', 'Edit'] },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--tools');
    expect(args).toContain('Bash');
    expect(args).toContain('Read');
    expect(args).toContain('Edit');
  });

  it('includes --tools with empty string to disable all tools', () => {
    const resolved = mergeOptions(
      { tools: [] },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--tools');
    expect(args).toContain('');
  });

  it('includes --name flag', () => {
    const resolved = mergeOptions(
      { name: 'my-session' },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--name');
    expect(args).toContain('my-session');
  });

  it('includes --strict-mcp-config flag', () => {
    const resolved = mergeOptions(
      { strictMcpConfig: true, mcpConfig: './my.json' },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--strict-mcp-config');
  });

  it('includes --effort flag', () => {
    const resolved = mergeOptions(
      { effortLevel: 'max' },
      undefined,
      { prompt: 'Test', outputFormat: 'json' },
    );
    const args = buildArgs(resolved);

    expect(args).toContain('--effort');
    expect(args).toContain('max');
  });
});

describe('mergeOptions', () => {
  it('query options override client options', () => {
    const client: ClientOptions = { model: 'sonnet', maxTurns: 10 };
    const query: QueryOptions = { model: 'opus', maxTurns: 3 };

    const resolved = mergeOptions(client, query, {
      prompt: 'Test',
      outputFormat: 'json',
    });

    expect(resolved.model).toBe('opus');
    expect(resolved.maxTurns).toBe(3);
  });

  it('falls back to client options when query options are absent', () => {
    const client: ClientOptions = { model: 'sonnet', permissionMode: 'plan' };

    const resolved = mergeOptions(client, undefined, {
      prompt: 'Test',
      outputFormat: 'json',
    });

    expect(resolved.model).toBe('sonnet');
    expect(resolved.permissionMode).toBe('plan');
  });

  it('uses process.cwd() as default cwd', () => {
    const resolved = mergeOptions({}, undefined, {
      prompt: 'Test',
      outputFormat: 'json',
    });

    expect(resolved.cwd).toBe(process.cwd());
  });
});

describe('resolveEnv', () => {
  it('merges client and query env vars', () => {
    const env = resolveEnv(
      { env: { FOO: 'bar' } },
      { env: { BAZ: 'qux' } },
    );

    expect(env).toEqual({
      FOO: 'bar',
      BAZ: 'qux',
    });
  });

  it('query env overrides client env', () => {
    const env = resolveEnv(
      { env: { FOO: 'old' } },
      { env: { FOO: 'new' } },
    );

    expect(env['FOO']).toBe('new');
  });
});
