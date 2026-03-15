# Structured Output

Force Claude to return validated JSON matching a schema.

## JSON Schema Usage

Pass a JSON Schema via the `schema` option:

```ts
const claude = new Claude()

const result = await claude.query('Extract all TODO comments from src/', {
  schema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            line: { type: 'number' },
            text: { type: 'string' },
          },
          required: ['file', 'line', 'text'],
        },
      },
    },
    required: ['todos'],
  },
})
```

## Accessing `result.structured`

When a schema is provided, the response is parsed and available on `result.structured`:

```ts
const data = result.structured as {
  todos: Array<{ file: string; line: number; text: string }>
}

for (const todo of data.todos) {
  console.log(`${todo.file}:${todo.line} — ${todo.text}`)
}
```

::: tip
`result.text` still contains the raw text response. `result.structured` is the parsed JSON object that was validated against your schema.
:::

## Extract API Endpoints

```ts
const result = await claude.query('Extract all API endpoints from the codebase', {
  schema: {
    type: 'object',
    properties: {
      endpoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            method: { type: 'string' },
            path: { type: 'string' },
            handler: { type: 'string' },
          },
        },
      },
    },
  },
})

console.log(result.structured)
// { endpoints: [{ method: 'GET', path: '/api/users', handler: 'getUsers' }, ...] }
```

## QueryResult Fields with Schema

When using structured output, the `QueryResult` includes:

```ts
result.text           // string — Claude's raw response
result.structured     // unknown — parsed JSON matching your schema
result.raw            // Record<string, unknown> — full raw CLI response
```

Without a schema, `result.structured` is `null`.
