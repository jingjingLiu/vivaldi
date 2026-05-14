import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { Role } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

const SUFFIX = `settings_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';
const SETTING_KEYS = ['company_name', 'base_url', 'oa_deadline_days', 'smtp_config', 'sms_config'];

let coordCookie: string;
let screenerCookie: string;
let originalSettingsRows: Array<{ key: string; value: string }> = [];

const app = createApp();

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function extractCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.find((c: string) => c.startsWith(`${COOKIE_NAME}=`));
}

async function loginAs(username: string, password: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  const cookie = extractCookie(res);
  expect(cookie).toBeDefined();
  return cookie!;
}

// -----------------------------------------------------------------------
// Setup / Teardown
// -----------------------------------------------------------------------

beforeAll(async () => {
  originalSettingsRows = await prisma.systemSetting.findMany({
    where: { key: { in: SETTING_KEYS } },
    select: { key: true, value: true },
  });

  await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Admin1234!'),
      name: 'Settings Coordinator',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });

  await prisma.user.create({
    data: {
      username: `screener_${SUFFIX}`,
      passwordHash: await hashPassword('Screener1!'),
      name: 'Settings Screener',
      roles: { create: [{ role: Role.screener }] },
    },
  });

  coordCookie = await loginAs(`coord_${SUFFIX}`, 'Admin1234!');
  screenerCookie = await loginAs(`screener_${SUFFIX}`, 'Screener1!');

  // Reset settings to seed defaults so assertions are reliable
  await prisma.systemSetting.upsert({
    where: { key: 'company_name' },
    update: { value: 'Acme Corp' },
    create: { key: 'company_name', value: 'Acme Corp' },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'base_url' },
    update: { value: 'http://localhost:5173' },
    create: { key: 'base_url', value: 'http://localhost:5173' },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'oa_deadline_days' },
    update: { value: '7' },
    create: { key: 'oa_deadline_days', value: '7' },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'smtp_config' },
    update: { value: JSON.stringify({ mode: 'smtp', host: '', port: 587, username: '', password: '', apiUrl: '', apiAppCode: '', apiAppSecret: '' }) },
    create: { key: 'smtp_config', value: JSON.stringify({ mode: 'smtp', host: '', port: 587, username: '', password: '', apiUrl: '', apiAppCode: '', apiAppSecret: '' }) },
  });
});

afterAll(async () => {
  // Restore exactly what existed before this test file so local system settings are not overwritten.
  await prisma.systemSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
  if (originalSettingsRows.length > 0) {
    await prisma.systemSetting.createMany({ data: originalSettingsRows });
  }

  await prisma.user.deleteMany({ where: { username: { startsWith: `coord_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `screener_${SUFFIX}` } } });
  await disconnectPrisma();
});

// -----------------------------------------------------------------------
// Auth enforcement
// -----------------------------------------------------------------------

describe('Auth enforcement on /settings', () => {
  it('GET /settings returns 401 without cookie', async () => {
    const res = await request(app).get('/settings');
    expect(res.status).toBe(401);
  });

  it('GET /settings returns 403 with non-coordinator cookie', async () => {
    const res = await request(app).get('/settings').set('Cookie', [screenerCookie]);
    expect(res.status).toBe(403);
  });

  it('PUT /settings returns 401 without cookie', async () => {
    const res = await request(app).put('/settings').send({ companyName: 'X' });
    expect(res.status).toBe(401);
  });

  it('PUT /settings returns 403 with screener cookie', async () => {
    const res = await request(app)
      .put('/settings')
      .set('Cookie', [screenerCookie])
      .send({ companyName: 'X' });
    expect(res.status).toBe(403);
  });
});

// -----------------------------------------------------------------------
// GET /settings
// -----------------------------------------------------------------------

describe('GET /settings', () => {
  it('[TC-1.3-001] returns shaped settings with seeded defaults', async () => {
    const res = await request(app).get('/settings').set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);

    const { settings } = res.body as {
      settings: {
        companyName: string;
        baseUrl: string;
        oaDeadlineDays: number;
        smtp: {
          mode: 'smtp' | 'api';
          host: string;
          port: number;
          username: string;
          password: string;
          apiUrl: string;
          apiAppCode: string;
          apiAppSecret: string;
        };
        sms: { apiUrl: string; apiKey: string; senderNumber: string };
      };
    };

    expect(typeof settings.companyName).toBe('string');
    expect(typeof settings.baseUrl).toBe('string');
    expect(typeof settings.oaDeadlineDays).toBe('number');
    expect(typeof settings.smtp).toBe('object');
    expect(typeof settings.sms).toBe('object');

    // Seeded values
    expect(settings.companyName).toBe('Acme Corp');
    expect(settings.baseUrl).toBe('http://localhost:5173');
    expect(settings.oaDeadlineDays).toBe(7);
    expect(['smtp', 'api']).toContain(settings.smtp.mode);
    expect(typeof settings.smtp.host).toBe('string');
    expect(typeof settings.smtp.port).toBe('number');
    expect(typeof settings.smtp.username).toBe('string');
    expect(typeof settings.smtp.password).toBe('string');
    expect(typeof settings.smtp.apiUrl).toBe('string');
    expect(typeof settings.smtp.apiAppCode).toBe('string');
    expect(typeof settings.smtp.apiAppSecret).toBe('string');
    expect(typeof settings.sms.apiUrl).toBe('string');
    expect(typeof settings.sms.apiKey).toBe('string');
    expect(typeof settings.sms.senderNumber).toBe('string');
  });
});

// -----------------------------------------------------------------------
// PUT /settings — validation
// -----------------------------------------------------------------------

describe('PUT /settings — validation', () => {
  it('[TC-1.3-002] returns 400 VALIDATION_ERROR for empty body', async () => {
    const res = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.3-006] returns 400 VALIDATION_ERROR for oaDeadlineDays = -1', async () => {
    const res = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({ oaDeadlineDays: -1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.3-006] returns 400 VALIDATION_ERROR for oaDeadlineDays = 100', async () => {
    const res = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({ oaDeadlineDays: 100 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.3-002] returns 400 VALIDATION_ERROR for invalid baseUrl', async () => {
    const res = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({ baseUrl: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.3-002] returns 400 VALIDATION_ERROR for empty companyName', async () => {
    const res = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({ companyName: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('[TC-1.3-003] returns 400 VALIDATION_ERROR for invalid email API URL', async () => {
    const res = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({ smtp: { mode: 'api', apiUrl: 'not-a-url' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// -----------------------------------------------------------------------
// PUT /settings — partial updates
// -----------------------------------------------------------------------

describe('PUT /settings — partial updates', () => {
  it('[TC-1.3-002] updates only companyName; other settings unchanged', async () => {
    // Capture current state first
    const beforeRes = await request(app).get('/settings').set('Cookie', [coordCookie]);
    const before = beforeRes.body.settings as {
      companyName: string;
      baseUrl: string;
      oaDeadlineDays: number;
    };

    const res = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({ companyName: 'Updated Company' });

    expect(res.status).toBe(200);
    const { settings } = res.body as { settings: typeof before };
    expect(settings.companyName).toBe('Updated Company');
    expect(settings.baseUrl).toBe(before.baseUrl);
    expect(settings.oaDeadlineDays).toBe(before.oaDeadlineDays);
  });

  it('[TC-1.3-003] updates smtp and merges; existing username preserved if not in body', async () => {
    // First set a known smtp username
    await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({ smtp: { host: 'smtp.example.com', port: 587, username: 'user@example.com', password: 'secret' } });

    // Now update only host and port, leave username/password untouched
    const res = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({ smtp: { host: 'mail.example.com', port: 465 } });

    expect(res.status).toBe(200);
    const { settings } = res.body as {
      settings: {
        smtp: {
          mode: 'smtp' | 'api';
          host: string;
          port: number;
          username: string;
          password: string;
          apiUrl: string;
          apiAppCode: string;
          apiAppSecret: string;
        };
      };
    };
    expect(settings.smtp.host).toBe('mail.example.com');
    expect(settings.smtp.port).toBe(465);
    expect(settings.smtp.username).toBe('user@example.com');
    expect(settings.smtp.password).toBe('secret');
  });

  it('[TC-1.3-003] updates email API mode with endpoint and auth fields', async () => {
    const res = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({
        smtp: {
          mode: 'api',
          apiUrl: 'https://mail-api.example.com/send',
          apiAppCode: 'test-app-code',
          apiAppSecret: 'test-app-secret',
        },
      });

    expect(res.status).toBe(200);
    const { settings } = res.body as {
      settings: { smtp: { mode: 'smtp' | 'api'; apiUrl: string; apiAppCode: string; apiAppSecret: string } };
    };
    expect(settings.smtp.mode).toBe('api');
    expect(settings.smtp.apiUrl).toBe('https://mail-api.example.com/send');
    expect(settings.smtp.apiAppCode).toBe('test-app-code');
    expect(settings.smtp.apiAppSecret).toBe('test-app-secret');
  });

  it('[TC-1.3-002] round-trip: PUT then GET returns updated values', async () => {
    const uniqueName = `RoundTrip_${Date.now()}`;
    const putRes = await request(app)
      .put('/settings')
      .set('Cookie', [coordCookie])
      .send({ companyName: uniqueName, oaDeadlineDays: 30 });
    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/settings').set('Cookie', [coordCookie]);
    expect(getRes.status).toBe(200);
    const { settings } = getRes.body as { settings: { companyName: string; oaDeadlineDays: number } };
    expect(settings.companyName).toBe(uniqueName);
    expect(settings.oaDeadlineDays).toBe(30);
  });
});
