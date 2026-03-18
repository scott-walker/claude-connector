import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Claude Connector',
  description: 'Programmatic Node.js interface for Claude Code CLI',
  base: '/claude-connector/wiki/',
  appearance: false,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/claude-connector/wiki/favicon.svg' }],
  ],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Landing', link: 'https://scott-walker.github.io/claude-connector/' },
      {
        text: 'v0.4.8',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@scottwalker/claude-connector' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
        {
          text: 'Core',
          items: [
            { text: 'Queries', link: '/guide/queries' },
            { text: 'Streaming', link: '/guide/streaming' },
            { text: 'Chat (Bidirectional)', link: '/guide/chat' },
            { text: 'Sessions', link: '/guide/sessions' },
          ],
        },
        {
          text: 'Features',
          items: [
            { text: 'Node.js Streams', link: '/guide/nodejs-streams' },
            { text: 'Scheduled Tasks', link: '/guide/scheduled-tasks' },
            { text: 'MCP Servers', link: '/guide/mcp' },
            { text: 'Agents', link: '/guide/agents' },
            { text: 'Tool Control', link: '/guide/tools' },
            { text: 'Structured Output', link: '/guide/structured-output' },
            { text: 'Error Handling', link: '/guide/errors' },
          ],
        },
        {
          text: 'Integration Patterns',
          items: [
            { text: 'HTTP / SSE / WebSocket', link: '/guide/integrations' },
            { text: 'Bots (Telegram, Slack)', link: '/guide/bots' },
            { text: 'CI/CD Pipelines', link: '/guide/ci-cd' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Claude', link: '/api/' },
            { text: 'StreamHandle', link: '/api/stream-handle' },
            { text: 'ChatHandle', link: '/api/chat-handle' },
            { text: 'Session', link: '/api/session' },
            { text: 'ScheduledJob', link: '/api/scheduled-job' },
            { text: 'Constants', link: '/api/constants' },
            { text: 'Types', link: '/api/types' },
            { text: 'Errors', link: '/api/errors' },
            { text: 'IExecutor', link: '/api/executor' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/scott-walker/claude-connector' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@scottwalker/claude-connector' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/scott-walker/claude-connector/edit/main/wiki/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2026 Scott Walker',
    },
  },
})
