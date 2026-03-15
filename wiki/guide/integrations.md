# Integrations

Stream Claude's responses directly into HTTP servers, SSE endpoints, and WebSocket connections.

## HTTP Streaming (Express)

```ts
import express from 'express'
import { Claude } from '@scottwalker/claude-connector'

const app = express()
const claude = new Claude({ useSdk: false })

app.get('/ai/stream', (req, res) => {
  const prompt = req.query.prompt as string

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
  })

  claude.stream(prompt).toReadable().pipe(res)
})

app.get('/ai/query', async (req, res) => {
  const text = await claude.stream(req.query.prompt as string).text()
  res.json({ text })
})
```

## HTTP Streaming (Fastify)

```ts
import Fastify from 'fastify'
import { Claude } from '@scottwalker/claude-connector'

const app = Fastify()
const claude = new Claude({ useSdk: false })

app.get('/ai/stream', async (req, reply) => {
  const prompt = req.query.prompt as string

  reply.raw.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
  })

  await claude.stream(prompt).pipe(reply.raw)
})
```

## Server-Sent Events (SSE)

Stream structured events to the browser:

```ts
import {
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
  EVENT_ERROR,
} from '@scottwalker/claude-connector'

app.get('/ai/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  claude.stream(req.query.prompt as string)
    .on(EVENT_TEXT, (text) => {
      res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
    })
    .on(EVENT_TOOL_USE, (event) => {
      res.write(`data: ${JSON.stringify({ type: 'tool', tool: event.toolName })}\n\n`)
    })
    .on(EVENT_RESULT, (event) => {
      res.write(`data: ${JSON.stringify({ type: 'done', usage: event.usage })}\n\n`)
      res.end()
    })
    .on(EVENT_ERROR, (event) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: event.message })}\n\n`)
      res.end()
    })
    .done()
})
```

### Browser Consumer (SSE)

```js
const source = new EventSource('/ai/sse?prompt=Explain%20auth')

source.onmessage = (e) => {
  const data = JSON.parse(e.data)

  if (data.type === 'text') {
    document.getElementById('output').textContent += data.text
  } else if (data.type === 'done') {
    source.close()
  }
}
```

## WebSocket

Real-time bidirectional communication over WebSocket:

```ts
import { WebSocketServer } from 'ws'
import {
  Claude,
  EVENT_TEXT,
  EVENT_TOOL_USE,
  EVENT_RESULT,
} from '@scottwalker/claude-connector'

const wss = new WebSocketServer({ port: 8080 })
const claude = new Claude({ useSdk: false })

wss.on('connection', (ws) => {
  const chat = claude.chat()
    .on(EVENT_TEXT, (text) => {
      ws.send(JSON.stringify({ type: 'text', text }))
    })
    .on(EVENT_TOOL_USE, (event) => {
      ws.send(JSON.stringify({ type: 'tool', name: event.toolName }))
    })
    .on(EVENT_RESULT, (event) => {
      ws.send(JSON.stringify({ type: 'result', usage: event.usage }))
    })

  ws.on('message', async (data) => {
    const { prompt } = JSON.parse(data.toString())
    await chat.send(prompt)
  })

  ws.on('close', () => chat.end())
})
```

### Browser Consumer (WebSocket)

```js
const ws = new WebSocket('ws://localhost:8080')

ws.send(JSON.stringify({ prompt: 'What does this project do?' }))

ws.onmessage = (e) => {
  const data = JSON.parse(e.data)
  if (data.type === 'text') {
    document.getElementById('output').textContent += data.text
  }
}
```

::: tip
The WebSocket example uses `ChatHandle` for persistent multi-turn conversations. Each WebSocket connection gets its own chat process, so multiple clients can interact independently.
:::
