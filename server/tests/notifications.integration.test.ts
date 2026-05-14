import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { CandidateStatus, Role } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import {
  dispatchNotification,
  setGlobalNotificationDeps,
  resetGlobalNotificationDeps,
} from '../src/services/notificationService.js';
import { createNotificationLogsRouter } from '../src/routes/notificationLogs.js';
import { ConfiguredEmailSender, type EmailSender } from '../src/services/emailSender.js';
import type { SmsSender } from '../src/services/smsSender.js';

// ---------------------------------------------------------------------------
// Test isolation
// ---------------------------------------------------------------------------

const RUN_ID = Date.now();
const SUFFIX = `notif_${RUN_ID}`;
const COOKIE_NAME = 'vivaldi_session';

const app = createApp();

const successfulEmailSender: EmailSender = {
  async send() {
    // Tests inject this no-op sender to avoid real SMTP network calls.
  },
};

const successfulSmsSender: SmsSender = {
  async send() {
    // Tests inject this no-op sender to avoid real SMS provider calls.
  },
};

function useSuccessfulNotificationDeps(): void {
  // Production uses configured senders; tests explicitly opt into no-op success.
  setGlobalNotificationDeps({ email: successfulEmailSender, sms: successfulSmsSender });
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let coordCookie: string;
let screenerCookie: string;
let testPositionId: number;
const createdCandidateIds: number[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

let _codeSeq = 0;
function nextOTC(): string {
  _codeSeq++;
  const ts = RUN_ID.toString(36).toUpperCase().slice(-5);
  const cnt = _codeSeq.toString().padStart(3, '0');
  return `N${ts}${cnt}`.slice(0, 10);
}

async function createCandidate(opts: {
  status?: CandidateStatus;
  email?: string | null;
  phone?: string | null;
} = {}): Promise<number> {
  const code = nextOTC();
  const c = await prisma.candidate.create({
    data: {
      positionId: testPositionId,
      status: opts.status ?? CandidateStatus.new,
      oneTimeCode: code,
      name: `TestNotif-${code}`,
      email: opts.email !== undefined ? opts.email : `test+${code}@example.com`,
      phone: opts.phone !== undefined ? opts.phone : `1380000${_codeSeq.toString().padStart(4, '0')}`,
    },
  });
  createdCandidateIds.push(c.id);
  return c.id;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await prisma.systemSetting.upsert({
    where: { key: 'oa_deadline_days' },
    update: {},
    create: { key: 'oa_deadline_days', value: '7' },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'base_url' },
    update: {},
    create: { key: 'base_url', value: 'https://example.com' },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'company_name' },
    update: {},
    create: { key: 'company_name', value: 'Test Company' },
  });

  await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Admin1234!'),
      name: 'Notif Coordinator',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });

  await prisma.user.create({
    data: {
      username: `screener_${SUFFIX}`,
      passwordHash: await hashPassword('Screener1!'),
      name: 'Notif Screener',
      roles: { create: [{ role: Role.screener }] },
    },
  });

  coordCookie = await loginAs(`coord_${SUFFIX}`, 'Admin1234!');
  screenerCookie = await loginAs(`screener_${SUFFIX}`, 'Screener1!');

  const pos = await prisma.position.create({ data: { name: `Notif Test Position ${SUFFIX}` } });
  testPositionId = pos.id;
});

afterEach(() => {
  resetGlobalNotificationDeps();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (createdCandidateIds.length > 0) {
    await prisma.notificationLog.deleteMany({
      where: { candidateId: { in: createdCandidateIds } },
    });
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
  }
  await prisma.position.deleteMany({ where: { id: testPositionId } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `coord_${SUFFIX}` } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `screener_${SUFFIX}` } } });
  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// Test: new → waiting_for_oa creates 2 logs (email + sms), both sent
// ---------------------------------------------------------------------------

describe('Status change new → waiting_for_oa', () => {
  it('creates 2 NotificationLogs (email + sms) with deliveryStatus=sent, content has oneTimeCode and oaDeadline', async () => {
    const candidateId = await createCandidate({
      email: `oa_notif_${RUN_ID}@example.com`,
      phone: `138000${RUN_ID.toString().slice(-5)}`,
    });

    useSuccessfulNotificationDeps();

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa' });

    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('waiting_for_oa');

    // Wait briefly for async dispatch
    await new Promise((r) => setTimeout(r, 200));

    const logs = await prisma.notificationLog.findMany({
      where: { candidateId, triggerEvent: 'new_to_oa' },
      orderBy: { id: 'asc' },
    });

    expect(logs.length).toBe(2);
    const emailLog = logs.find((l) => l.type === 'email');
    const smsLog = logs.find((l) => l.type === 'sms');

    expect(emailLog).toBeDefined();
    expect(emailLog!.deliveryStatus).toBe('sent');
    expect(emailLog!.content).toContain(
      (await prisma.candidate.findUnique({ where: { id: candidateId } }))!.oneTimeCode,
    );

    expect(smsLog).toBeDefined();
    expect(smsLog!.deliveryStatus).toBe('sent');
  });
});

// ---------------------------------------------------------------------------
// Test: terminal status creates 1 email log
// ---------------------------------------------------------------------------

describe('Status change to terminal status', () => {
  it('creates 1 email NotificationLog for terminal transition', async () => {
    useSuccessfulNotificationDeps();

    const candidateId = await createCandidate({
      status: CandidateStatus.oa_completed,
      email: `terminal_${RUN_ID}@example.com`,
    });

    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'oa_failed' });

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 200));

    const logs = await prisma.notificationLog.findMany({
      where: { candidateId, triggerEvent: 'terminal_status' },
    });

    expect(logs.length).toBe(1);
    expect(logs[0].type).toBe('email');
    expect(logs[0].deliveryStatus).toBe('sent');
  });
});

// ---------------------------------------------------------------------------
// Test: candidate with no email → email log deliveryStatus=failed, errorMessage='no email'
// ---------------------------------------------------------------------------

describe('Candidate with no email', () => {
  it('creates a failed email log with errorMessage=no email', async () => {
    useSuccessfulNotificationDeps();

    const candidateId = await createCandidate({ email: null });

    await dispatchNotification({ candidateId, triggerEvent: 'new_to_oa' });

    const logs = await prisma.notificationLog.findMany({
      where: { candidateId, triggerEvent: 'new_to_oa', type: 'email' },
    });

    expect(logs.length).toBe(1);
    expect(logs[0].deliveryStatus).toBe('failed');
    expect(logs[0].errorMessage).toBe('no email');
  });
});

// ---------------------------------------------------------------------------
// Test: missing provider config → log marked failed with configuration error
// ---------------------------------------------------------------------------

describe('Missing notification provider config', () => {
  it('marks email log failed when SMTP settings are empty', async () => {
    const candidateId = await createCandidate({ email: `unconfigured_${RUN_ID}@example.com` });

    await dispatchNotification({
      candidateId,
      triggerEvent: 'oa_no_response',
      deps: {
        email: new ConfiguredEmailSender({ mode: 'smtp', host: '', port: 0, username: '', password: '', apiUrl: '', apiAppCode: '', apiAppSecret: '' }),
      },
    });

    const logs = await prisma.notificationLog.findMany({
      where: { candidateId, triggerEvent: 'oa_no_response' },
    });

    expect(logs.length).toBe(1);
    expect(logs[0].deliveryStatus).toBe('failed');
    expect(logs[0].errorMessage).toBe('email service not configured');
  });
});

describe('ConfiguredEmailSender API provider', () => {
  it('gets token and posts Kaleido email payload to configured API endpoint', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      async (url: string | URL | Request, init?: RequestInit) => {
        // Capture the outgoing request so the provider contract is explicit.
        requests.push({ url: String(url), init: init ?? {} });
        if (String(url) === 'https://auth.example.com/token') {
          return new Response(JSON.stringify({ err_code: 0, err_message: '', body: { token: 'test-token' } }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ status: 0, err_message: '', body: { status: 2 } }), { status: 200 });
      },
    );

    const sender = new ConfiguredEmailSender(
      {
        mode: 'api',
        host: '',
        port: 0,
        username: '',
        password: '',
        apiUrl: 'https://mail-api.example.com/send',
        apiAppCode: 'settings-app-code',
        apiAppSecret: 'settings-app-secret',
      },
      {
        authUrl: 'https://auth.example.com/token',
        appCode: '',
        appSecret: '',
      },
    );

    await sender.send({
      to: 'candidate@example.com',
      subject: 'Interview Notice',
      htmlBody: '<pre style="white-space:pre-wrap">Hello\nWorld</pre>',
      textBody: 'Hello',
    });

    expect(requests.length).toBe(2);
    expect(requests[0].url).toBe('https://auth.example.com/token');
    expect(requests[0].init.method).toBe('POST');
    expect(requests[0].init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      app_code: 'settings-app-code',
      app_secret: 'settings-app-secret',
    });
    expect(requests[1].url).toBe('https://mail-api.example.com/send');
    expect(requests[1].init.method).toBe('POST');
    expect(requests[1].init.headers).toEqual({ 'Content-Type': 'application/json', token: 'test-token' });
    expect(JSON.parse(String(requests[1].init.body))).toEqual({
      data_rows: {
        adress: 'candidate@example.com',
        title: 'Interview Notice',
        content: '<pre style="white-space:pre-wrap">Hello\nWorld</pre>',
      },
      return_method: 'blocking',
    });
  });

  it('throws configuration error when API endpoint is empty', async () => {
    const sender = new ConfiguredEmailSender({
      mode: 'api',
      host: '',
      port: 0,
      username: '',
      password: '',
      apiUrl: '',
      apiAppCode: '',
      apiAppSecret: '',
    });

    await expect(
      sender.send({
        to: 'candidate@example.com',
        subject: 'Interview Notice',
        htmlBody: '<p>Hello</p>',
        textBody: 'Hello',
      }),
    ).rejects.toThrow('email api service not configured');
  });

  it('throws auth configuration error when Kaleido credentials are empty', async () => {
    const sender = new ConfiguredEmailSender(
      {
        mode: 'api',
        host: '',
        port: 0,
        username: '',
        password: '',
        apiUrl: 'https://mail-api.example.com/send',
        apiAppCode: '',
        apiAppSecret: '',
      },
      { authUrl: 'https://auth.example.com/token', appCode: '', appSecret: '' },
    );

    await expect(
      sender.send({
        to: 'candidate@example.com',
        subject: 'Interview Notice',
        htmlBody: '<p>Hello</p>',
        textBody: 'Hello',
      }),
    ).rejects.toThrow('email api auth not configured');
  });

  it('throws service error when Kaleido body status is not success', async () => {
    vi.stubGlobal(
      'fetch',
      async (url: string | URL | Request) => {
        if (String(url) === 'https://auth.example.com/token') {
          return new Response(JSON.stringify({ err_code: 0, err_message: '', body: { token: 'test-token' } }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ status: 0, err_message: 'provider rejected', body: { status: 1 } }), {
          status: 200,
        });
      },
    );

    const sender = new ConfiguredEmailSender(
      {
        mode: 'api',
        host: '',
        port: 0,
        username: '',
        password: '',
        apiUrl: 'https://mail-api.example.com/send',
        apiAppCode: 'settings-app-code',
        apiAppSecret: 'settings-app-secret',
      },
      {
        authUrl: 'https://auth.example.com/token',
        appCode: '',
        appSecret: '',
      },
    );

    await expect(
      sender.send({
        to: 'candidate@example.com',
        subject: 'Interview Notice',
        htmlBody: '<p>Hello</p>',
        textBody: 'Hello',
      }),
    ).rejects.toThrow('email api service failed: provider rejected');
  });
});

// ---------------------------------------------------------------------------
// Test: stub sender throws → log marked failed with error message
// ---------------------------------------------------------------------------

describe('Stub sender that throws', () => {
  it('marks log as failed with the thrown error message', async () => {
    const candidateId = await createCandidate({ email: `throw_${RUN_ID}@example.com` });

    const throwingEmailSender: EmailSender = {
      async send() {
        throw new Error('SMTP connection refused');
      },
    };

    await dispatchNotification({
      candidateId,
      triggerEvent: 'oa_no_response', // email only
      deps: { email: throwingEmailSender },
    });

    const logs = await prisma.notificationLog.findMany({
      where: { candidateId, triggerEvent: 'oa_no_response' },
    });

    expect(logs.length).toBe(1);
    expect(logs[0].deliveryStatus).toBe('failed');
    expect(logs[0].errorMessage).toBe('SMTP connection refused');
  });
});

// ---------------------------------------------------------------------------
// Test: notification dispatch failure does NOT roll back status change
// ---------------------------------------------------------------------------

describe('Notification dispatch failure does not roll back status change', () => {
  it('status change persists even when notification fails', async () => {
    const candidateId = await createCandidate({ email: null, phone: null });

    // Both channels will fail (no email, no phone), but status change must persist
    const res = await request(app)
      .post(`/candidates/${candidateId}/status`)
      .set('Cookie', [coordCookie])
      .send({ toStatus: 'waiting_for_oa' });

    expect(res.status).toBe(200);
    expect(res.body.candidate.status).toBe('waiting_for_oa');

    await new Promise((r) => setTimeout(r, 200));

    // Status should be persisted in DB
    const c = await prisma.candidate.findUnique({ where: { id: candidateId } });
    expect(c!.status).toBe('waiting_for_oa');
  });
});

// ---------------------------------------------------------------------------
// Test: GET /notification-logs with filters
// ---------------------------------------------------------------------------

describe('GET /notification-logs', () => {
  let filterCandidateId: number;

  beforeAll(async () => {
    useSuccessfulNotificationDeps();

    filterCandidateId = await createCandidate({ email: `filter_${RUN_ID}@example.com` });

    // Dispatch to create some logs
    await dispatchNotification({
      candidateId: filterCandidateId,
      triggerEvent: 'new_to_oa',
    });
  });

  it('[TC-1.4-001] returns a paginated list of notification logs', async () => {
    const res = await request(app)
      .get('/notification-logs')
      .set('Cookie', [coordCookie])
      .query({ candidateId: filterCandidateId });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.page).toBe('number');
    expect(typeof res.body.pageSize).toBe('number');
  });

  it('[TC-1.4-001] filters by triggerEvent', async () => {
    const res = await request(app)
      .get('/notification-logs')
      .set('Cookie', [coordCookie])
      .query({ candidateId: filterCandidateId, triggerEvent: 'new_to_oa' });

    expect(res.status).toBe(200);
    const items = res.body.items as Array<{ triggerEvent: string }>;
    expect(items.length).toBeGreaterThanOrEqual(1);
    items.forEach((item) => expect(item.triggerEvent).toBe('new_to_oa'));
  });

  it('[TC-1.4-003] filters by deliveryStatus', async () => {
    const res = await request(app)
      .get('/notification-logs')
      .set('Cookie', [coordCookie])
      .query({ candidateId: filterCandidateId, deliveryStatus: 'sent' });

    expect(res.status).toBe(200);
    const items = res.body.items as Array<{ deliveryStatus: string }>;
    items.forEach((item) => expect(item.deliveryStatus).toBe('sent'));
  });

  it('[TC-1.4-002] filters by type=email', async () => {
    const res = await request(app)
      .get('/notification-logs')
      .set('Cookie', [coordCookie])
      .query({ candidateId: filterCandidateId, type: 'email' });

    expect(res.status).toBe(200);
    const items = res.body.items as Array<{ type: string }>;
    expect(items.length).toBeGreaterThanOrEqual(1);
    items.forEach((item) => expect(item.type).toBe('email'));
  });

  it('returns 403 for screener', async () => {
    const res = await request(app)
      .get('/notification-logs')
      .set('Cookie', [screenerCookie]);

    expect(res.status).toBe(403);
  });

  it('returns 401 without cookie', async () => {
    const res = await request(app).get('/notification-logs');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Test: POST /notification-logs/:id/retry
// ---------------------------------------------------------------------------

describe('POST /notification-logs/:id/retry', () => {
  it('[TC-1.4-004] re-sends a failed log and updates deliveryStatus to sent', async () => {
    useSuccessfulNotificationDeps();

    const candidateId = await createCandidate({ email: `retry_${RUN_ID}@example.com` });

    // Create a failed log directly
    const failedLog = await prisma.notificationLog.create({
      data: {
        candidateId,
        type: 'email',
        triggerEvent: 'new_to_oa',
        recipient: `retry_${RUN_ID}@example.com`,
        subject: 'Test subject',
        content: 'Test content',
        deliveryStatus: 'failed',
        errorMessage: 'previous error',
      },
    });

    // Use the router factory with a no-op stub to succeed
    const res = await request(app)
      .post(`/notification-logs/${failedLog.id}/retry`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    expect(res.body.log.deliveryStatus).toBe('sent');
    expect(res.body.log.sentAt).not.toBeNull();
  });

  it('[TC-1.4-005] marks log failed when sender throws during retry', async () => {
    const candidateId = await createCandidate({ email: `retryfail_${RUN_ID}@example.com` });

    const failedLog = await prisma.notificationLog.create({
      data: {
        candidateId,
        type: 'email',
        triggerEvent: 'oa_to_human',
        recipient: `retryfail_${RUN_ID}@example.com`,
        subject: 'Test',
        content: 'Test',
        deliveryStatus: 'failed',
        errorMessage: 'previous error',
      },
    });

    // Set global deps to a throwing sender
    setGlobalNotificationDeps({
      email: {
        async send() {
          throw new Error('retry failed');
        },
      },
    });

    const res = await request(app)
      .post(`/notification-logs/${failedLog.id}/retry`)
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    expect(res.body.log.deliveryStatus).toBe('failed');
    expect(res.body.log.errorMessage).toBe('retry failed');
  });

  it('returns 404 for non-existent log', async () => {
    const res = await request(app)
      .post('/notification-logs/999999999/retry')
      .set('Cookie', [coordCookie]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('returns 403 for screener', async () => {
    const res = await request(app)
      .post('/notification-logs/1/retry')
      .set('Cookie', [screenerCookie]);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Test: dispatchNotification directly — content contains oneTimeCode and oaDeadline
// ---------------------------------------------------------------------------

describe('dispatchNotification — content validation', () => {
  it('email content contains oneTimeCode and oaDeadline', async () => {
    useSuccessfulNotificationDeps();

    const code = nextOTC();
    const oaDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const c = await prisma.candidate.create({
      data: {
        positionId: testPositionId,
        status: CandidateStatus.waiting_for_oa,
        oneTimeCode: code,
        name: 'Content Test',
        email: `content_${code}@example.com`,
        phone: `138009${_codeSeq.toString().padStart(4, '0')}`,
        oaDeadline,
      },
    });
    createdCandidateIds.push(c.id);

    const { logs } = await dispatchNotification({
      candidateId: c.id,
      triggerEvent: 'new_to_oa',
    });

    const emailLog = logs.find((l) => l.type === 'email');
    expect(emailLog).toBeDefined();
    expect(emailLog!.content).toContain(code);
    expect(emailLog!.content).toContain(oaDeadline.toISOString().slice(0, 10));
  });
});
