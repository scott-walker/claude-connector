# Bots

Build chat bots powered by Claude Code.

## Telegram Bot

```ts
import TelegramBot from 'node-telegram-bot-api'
import { Claude, EVENT_TEXT, PERMISSION_PLAN } from '@scottwalker/claude-connector'

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN!, { polling: true })
const claude = new Claude({ useSdk: false, permissionMode: PERMISSION_PLAN })

bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const prompt = msg.text ?? ''

  // Send "thinking..." then edit with streamed response
  const sent = await bot.sendMessage(chatId, '...')
  let buffer = ''

  await claude.stream(prompt)
    .on(EVENT_TEXT, async (text) => {
      buffer += text
      // Throttle edits to avoid rate limits
      if (buffer.length % 200 < text.length) {
        await bot.editMessageText(buffer, {
          chat_id: chatId,
          message_id: sent.message_id,
        })
      }
    })
    .done()

  // Final edit with complete text
  await bot.editMessageText(buffer, {
    chat_id: chatId,
    message_id: sent.message_id,
  })
})
```

::: tip
The throttle logic (`buffer.length % 200 < text.length`) prevents hitting Telegram's rate limits by only updating the message every ~200 characters.
:::

## Slack Bot

### Simple Response

```ts
import { App } from '@slack/bolt'
import { Claude, EVENT_TEXT, PERMISSION_PLAN } from '@scottwalker/claude-connector'

const app = new App({
  token: process.env.SLACK_TOKEN!,
  signingSecret: process.env.SLACK_SECRET!,
})
const claude = new Claude({ useSdk: false, permissionMode: PERMISSION_PLAN })

app.message(async ({ message, say }) => {
  const text = await claude.stream((message as any).text)
    .text()

  await say(text)
})
```

### Streaming Variant — Progressive Message Updates

```ts
app.message('stream', async ({ message, client }) => {
  const result = await client.chat.postMessage({
    channel: (message as any).channel,
    text: '...',
  })

  let buffer = ''
  await claude.stream((message as any).text)
    .on(EVENT_TEXT, async (text) => {
      buffer += text
      if (buffer.length % 300 < text.length) {
        await client.chat.update({
          channel: (message as any).channel,
          ts: result.ts!,
          text: buffer,
        })
      }
    })
    .done()

  await client.chat.update({
    channel: (message as any).channel,
    ts: result.ts!,
    text: buffer,
  })
})
```

::: warning
Both bot examples use `PERMISSION_PLAN` (read-only mode) for safety. In a production bot, you typically don't want Claude making file edits in response to user messages.
:::
