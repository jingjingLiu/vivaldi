import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { CandidateStatus, Role, UserNotificationEvent } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

const SUFFIX = `un_${Date.now()}`;
const COOKIE_NAME = 'vivaldi_session';
const app = createApp();

let coordId: number;
let screenerId: number;
let candidateId: number;
let coordCookie: string;
let screenerCookie: string;
let candidateCookie: string;
let positionId: number;
let notificationId: number;

function extractCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.find((c: string) => c.startsWith(`${COOKIE_NAME}=`));
}

async function loginInternal(username: string, password: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return extractCookie(res)!;
}

async function loginCandidate(oneTimeCode: string, phoneLast4: string): Promise<string> {
  const res = await request(app).post('/auth/candidate-login').send({ oneTimeCode, phoneLast4 });
  expect(res.status).toBe(200);
  return extractCookie(res)!;
}

beforeAll(async () => {
  const coord = await prisma.user.create({
    data: {
      username: `coord_${SUFFIX}`,
      passwordHash: await hashPassword('Coord1234!'),
      name: 'Notification Coordinator',
      roles: { create: [{ role: Role.coordinator }] },
    },
  });
  coordId = coord.id;

  const screener = await prisma.user.create({
    data: {
      username: `screener_${SUFFIX}`,
      passwordHash: await hashPassword('Screener1234!'),
      name: 'Notification Screener',
      roles: { create: [{ role: Role.screener }] },
    },
  });
  screenerId = screener.id;

  const position = await prisma.position.create({ data: { name: `Notification Position ${SUFFIX}` } });
  positionId = position.id;

  const candidate = await prisma.candidate.create({
    data: {
      positionId,
      status: CandidateStatus.oa_completed,
      oneTimeCode: `UN${SUFFIX}`.slice(0, 10),
      name: 'Notification Candidate',
      phone: '13800001234',
    },
  });
  candidateId = candidate.id;

  const notification = await prisma.userNotification.create({
    data: {
      userId: coordId,
      candidateId,
      event: UserNotificationEvent.oa_completed,
      title: '候选人已完成 OA',
      content: '候选人已完成 OA，请复核。',
    },
  });
  notificationId = notification.id;

  await prisma.userNotification.create({
    data: {
      userId: screenerId,
      candidateId,
      event: UserNotificationEvent.oa_completed,
      title: '筛选员消息',
      content: '这条消息只属于筛选员。',
    },
  });

  coordCookie = await loginInternal(`coord_${SUFFIX}`, 'Coord1234!');
  screenerCookie = await loginInternal(`screener_${SUFFIX}`, 'Screener1234!');
  candidateCookie = await loginCandidate(candidate.oneTimeCode, '1234');
});

afterAll(async () => {
  await prisma.userNotification.deleteMany({ where: { userId: { in: [coordId, screenerId] } } });
  await prisma.candidate.deleteMany({ where: { id: candidateId } });
  await prisma.position.deleteMany({ where: { id: positionId } });
  await prisma.user.deleteMany({ where: { id: { in: [coordId, screenerId] } } });
  await disconnectPrisma();
});

describe('User notification API', () => {
  it('lists only notifications for the current internal user', async () => {
    const res = await request(app).get('/user-notifications').set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    const item = res.body.items.find((n: { id: number }) => n.id === notificationId);
    expect(item).toBeDefined();
    expect(item.candidate.name).toBe('Notification Candidate');
  });

  it('returns unread count for the current user', async () => {
    const res = await request(app).get('/user-notifications/unread-count').set('Cookie', [coordCookie]);

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('marks one notification as read and filters unread messages', async () => {
    const readRes = await request(app)
      .post(`/user-notifications/${notificationId}/read`)
      .set('Cookie', [coordCookie]);

    expect(readRes.status).toBe(200);
    expect(readRes.body.notification.readAt).not.toBeNull();

    const unreadRes = await request(app)
      .get('/user-notifications?unreadOnly=true')
      .set('Cookie', [coordCookie]);
    expect(unreadRes.status).toBe(200);
    expect(unreadRes.body.items.some((n: { id: number }) => n.id === notificationId)).toBe(false);
  });

  it('does not allow another user to mark a notification as read', async () => {
    const res = await request(app)
      .post(`/user-notifications/${notificationId}/read`)
      .set('Cookie', [screenerCookie]);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('marks all current-user notifications as read', async () => {
    await prisma.userNotification.update({
      where: { id: notificationId },
      data: { readAt: null },
    });

    const res = await request(app).post('/user-notifications/read-all').set('Cookie', [coordCookie]);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('rejects candidate session from station messages', async () => {
    const res = await request(app).get('/user-notifications').set('Cookie', [candidateCookie]);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
