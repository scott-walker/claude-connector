---
layout: home

hero:
  name: Claude Connector
  text: Claude Code in your code
  tagline: Programmatic Node.js interface for Claude Code CLI. Streaming, sessions, Node.js pipes — all typed.
  image:
    src: /logo.png
    alt: Claude Connector
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: View on GitHub
      link: https://github.com/scott-walker/kraube-konnektor

features:
  - icon:
      src: /icons/stream.svg
    title: StreamHandle
    details: Fluent .on().done() callbacks, .text() one-liner, .pipe() to any writable, .toReadable() for Node.js ecosystem.
    link: /guide/streaming
  - icon:
      src: /icons/arrows-left-right.svg
    title: Bidirectional Chat
    details: claude.chat() — persistent process, unlimited turns. .send(), .toDuplex(), WebSocket-ready.
    link: /guide/chat
  - icon:
      src: /icons/workflow.svg
    title: Node.js Streams
    details: Readable, Duplex, pipeline(). Pipe to files, gzip, HTTP responses — the full Node.js streams ecosystem.
    link: /guide/nodejs-streams
  - icon:
      src: /icons/messages.svg
    title: Multi-turn Sessions
    details: session.query() keeps context across turns. Resume, fork, continue, rename, tag — plus transcript reads and custom storage.
    link: /guide/sessions
  - icon:
      src: /icons/workflow.svg
    title: 33 Hook Events
    details: Typed input and output for every lifecycle point. JS callbacks in SDK mode, commands, prompts, agents or HTTP in CLI mode.
    link: /guide/hooks
  - icon:
      src: /icons/terminal.svg
    title: Full CLI Parity
    details: 60 CLI flags as typed options. Models, permissions, tools, skills, MCP, agents, sandboxing, worktrees.
    link: /guide/getting-started
  - icon:
      src: /icons/lock.svg
    title: Zero Magic Strings
    details: Every string literal is a named constant. EVENT_TEXT, PERMISSION_PLAN, SCHED_RESULT — import and use.
    link: /api/constants
---
