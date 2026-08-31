# MCP Servers

Connect [Model Context Protocol](https://modelcontextprotocol.io/) servers to extend Claude's capabilities.

## From Config Files

`mcpConfig` is CLI mode only — the SDK has no config-file channel, and passing
it with `useSdk` left at its default throws a `ValidationError` at construction.

```ts
const claude = new Claude({
  useSdk: false,
  mcpConfig: './mcp-servers.json',
})

// Multiple config files
const multi = new Claude({
  useSdk: false,
  mcpConfig: ['./mcp-local.json', './mcp-shared.json'],
})
```

## Inline Server Definitions

Define servers directly in code using `mcpServers`:

```ts
const claude = new Claude({
  mcpServers: {
    filesystem: {
      type: 'stdio',
      command: 'mcp-server-filesystem',
      args: ['--root', '/home/user/data'],
    },
    github: {
      type: 'http',
      url: 'http://localhost:3000/mcp',
      headers: { Authorization: 'Bearer token123' },
    },
    database: {
      type: 'sse',
      url: 'http://localhost:8080/sse',
      headers: { Authorization: 'Bearer sse-token' },
    },
  },
})
```

::: tip
Three transport types are supported: `stdio` (local process), `http` (HTTP endpoint), and `sse` (Server-Sent Events). These correspond to the constants `MCP_STDIO`, `MCP_HTTP`, and `MCP_SSE`.
:::

## Mixed: Config Files + Inline

```ts
const claude = new Claude({
  mcpConfig: './base-servers.json',
  mcpServers: {
    custom: { type: 'stdio', command: 'my-mcp-tool' },
  },
})
```

## Strict MCP Config

Ignore all MCP servers except the ones explicitly provided:

```ts
const claude = new Claude({
  mcpConfig: './my-servers.json',
  strictMcpConfig: true,
})
```

::: warning
With `strictMcpConfig: true`, any MCP servers configured globally or in project settings are ignored. Only the servers you specify in `mcpConfig` and `mcpServers` are available.
:::

## In-Process MCP Tools

Define custom tools that run inside your Node.js process using `createSdkMcpServer` and `sdkTool` (SDK mode only):

```ts
import { Claude, createSdkMcpServer, sdkTool } from '@scottwalker/kraube-konnektor'
import { z } from 'zod/v4'

const server = await createSdkMcpServer({
  name: 'my-tools',
  tools: [
    await sdkTool(
      'getPrice',
      'Get current stock price',
      { ticker: z.string() },
      // `args` is typed `unknown` — the schema is enforced at runtime
      async (args) => {
        const { ticker } = args as { ticker: string }
        return { content: [{ type: 'text', text: `${ticker}: $142.50` }] }
      },
    ),
    await sdkTool(
      'getWeather',
      'Get weather for a city',
      { city: z.string() },
      async (args) => {
        const { city } = args as { city: string }
        return { content: [{ type: 'text', text: `${city}: 22°C, sunny` }] }
      },
      { annotations: { readOnly: true } },
    ),
  ],
})

const claude = new Claude({
  mcpServers: { stocks: server },
})

const result = await claude.query('What is the price of AAPL?')
```

::: tip
In-process MCP tools avoid external processes — the tool handler runs directly in your Node.js runtime. Ideal for integrating application-specific logic.
:::

## Dynamic MCP Management

Add, remove, reconnect, and toggle MCP servers at runtime (SDK mode only):

### `setMcpServers` — Add or Replace Servers

```ts
const claude = new Claude()

const result = await claude.setMcpServers({
  analytics: {
    type: 'stdio',
    command: 'mcp-analytics',
    args: ['--verbose'],
  },
})

console.log('Added:', result.added)     // ['analytics']
console.log('Removed:', result.removed) // []
console.log('Errors:', result.errors)   // {}
```

### `reconnectMcpServer` — Reconnect a Failed Server

```ts
await claude.reconnectMcpServer('analytics')
```

### `toggleMcpServer` — Enable or Disable a Server

```ts
// Disable a server (its tools become unavailable)
await claude.toggleMcpServer('analytics', false)

// Re-enable it
await claude.toggleMcpServer('analytics', true)
```

### `setMcpPermissionModeOverride` — Pin One Server's Permission Mode

Pin a single server's approval behavior independently of the session's:

```ts
// Let the CLI decide for this server, whatever the session mode is
await claude.setMcpPermissionModeOverride('analytics', 'auto')

// Always prompt for it
await claude.setMcpPermissionModeOverride('analytics', 'default')

// Drop the pin
await claude.setMcpPermissionModeOverride('analytics', null)
```

### `mcpServerStatus` — Inspect Connections

```ts
for (const server of await claude.mcpServerStatus()) {
  console.log(server.name, server.status)
}
```

Connectors proxied through claude.ai appear here with transport `MCP_CLAUDEAI_PROXY` (`'claudeai-proxy'`); they are reported, never configured directly.

## Per-Tool Policies

HTTP and SSE servers accept a `tools` policy list, so individual remote tools can be allowed or denied without touching `allowedTools`. `alwaysLoad` keeps a server's tool schemas in context instead of deferring them:

```ts
const claude = new Claude({
  mcpServers: {
    linear: {
      type: 'http',
      url: 'https://mcp.linear.app/mcp',
      headers: { Authorization: `Bearer ${token}` },
      alwaysLoad: true,
      timeout: 10_000,
    },
  },
})
```

Deferred tool schemas show up in [`getContextUsage()`](../api/#getcontextusage) under `mcpTools`, which is the fastest way to see what MCP is costing you in context.
