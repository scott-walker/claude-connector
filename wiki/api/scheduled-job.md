# ScheduledJob

A recurring query job that executes at a fixed interval. Created via [`claude.loop()`](./#loop). Extends `EventEmitter`.

Implements the equivalent of Claude Code's `/loop` command at the Node.js level.

```typescript
import { Claude, SCHED_RESULT, SCHED_ERROR, SCHED_TICK, SCHED_STOP } from '@scottwalker/claude-connector'

const claude = new Claude()
const job = claude.loop('5m', 'Check if deployment finished')

job.on(SCHED_TICK, (count) => console.log(`Tick #${count}`))
job.on(SCHED_RESULT, (result) => console.log(result.text))
job.on(SCHED_ERROR, (error) => console.error(error))
job.on(SCHED_STOP, () => console.log('Job stopped'))

// Stop after 30 minutes
setTimeout(() => job.stop(), 30 * 60_000)
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `intervalMs` | `number` | Interval in milliseconds (readonly) |
| `prompt` | `string` | Query prompt executed on each tick (readonly) |
| `tickCount` | `number` | Number of executions so far |
| `running` | `boolean` | Whether a query is currently active |
| `stopped` | `boolean` | Whether the job has been stopped |

::: tip Non-overlapping execution
If a query is still running when the next interval fires, the tick is skipped. This prevents overlapping executions.
:::

## Methods

### stop()

```typescript
stop(): void
```

Stop the scheduled job. Emits the `SCHED_STOP` event. The job cannot be restarted after stopping.

```typescript
const job = claude.loop('1m', 'Monitor logs')
job.on(SCHED_RESULT, (r) => {
  if (r.text.includes('ERROR')) {
    console.log('Error detected, stopping monitor')
    job.stop()
  }
})
```

## Events

| Event | Constant | Callback | Description |
|-------|----------|----------|-------------|
| `'result'` | `SCHED_RESULT` | `(result: QueryResult) => void` | After each successful query |
| `'error'` | `SCHED_ERROR` | `(error: Error) => void` | On query failure |
| `'tick'` | `SCHED_TICK` | `(count: number) => void` | Before each execution |
| `'stop'` | `SCHED_STOP` | `() => void` | When job is stopped |

```typescript
import { SCHED_RESULT, SCHED_ERROR, SCHED_TICK, SCHED_STOP } from '@scottwalker/claude-connector'

const job = claude.loop('10m', 'Run health check')

job.on(SCHED_TICK, (count) => {
  console.log(`Starting health check #${count}`)
})

job.on(SCHED_RESULT, (result) => {
  console.log(`Health check passed: ${result.text.slice(0, 100)}`)
  console.log(`Cost: $${result.cost}`)
})

job.on(SCHED_ERROR, (error) => {
  console.error(`Health check failed: ${error.message}`)
})

job.on(SCHED_STOP, () => {
  console.log('Health check monitoring stopped')
})
```

## Interval Formats

The `interval` parameter of `claude.loop()` accepts human-readable duration strings or raw milliseconds.

| Format | Example | Result |
|--------|---------|--------|
| Seconds | `'30s'` | Every 30 seconds |
| Minutes | `'5m'` | Every 5 minutes |
| Hours | `'2h'` | Every 2 hours |
| Days | `'1d'` | Every 24 hours |
| Raw ms | `60000` | Every 60 seconds |

Fractional values are supported: `'1.5h'` = 90 minutes.

```typescript
// All equivalent
claude.loop('60s', 'check')
claude.loop('1m', 'check')
claude.loop(60_000, 'check')
```

Invalid interval strings throw a [`ValidationError`](./errors#validationerror).
