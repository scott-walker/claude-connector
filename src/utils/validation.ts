import { ValidationError } from '../errors/errors.js';
import type { ClientOptions, QueryOptions } from '../types/index.js';

/**
 * Validates client options at construction time.
 * Fails fast with descriptive error messages.
 */
export function validateClientOptions(options: ClientOptions): void {
  if (options.maxTurns !== undefined && (options.maxTurns < 1 || !Number.isInteger(options.maxTurns))) {
    throw new ValidationError('maxTurns', 'must be a positive integer');
  }
  if (options.maxBudget !== undefined && options.maxBudget <= 0) {
    throw new ValidationError('maxBudget', 'must be a positive number');
  }
  if (options.permissionMode !== undefined) {
    const valid = ['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions', 'auto'];
    if (!valid.includes(options.permissionMode)) {
      throw new ValidationError('permissionMode', `must be one of: ${valid.join(', ')}`);
    }
  }
  if (options.effortLevel !== undefined) {
    const valid = ['low', 'medium', 'high', 'max'];
    if (!valid.includes(options.effortLevel)) {
      throw new ValidationError('effortLevel', `must be one of: ${valid.join(', ')}`);
    }
  }
}

/**
 * Validates per-query options.
 */
export function validateQueryOptions(options: QueryOptions): void {
  if (options.maxTurns !== undefined && (options.maxTurns < 1 || !Number.isInteger(options.maxTurns))) {
    throw new ValidationError('maxTurns', 'must be a positive integer');
  }
  if (options.maxBudget !== undefined && options.maxBudget <= 0) {
    throw new ValidationError('maxBudget', 'must be a positive number');
  }
}

/**
 * Validates that a prompt is non-empty.
 */
export function validatePrompt(prompt: string): void {
  if (!prompt || !prompt.trim()) {
    throw new ValidationError('prompt', 'must be a non-empty string');
  }
}
