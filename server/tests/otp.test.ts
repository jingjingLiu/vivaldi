import { describe, it, expect } from 'vitest';
import { generateOneTimeCode } from '../src/lib/otp.js';

describe('lib/otp', () => {
  it('returns an 8-character alphanumeric code', () => {
    const code = generateOneTimeCode();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('avoids ambiguous characters (0, O, 1, I, L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOneTimeCode();
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it('produces distinct values across many calls (collision rate < 1%)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateOneTimeCode());
    expect(set.size).toBeGreaterThan(990);
  });
});
