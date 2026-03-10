/**
 * Interactive chat with Claude Code via claude-connector (SDK mode).
 *
 * Uses the persistent SDK session for fast responses.
 * The first time you run it, there's a one-time initialization (~5-10s).
 * After that, each question gets answered near-instantly.
 *
 * Usage:
 *   cd examples/interactive-chat
 *   npm install
 *   npm start
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
  console.log('║         Claude Code Interactive Chat         ║');
  console.log('║                                              ║');
  console.log('║  Type your questions, get answers.           ║');
  console.log('║  Conversation context is preserved.          ║');
  console.log('║  Type "exit" or Ctrl+C to quit.              ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log();

  // SDK mode: persistent session, fast queries after init
  const claude = new Claude({
    useSdk: true,
    model: 'sonnet',
    permissionMode: 'plan',   // read-only — safe for a chat demo
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

  const session = claude.session();

  while (true) {
    const input = await prompt('\x1b[36myou>\x1b[0m ');
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed.toLowerCase() === 'exit') break;

    try {
      console.log();
      const result = await session.query(trimmed);

      console.log(`\x1b[33mclaude>\x1b[0m ${result.text}`);
      console.log(
        `\x1b[2m[tokens: ${result.usage.inputTokens}in/${result.usage.outputTokens}out` +
        ` | ${result.durationMs}ms` +
        (result.cost !== null ? ` | $${result.cost.toFixed(4)}` : '') +
        `]\x1b[0m`,
      );
      console.log();
    } catch (err) {
      if (err instanceof CliNotFoundError) {
        console.error('\x1b[31mError: Claude Code CLI not found.');
        console.error('Install it: https://docs.anthropic.com/en/docs/claude-code/overview\x1b[0m\n');
        break;
      } else if (err instanceof ClaudeConnectorError) {
        console.error(`\x1b[31mError: ${err.message}\x1b[0m\n`);
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
