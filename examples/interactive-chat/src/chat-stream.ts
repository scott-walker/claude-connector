/**
 * Interactive chat with real-time streaming responses (SDK mode).
 *
 * Uses the persistent SDK session — warm up once, then stream fast.
 *
 * Usage:
 *   cd examples/interactive-chat
 *   npm install
 *   npm run stream
 */
import { createInterface } from 'node:readline';
import { Claude, CliNotFoundError, ClaudeConnectorError } from 'claude-connector';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     Claude Code Interactive Chat (Stream)    ║');
  console.log('║                                              ║');
  console.log('║  Responses appear in real time as Claude     ║');
  console.log('║  generates them.                             ║');
  console.log('║  Type "exit" or Ctrl+C to quit.              ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log();

  const claude = new Claude({
    useSdk: true,
    model: 'sonnet',
    permissionMode: 'plan',
    maxTurns: 3,
  });

  // Show initialization progress
  claude.on('init:stage', (stage, message) => {
    const icons: Record<string, string> = {
      importing: '[1/4]',
      creating: '[2/4]',
      connecting: '[3/4]',
      ready: '[4/4]',
    };
    console.log(`  ${icons[stage] ?? '[ - ]'} ${message}`);
  });

  console.log('Initializing Claude Code session...\n');
  await claude.init();
  console.log();

  // For streaming, we track session ID manually
  let sessionId: string | null = null;

  while (true) {
    const input = await prompt('\x1b[36myou>\x1b[0m ');
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed.toLowerCase() === 'exit') break;

    try {
      process.stdout.write('\n\x1b[33mclaude>\x1b[0m ');

      const sessionClaude = sessionId
        ? claude.session({ resume: sessionId })
        : claude.session();

      let stats = '';

      for await (const event of sessionClaude.stream(trimmed)) {
        switch (event.type) {
          case 'text':
            process.stdout.write(event.text);
            break;
          case 'tool_use':
            process.stdout.write(`\n\x1b[2m  [tool: ${event.toolName}]\x1b[0m\n`);
            break;
          case 'result':
            sessionId = event.sessionId;
            stats =
              `\x1b[2m[tokens: ${event.usage.inputTokens}in/${event.usage.outputTokens}out` +
              ` | ${event.durationMs}ms` +
              (event.cost !== null ? ` | $${event.cost.toFixed(4)}` : '') +
              `]\x1b[0m`;
            break;
          case 'error':
            process.stdout.write(`\n\x1b[31mError: ${event.message}\x1b[0m`);
            break;
        }
      }

      console.log();
      if (stats) console.log(stats);
      console.log();
    } catch (err) {
      if (err instanceof CliNotFoundError) {
        console.error('\n\x1b[31mError: Claude Code CLI not found.');
        console.error('Install it: https://docs.anthropic.com/en/docs/claude-code/overview\x1b[0m\n');
        break;
      } else if (err instanceof ClaudeConnectorError) {
        console.error(`\n\x1b[31mError: ${err.message}\x1b[0m\n`);
      } else {
        throw err;
      }
    }
  }

  console.log('\nBye!');
  claude.close();
  rl.close();
}

main();
