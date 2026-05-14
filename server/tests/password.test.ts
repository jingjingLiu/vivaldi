import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

describe('lib/password', () => {
  it('hashes a password into a bcrypt string', async () => {
    const hash = await hashPassword('hunter2!');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    expect(hash).not.toContain('hunter2!');
  });

  it('verifyPassword returns true for the correct password', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
  });

  it('verifyPassword returns false for a wrong password', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });
});
