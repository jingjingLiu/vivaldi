import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

describe('GET /health', () => {
  it('returns 200 with status=ok when DB is reachable', async () => {
    vi.doMock('../src/lib/prisma.js', () => ({
      prisma: { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) },
      disconnectPrisma: vi.fn(),
    }));
    const { createApp } = await import('../src/app.js');
    const app = createApp();

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
    expect(res.body.db).toBe('ok');
  });

  it('returns 503 with db=down when DB query throws', async () => {
    vi.resetModules();
    vi.doMock('../src/lib/prisma.js', () => ({
      prisma: { $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) },
      disconnectPrisma: vi.fn(),
    }));
    const { createApp } = await import('../src/app.js');
    const app = createApp();

    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('down');
  });
});
