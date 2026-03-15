# CI/CD and Advanced Patterns

## CI/CD Pipeline Reporter

```ts
import { createWriteStream } from 'node:fs'
import {
  Claude,
  EVENT_TEXT,
  EVENT_TOOL_USE,
  PERMISSION_ACCEPT_EDITS,
} from '@scottwalker/claude-connector'

const claude = new Claude()
const reportStream = createWriteStream('ci-report.txt')

const result = await claude.stream('Run all tests and report failures', {
  permissionMode: PERMISSION_ACCEPT_EDITS,
  allowedTools: ['Bash', 'Read', 'Glob', 'Grep'],
})
  .on(EVENT_TEXT, (text) => {
    process.stdout.write(text)
    reportStream.write(text)
  })
  .on(EVENT_TOOL_USE, (event) => {
    if (event.toolName === 'Bash') {
      const cmd = (event.toolInput as any).command ?? ''
      reportStream.write(`\n[CMD] ${cmd}\n`)
    }
  })
  .done()

reportStream.write(`\n\nExit: ${result.durationMs}ms, $${result.cost}\n`)
reportStream.end()

// Set CI exit code based on result
if (result.text.includes('FAIL')) process.exit(1)
```

::: tip
For CI environments, consider using `noSessionPersistence: true` to avoid accumulating session files on the build server.
:::

## Electron IPC

Main process to renderer streaming via IPC:

### Main Process

```ts
// main.ts (Electron main process)
import { ipcMain } from 'electron'
import { Claude, EVENT_TEXT, EVENT_RESULT } from '@scottwalker/claude-connector'

const claude = new Claude()

ipcMain.handle('ai:stream', async (event, prompt: string) => {
  await claude.stream(prompt)
    .on(EVENT_TEXT, (text) => {
      event.sender.send('ai:chunk', text)
    })
    .on(EVENT_RESULT, (result) => {
      event.sender.send('ai:done', {
        usage: result.usage,
        cost: result.cost,
      })
    })
    .done()
})
```

### Renderer Process

```ts
// renderer.ts (Electron renderer)
const { ipcRenderer } = require('electron')

ipcRenderer.on('ai:chunk', (_, text) => {
  document.getElementById('output')!.textContent += text
})

ipcRenderer.on('ai:done', (_, result) => {
  console.log('Done:', result)
})

ipcRenderer.invoke('ai:stream', 'Explain this code')
```

## Worker Threads

Offload streaming to a worker to keep the main thread free:

### Worker

```ts
// worker.ts
import { parentPort, workerData } from 'node:worker_threads'
import { Claude, EVENT_TEXT, EVENT_RESULT } from '@scottwalker/claude-connector'

const claude = new Claude({ useSdk: false })

await claude.stream(workerData.prompt)
  .on(EVENT_TEXT, (text) => {
    parentPort!.postMessage({ type: 'text', text })
  })
  .on(EVENT_RESULT, (event) => {
    parentPort!.postMessage({ type: 'result', usage: event.usage, cost: event.cost })
  })
  .done()
```

### Main Thread

```ts
// main.ts
import { Worker } from 'node:worker_threads'

const worker = new Worker('./worker.ts', {
  workerData: { prompt: 'Analyze the codebase' },
})

worker.on('message', (msg) => {
  if (msg.type === 'text') process.stdout.write(msg.text)
  if (msg.type === 'result') console.log('\nDone:', msg.usage)
})
```

::: tip
Worker threads are useful in Electron or server applications where you need to keep the main thread responsive while Claude processes a long-running query.
:::
