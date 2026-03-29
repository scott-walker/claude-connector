import { execSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import ora from 'ora';

const REQUIRED_NODE_MAJOR = 18;
const CLAUDE_PACKAGE = '@anthropic-ai/claude-code';
const DEFAULT_CONFIG_DIR = '.claude';

interface StepResult {
  ok: boolean;
  message?: string;
}

function banner(): void {
  console.log();
  console.log(chalk.bold('  Claude Connector — Setup'));
  console.log(chalk.dim('  ─────────────────────────'));
  console.log();
}

function checkNodeVersion(): StepResult {
  const major = parseInt(process.versions.node, 10);
  if (major >= REQUIRED_NODE_MAJOR) {
    return { ok: true, message: `Node.js ${process.versions.node}` };
  }
  return { ok: false, message: `Node.js ${process.versions.node} — requires >= ${REQUIRED_NODE_MAJOR}` };
}

function isClaudeInstalled(): boolean {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getClaudeVersion(): string {
  try {
    return execSync('claude --version', { stdio: 'pipe', encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function isClaudeAuthenticated(env?: NodeJS.ProcessEnv): boolean {
  try {
    const output = execSync('claude auth status', { stdio: 'pipe', encoding: 'utf-8', env });
    return output.toLowerCase().includes('logged in') || !output.toLowerCase().includes('not logged');
  } catch {
    return false;
  }
}

async function installClaude(): Promise<StepResult> {
  const spinner = ora('Installing Claude Code...').start();
  try {
    execSync(`npm install -g ${CLAUDE_PACKAGE}`, { stdio: 'pipe' });
    const version = getClaudeVersion();
    spinner.succeed(`Claude Code installed ${chalk.dim(`(${version})`)}`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail('Failed to install Claude Code');
    console.log(chalk.red(`  ${message}`));
    return { ok: false };
  }
}

async function authenticate(env?: NodeJS.ProcessEnv): Promise<StepResult> {
  console.log();
  console.log(chalk.bold('  Authentication'));
  console.log(chalk.dim('  Follow the instructions below from Claude Code:\n'));

  return new Promise((resolve) => {
    const child = spawn('claude', ['login'], {
      stdio: 'inherit',
      shell: true,
      env,
    });

    child.on('close', (code) => {
      console.log();
      if (code === 0) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, message: `claude login exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      console.log();
      resolve({ ok: false, message: err.message });
    });
  });
}

async function askScope(): Promise<string> {
  const home = homedir();
  const defaultPath = resolve(home, DEFAULT_CONFIG_DIR);

  console.log(chalk.bold('  Config directory'));
  console.log(chalk.dim(`  Where to store Claude Code config files.`));
  console.log(chalk.dim(`  Leave empty for default: ${defaultPath}\n`));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(chalk.cyan('  Path: '));
  rl.close();

  const configDir = answer.trim() ? resolve(answer.trim()) : defaultPath;

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  console.log();
  return configDir;
}

function buildEnv(configDir: string): NodeJS.ProcessEnv {
  const defaultPath = resolve(homedir(), DEFAULT_CONFIG_DIR);
  if (configDir === defaultPath) {
    return { ...process.env };
  }
  return { ...process.env, CLAUDE_CONFIG_DIR: configDir };
}

function printResult(ok: boolean, label: string): void {
  const icon = ok ? chalk.green('✔') : chalk.red('✖');
  console.log(`  ${icon} ${label}`);
}

function printQuickStart(configDir: string, hasCustomDir: boolean): void {
  const dim = chalk.dim;
  const accent = chalk.cyan;
  const key = chalk.yellow;
  const str = chalk.green;
  const comment = chalk.dim.italic;

  console.log(chalk.bold('  Quick Start'));
  console.log(dim('  ─────────────────────────\n'));

  if (hasCustomDir) {
    console.log(dim('  // Set env before use (add to .bashrc for persistence)'));
    console.log(`  ${accent('export')} ${key('CLAUDE_CONFIG_DIR')}=${str(`"${configDir}"`)}\n`);
  }

  console.log(dim('  // 1. Basic query'));
  console.log(`  ${accent('import')} { ${key('Claude')} } ${accent('from')} ${str("'@scottwalker/claude-connector'")}`);
  console.log();
  console.log(`  ${accent('const')} ${key('claude')} = ${accent('new')} ${key('Claude')}({`);
  console.log(`    ${key('model')}:          ${str("'sonnet'")},`);
  console.log(`    ${key('permissionMode')}: ${str("'auto'")},`);
  console.log(`  })`);
  console.log();
  console.log(`  ${accent('const')} ${key('result')} = ${accent('await')} ${key('claude')}.${accent('query')}(${str("'Analyze this project'")})`);
  console.log(`  console.log(${key('result')}.${accent('text')})`);

  console.log();
  console.log(dim('  // 2. Streaming'));
  console.log(`  ${accent('const')} ${key('stream')} = ${key('claude')}.${accent('stream')}(${str("'Explain auth.ts'")})`);
  console.log(`  ${accent('const')} ${key('text')} = ${accent('await')} ${key('stream')}.${accent('text')}() ${comment('// collect all text')}`);

  console.log();
  console.log(dim('  // 3. Multi-turn session'));
  console.log(`  ${accent('const')} ${key('session')} = ${key('claude')}.${accent('session')}()`);
  console.log(`  ${accent('await')} ${key('session')}.${accent('query')}(${str("'Read src/index.ts'")})`);
  console.log(`  ${accent('await')} ${key('session')}.${accent('query')}(${str("'Now refactor it'")})`);

  console.log();
  console.log(dim('  // 4. Parallel queries'));
  console.log(`  ${accent('const')} ${key('results')} = ${accent('await')} ${key('claude')}.${accent('parallel')}([`);
  console.log(`    ${str("'Check for security issues'")},`);
  console.log(`    ${str("'Find unused exports'")},`);
  console.log(`    ${str("'Suggest performance improvements'")},`);
  console.log(`  ])`);

  console.log();
  console.log(dim('  ─────────────────────────'));
  console.log(dim('  Docs: https://github.com/scott-walker/claude-connector'));
  console.log();
}

export async function setup(): Promise<void> {
  banner();

  // Step 1: Check Node.js
  const nodeCheck = checkNodeVersion();
  printResult(nodeCheck.ok, nodeCheck.message!);
  if (!nodeCheck.ok) {
    console.log();
    console.log(chalk.red('  Setup aborted. Please upgrade Node.js.'));
    process.exit(1);
  }

  // Step 2: Check / install Claude Code
  if (isClaudeInstalled()) {
    const version = getClaudeVersion();
    printResult(true, `Claude Code ${chalk.dim(`(${version})`)}`);
  } else {
    printResult(false, 'Claude Code not found');
    console.log();
    const install = await installClaude();
    if (!install.ok) {
      console.log();
      console.log(chalk.red('  Setup aborted.'));
      process.exit(1);
    }
  }

  // Step 3: Choose config directory (scope)
  console.log();
  const configDir = await askScope();
  const env = buildEnv(configDir);
  printResult(true, `Config directory ${chalk.dim(`(${configDir})`)}`);

  // Step 4: Check / run authentication
  const hasCustomDir = !!env.CLAUDE_CONFIG_DIR;

  if (isClaudeAuthenticated(env)) {
    printResult(true, 'Authenticated');
    console.log();
    console.log(chalk.green.bold('  All set! You can now use Claude Connector.\n'));
    printQuickStart(configDir, hasCustomDir);
    return;
  }

  const authResult = await authenticate(env);
  if (!authResult.ok) {
    printResult(false, `Authentication failed${authResult.message ? `: ${authResult.message}` : ''}`);
    console.log();
    console.log(chalk.red('  Setup aborted.'));
    process.exit(1);
  }

  // Verify
  if (isClaudeAuthenticated(env)) {
    printResult(true, 'Authenticated');
  } else {
    printResult(false, 'Authentication could not be verified');
    console.log(chalk.yellow('  Try running: claude login'));
    console.log();
    return;
  }

  console.log();
  console.log(chalk.green.bold('  All set! You can now use Claude Connector.\n'));
  printQuickStart(configDir, hasCustomDir);
}
