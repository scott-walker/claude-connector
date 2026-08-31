# Tools

Control which tools Claude can use and which require approval.

## `allowedTools` — Auto-Approve Specific Tools

These tools run without prompting. Others still require approval:

```ts
const claude = new Claude({
  allowedTools: ['Read', 'Glob', 'Grep', 'Bash(npm run *)'],
})
```

## `disallowedTools` — Block Specific Tools

These tools are always denied:

```ts
const claude = new Claude({
  disallowedTools: ['Bash(rm *)', 'Write'],
})
```

## `tools` — Restrict the Available Tool Set

Controls which tools **exist** — Claude cannot use tools outside this list:

```ts
// Only allow reading — Claude cannot edit files at all
const claude = new Claude({
  tools: ['Read', 'Glob', 'Grep'],
})

// Disable all tools (pure chat, no file access)
const claude = new Claude({ tools: [] })

// All built-in tools
const claude = new Claude({ tools: { type: 'preset', preset: 'claude_code' } })
```

::: tip `['default']` still works
`tools: ['default']` is the legacy CLI spelling of the preset and is translated to the object form. Before 0.7.0 it was forwarded to the SDK as a literal tool named `default`, which left Claude with **no** tools at all.
:::

## `tools` vs `allowedTools` — The Difference

```ts
const claude = new Claude({
  // Claude CAN use: Read, Glob, Grep, Bash, Edit
  // Claude CANNOT use: Write, NotebookEdit, etc. (they don't exist)
  tools: ['Read', 'Glob', 'Grep', 'Bash', 'Edit'],

  // Of the tools above, these run without prompting:
  allowedTools: ['Read', 'Glob', 'Grep'],

  // Bash and Edit still require user approval (they exist but aren't auto-approved)
})
```

::: tip
Think of `tools` as "what exists" and `allowedTools` as "what's pre-approved." Use `tools` to limit Claude's capabilities, and `allowedTools` to streamline common operations.
:::

## Skills

Skills are loaded through their own option — passing `'Skill'` in `allowedTools` is deprecated. SDK mode only.

```ts
// Named skills
const claude = new Claude({ skills: ['pdf', 'docx'] })

// Everything available
const everything = new Claude({ skills: 'all' })
```

`disableSlashCommands: true` turns off every slash command, and therefore every skill. Reload skills from disk mid-session with [`reloadSkills()`](../api/#reloadskills).

## Redirecting Tools

`toolAliases` points a built-in tool at an MCP tool, which is useful when the host runs tools in its own sandbox or container. It is single-hop — an alias target is never itself re-aliased.

```ts
const claude = new Claude({
  mcpServers: { workspace: { type: 'stdio', command: './workspace-server' } },
  toolAliases: { Bash: 'mcp__workspace__bash' },
})
```

## Sandboxing Tool Calls

`sandbox` runs tool calls inside the OS sandbox with an egress allowlist, a filesystem policy, and credential masking.

```ts
const claude = new Claude({
  sandbox: {
    enabled: true,
    // fail loudly rather than silently running unsandboxed
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: true,
    network: {
      allowedDomains: ['registry.npmjs.org', 'github.com'],
      strictAllowlist: true,
    },
    filesystem: {
      allowWrite: ['/srv/workspace'],
      denyRead: ['/etc/shadow', '~/.ssh'],
    },
  },
})
```

See [`SandboxConfig`](../api/types#sandboxconfig) for the full option set.

::: warning `failIfUnavailable`
Without it, a platform with no available sandbox runs the tools unsandboxed rather than refusing. Set it whenever the sandbox is a safety requirement rather than a nicety.
:::

## Permission Modes

Seven permission modes control how Claude handles tool approval:

```ts
import {
  Claude,
  PERMISSION_DEFAULT,
  PERMISSION_ACCEPT_EDITS,
  PERMISSION_PLAN,
  PERMISSION_AUTO,
  PERMISSION_BYPASS,
  PERMISSION_DONT_ASK,
} from '@scottwalker/kraube-konnektor'
```

| Constant | Value | Description |
|----------|-------|-------------|
| `PERMISSION_DEFAULT` | `'default'` | Prompt on first use (default behavior) |
| `PERMISSION_ACCEPT_EDITS` | `'acceptEdits'` | Auto-accept file edits |
| `PERMISSION_PLAN` | `'plan'` | Read-only — no modifications allowed |
| `PERMISSION_AUTO` | `'auto'` | Automatic tool approval based on risk |
| `PERMISSION_BYPASS` | `'bypassPermissions'` | Skip all permission checks |
| `PERMISSION_DONT_ASK` | `'dontAsk'` | Skip all checks, don't even ask |
| `PERMISSION_MANUAL` | `'manual'` | The `claude` binary's own spelling of `'default'`, normalized before it reaches the SDK |

```ts
// Read-only — no modifications allowed
new Claude({ permissionMode: PERMISSION_PLAN })

// Auto-accept file edits
new Claude({ permissionMode: PERMISSION_ACCEPT_EDITS })

// Automatic tool approval based on risk
new Claude({ permissionMode: PERMISSION_AUTO })

// Skip all permission checks (use only in sandboxed environments)
new Claude({ permissionMode: PERMISSION_BYPASS })

// Skip all checks, don't even ask
new Claude({ permissionMode: PERMISSION_DONT_ASK })
```

::: warning
`PERMISSION_BYPASS` and `PERMISSION_DONT_ASK` skip all safety checks. Only use them in fully sandboxed or CI environments where Claude's actions cannot cause harm.
:::

## Programmatic Permissions

Use `canUseTool` to implement custom permission logic in code (SDK mode only):

```ts
const claude = new Claude({
  canUseTool: async (toolName, input, { signal }) => {
    // Block dangerous shell commands
    if (toolName === 'Bash' && String(input.command).includes('rm -rf')) {
      return { behavior: 'deny', message: 'Destructive command blocked' }
    }

    // Allow read-only tools unconditionally
    if (['Read', 'Glob', 'Grep'].includes(toolName)) {
      return { behavior: 'allow' }
    }

    // Everything else — allow but could also return 'deny'
    return { behavior: 'allow' }
  },
})
```

::: tip
`canUseTool` is called before every tool execution. Return `{ behavior: 'allow' }` to proceed, or `{ behavior: 'deny', message: '...' }` to block. You can also modify the tool input via `updatedInput` in the allow response.
:::

## Runtime Permission Switch

Change the permission mode mid-session (SDK mode only):

```ts
import {
  Claude,
  PERMISSION_PLAN,
  PERMISSION_ACCEPT_EDITS,
} from '@scottwalker/kraube-konnektor'

const claude = new Claude({ permissionMode: PERMISSION_PLAN })

// Start with read-only analysis
const r1 = await claude.query('Review the auth module for vulnerabilities')

// Now allow edits for the fix
await claude.setPermissionMode(PERMISSION_ACCEPT_EDITS)

const r2 = await claude.query('Fix the vulnerabilities you found')
```
