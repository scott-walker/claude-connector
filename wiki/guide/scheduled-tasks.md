# Scheduled Tasks

Recurring queries at fixed intervals — the programmatic equivalent of `/loop`.

## Basic Usage

```ts
import {
  Claude,
  SCHED_RESULT,
  SCHED_ERROR,
  SCHED_TICK,
  SCHED_STOP,
} from '@scottwalker/claude-connector'

const claude = new Claude()

const job = claude.loop('5m', 'Check deploy status on staging')

job.on(SCHED_RESULT, (result) => {
  console.log(`[Tick ${job.tickCount}] ${result.text}`)
})

job.on(SCHED_ERROR, (err) => {
  console.error('Query failed:', err.message)
})

job.on(SCHED_TICK, (count) => {
  console.log(`Starting tick #${count}...`)
})

job.on(SCHED_STOP, () => {
  console.log('Job stopped')
})

// Stop after 1 hour
setTimeout(() => job.stop(), 3_600_000)
```

## Interval Formats

```ts
claude.loop('30s', 'Check status')      // 30 seconds
claude.loop('5m', 'Run tests')          // 5 minutes
claude.loop('2h', 'Generate report')    // 2 hours
claude.loop('1d', 'Daily summary')      // 1 day
claude.loop(120_000, 'Custom interval') // raw milliseconds
```

## Events

| Event | Constant | Callback | Description |
|-------|----------|----------|-------------|
| `result` | `SCHED_RESULT` | `(result: QueryResult)` | Query completed successfully |
| `error` | `SCHED_ERROR` | `(err: Error)` | Query failed |
| `tick` | `SCHED_TICK` | `(count: number)` | Tick started |
| `stop` | `SCHED_STOP` | `()` | Job was stopped |

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `intervalMs` | `number` | Interval in milliseconds |
| `prompt` | `string` | The prompt string |
| `tickCount` | `number` | Number of executions |
| `running` | `boolean` | `true` if a query is in progress |
| `stopped` | `boolean` | `true` after `stop()` |

## Loop with Query Options

```ts
const job = claude.loop('10m', 'Check for regressions', {
  model: 'haiku',
  maxTurns: 3,
  maxBudget: 0.5,
})
```

::: warning
Scheduled tasks keep running until you call `job.stop()`. Make sure to clean up when your application shuts down to avoid orphaned processes.
:::
