// Vitest global setup: load env from monorepo root for tests.
// Tests that need different env values should override with vi.stubEnv.
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../.env') });
// Test-only defaults (non-secret). Real values come from code/.env.
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test_jwt_secret_do_not_use_in_prod';
process.env.JWT_EXPIRES_IN ??= '1h';
process.env.PORT ??= '3000';
//# sourceMappingURL=setup.js.map