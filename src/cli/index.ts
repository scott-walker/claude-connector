#!/usr/bin/env node

import { Command } from 'commander';
import { setup } from './commands/setup.js';

const program = new Command()
  .name('kraube-konnektor')
  .description('CLI for Claude Connector — quick setup & management')
  .version('0.6.5');

program
  .command('setup')
  .description('Install Claude Code and authenticate')
  .option('--proxy <url>', 'HTTP proxy for Claude Code (e.g. http://user:pass@host:port)')
  .action(setup);

program.parse();
