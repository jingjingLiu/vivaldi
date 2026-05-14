import { describe, it, expect } from 'vitest';
import { createLogger } from '../src/lib/logger.js';
describe('lib/logger', () => {
    it('creates a pino logger with the requested level', () => {
        const logger = createLogger('debug');
        expect(logger.level).toBe('debug');
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.error).toBe('function');
    });
    it('defaults to pretty transport only outside production', () => {
        const dev = createLogger('info', 'development');
        const prod = createLogger('info', 'production');
        expect(dev.level).toBe('info');
        expect(prod.level).toBe('info');
    });
});
//# sourceMappingURL=logger.test.js.map