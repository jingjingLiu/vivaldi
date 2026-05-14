import { describe, it, expect } from 'vitest';
import { HttpError } from '../src/errors/HttpError.js';

describe('errors/HttpError', () => {
  it('constructs with status, code, and message', () => {
    const err = new HttpError(404, 'NOT_FOUND', 'user not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('user not found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttpError);
  });

  it('accepts optional details payload', () => {
    const err = new HttpError(400, 'VALIDATION_ERROR', 'invalid', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });

  it('toJSON returns a serializable shape', () => {
    const err = new HttpError(403, 'FORBIDDEN', 'nope');
    expect(err.toJSON()).toEqual({ code: 'FORBIDDEN', message: 'nope' });
  });
});
