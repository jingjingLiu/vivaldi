import { describe, it, expect, vi } from 'vitest';
describe('lib/jwt', () => {
    it('signs then verifies a payload (round-trip)', async () => {
        vi.stubEnv('JWT_SECRET', 'test_jwt_secret_do_not_use_in_prod');
        vi.stubEnv('JWT_EXPIRES_IN', '1h');
        const { signToken, verifyToken } = await import('../src/lib/jwt.js');
        const token = signToken({ sub: 42, roles: ['coordinator'] });
        const decoded = verifyToken(token);
        expect(decoded.sub).toBe(42);
        expect(decoded.roles).toEqual(['coordinator']);
    });
    it('throws on invalid signature', async () => {
        const { signToken, verifyToken } = await import('../src/lib/jwt.js');
        const token = signToken({ sub: 1 });
        const tampered = token.slice(0, -2) + 'XX';
        expect(() => verifyToken(tampered)).toThrow();
    });
    it('throws on expired token', async () => {
        vi.stubEnv('JWT_SECRET', 'test_jwt_secret_do_not_use_in_prod');
        vi.stubEnv('JWT_EXPIRES_IN', '1ms');
        vi.resetModules();
        const { signToken, verifyToken } = await import('../src/lib/jwt.js');
        const token = signToken({ sub: 1 });
        await new Promise((r) => setTimeout(r, 20));
        expect(() => verifyToken(token)).toThrow();
    });
});
//# sourceMappingURL=jwt.test.js.map