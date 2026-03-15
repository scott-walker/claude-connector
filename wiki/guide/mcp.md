# MCP Servers

Connect [Model Context Protocol](https://modelcontextprotocol.io/) servers to extend Claude's capabilities.

## From Config Files

```ts
const claude = new Claude({
  mcpConfig: './mcp-servers.json',
})

// Multiple config files
const claude = new Claude({
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
      env: { DB_URL: 'postgres://localhost/mydb' },
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
