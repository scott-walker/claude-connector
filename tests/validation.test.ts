import { describe, it, expect } from 'vitest';
import { validateClientOptions, validateQueryOptions, validatePrompt } from '../src/utils/validation.js';
import { ValidationError } from '../src/errors/errors.js';

describe('validateClientOptions', () => {
  it('accepts valid options', () => {
    expect(() =>
      validateClientOptions({
        model: 'sonnet',
        maxTurns: 5,
        maxBudget: 1.0,
        permissionMode: 'plan',
        effortLevel: 'high',
      }),
    ).not.toThrow();
  });

  it('accepts auto permission mode', () => {
    expect(() => validateClientOptions({ permissionMode: 'auto' })).not.toThrow();
  });

  it('accepts max effort level', () => {
    expect(() => validateClientOptions({ effortLevel: 'max' })).not.toThrow();
  });

  it('accepts empty options', () => {
    expect(() => validateClientOptions({})).not.toThrow();
  });

  it('rejects non-positive maxTurns', () => {
    expect(() => validateClientOptions({ maxTurns: 0 })).toThrow(ValidationError);
    expect(() => validateClientOptions({ maxTurns: -1 })).toThrow(ValidationError);
    expect(() => validateClientOptions({ maxTurns: 1.5 })).toThrow(ValidationError);
  });

  it('rejects non-positive maxBudget', () => {
    expect(() => validateClientOptions({ maxBudget: 0 })).toThrow(ValidationError);
    expect(() => validateClientOptions({ maxBudget: -5 })).toThrow(ValidationError);
  });

  it('rejects invalid permissionMode', () => {
    expect(() =>
      validateClientOptions({ permissionMode: 'invalid' as 'plan' }),
    ).toThrow(ValidationError);
  });

  it('rejects invalid effortLevel', () => {
    expect(() =>
      validateClientOptions({ effortLevel: 'extreme' as 'high' }),
    ).toThrow(ValidationError);
  });
});

describe('validateQueryOptions', () => {
  it('accepts valid query options', () => {
    expect(() => validateQueryOptions({ maxTurns: 3, maxBudget: 0.5 })).not.toThrow();
  });

  it('rejects invalid maxTurns', () => {
    expect(() => validateQueryOptions({ maxTurns: 0 })).toThrow(ValidationError);
  });
});

describe('validatePrompt', () => {
  it('accepts non-empty prompt', () => {
    expect(() => validatePrompt('Hello')).not.toThrow();
  });

  it('rejects empty prompt', () => {
    expect(() => validatePrompt('')).toThrow(ValidationError);
    expect(() => validatePrompt('   ')).toThrow(ValidationError);
  });
});
