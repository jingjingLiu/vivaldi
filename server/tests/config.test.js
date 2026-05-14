import { describe, it, expect, vi, beforeEach } from 'vitest';
describe('config/env', () => {
    beforeEach(() => {
        vi.resetModules();
    });
    it('parses valid env into typed config object', async () => {
        vi.stubEnv('DATABASE_URL', 'mysql://u:p@localhost:3306/vivaldi');
        vi.stubEnv('JWT_SECRET', 'abcdefghij1234567890');
        vi.stubEnv('JWT_EXPIRES_IN', '2h');
        vi.stubEnv('PORT', '3000');
        vi.stubEnv('NODE_ENV', 'test');
        const { loadEnv } = await import('../src/config/env.js');
        const env = loadEnv();
        expect(env.DATABASE_URL).toBe('mysql://u:p@localhost:3306/vivaldi');
        expect(env.PORT).toBe(3000);
        expect(env.NODE_ENV).toBe('test');
        expect(env.JWT_EXPIRES_IN).toBe('2h');
    });
    it('throws with helpful message when required var is missing', async () => {
        vi.stubEnv('DATABASE_URL', '');
        vi.stubEnv('JWT_SECRET', 'abcdefghij1234567890');
        vi.stubEnv('PORT', '3000');
        const { loadEnv } = await import('../src/config/env.js');
        expect(() => loadEnv()).toThrow(/DATABASE_URL/);
    });
    it('rejects a JWT_SECRET shorter than 16 characters', async () => {
        vi.stubEnv('DATABASE_URL', 'mysql://u:p@h:3306/d');
        vi.stubEnv('JWT_SECRET', 'short');
        const { loadEnv } = await import('../src/config/env.js');
        expect(() => loadEnv()).toThrow(/JWT_SECRET/);
    });
});
//# sourceMappingURL=config.test.js.map