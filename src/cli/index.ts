#!/usr/bin/env node

import { Command } from 'commander';
import { setup } from './commands/setup.js';

const program = new Command()
  .name('claude-connector')
  .description('CLI for Claude Connector — quick setup & management')
  .version('0.5.2');

program
  .command('setup')
  .description('Install Claude Code and authenticate')
  .action(setup);

program.parse();
