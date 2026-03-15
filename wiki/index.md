---
layout: home

hero:
  name: Claude Connector
  text: Claude Code in your code
  tagline: Programmatic Node.js interface for Claude Code CLI. Streaming, sessions, Node.js pipes — all typed.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: View on GitHub
      link: https://github.com/scott-walker/claude-connector

features:
  - icon: ⚡
    title: StreamHandle
    details: Fluent .on().done() callbacks, .text() one-liner, .pipe() to any writable, .toReadable() for Node.js ecosystem.
    link: /guide/streaming
  - icon: 🔄
    title: Bidirectional Chat
    details: claude.chat() — persistent process, unlimited turns. .send(), .toDuplex(), WebSocket-ready.
    link: /guide/chat
  - icon: 🔌
    title: Node.js Streams
    details: Readable, Duplex, pipeline(). Pipe to files, gzip, HTTP responses — the full Node.js streams ecosystem.
    link: /guide/nodejs-streams
  - icon: 💬
    title: Multi-turn Sessions
    details: session.query() maintains context across turns. Resume, fork, continue — all via typed API.
    link: /guide/sessions
  - icon: 🛡️
    title: Full CLI Parity
    details: 45+ CLI flags as typed options. Models, permissions, tools, MCP, agents, hooks, worktrees.
    link: /guide/getting-started
  - icon: 🔒
    title: Zero Magic Strings
    details: Every string literal is a named constant. EVENT_TEXT, PERMISSION_PLAN, SCHED_RESULT — import and use.
    link: /api/constants
---
