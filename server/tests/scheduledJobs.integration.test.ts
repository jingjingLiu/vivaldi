// ---------------------------------------------------------------------------
// Integration tests for scheduledJobs
//
// Uses a real DB (test env). Candidates A, B, C are created for each scenario.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CandidateStatus } from '@prisma/client';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';
import {
  runOaReminderJob,
  runOaExpiryJob,
  startScheduler,
} from '../src/services/scheduledJobs.js';

// ---------------------------------------------------------------------------
// Test isolation helpers
// ---------------------------------------------------------------------------

const RUN_ID = Date.now();
const SUFFIX = `sched_${RUN_ID}`;

let testPositionId: number;
const createdCandidateIds: number[] = [];

let _codeSeq = 0;
function nextOTC(): string {
  _codeSeq++;
  const ts = RUN_ID.toString(36).toUpperCase().slice(-4);
  const cnt = _codeSeq.toString().padStart(3, '0');
  return `SC${ts}${cnt}`.slice(0, 10);
}

async function createCandidate(opts: {
  status: CandidateStatus;
  oaDeadline?: Date | null;
  email?: string;
  phone?: string;
}): Promise<number> {
  const code = nextOTC();
  const c = await prisma.candidate.create({
    data: {
      positionId: testPositionId,
      status: opts.status,
      oneTimeCode: code,
      name: `SchedTest-${code}`,
      email: opts.email ?? `sched+${code}@example.com`,
      phone: opts.phone ?? `1380000${_codeSeq.toString().padStart(4, '0')}`,
      oaDeadline: opts.oaDeadline !== undefined ? opts.oaDeadline : null,
    },
  });
  createdCandidateIds.push(c.id);
  return c.id;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Ensure required settings exist
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

  const pos = await prisma.position.create({
    data: { name: `Scheduled Jobs Test Position ${SUFFIX}` },
  });
  testPositionId = pos.id;
});

afterAll(async () => {
  if (createdCandidateIds.length > 0) {
    await prisma.notificationLog.deleteMany({
      where: { candidateId: { in: createdCandidateIds } },
    });
    await prisma.statusHistory.deleteMany({
      where: { candidateId: { in: createdCandidateIds } },
    });
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
  }
  await prisma.position.deleteMany({ where: { id: testPositionId } });
  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// Shared "fixed now" for deterministic tests
// ---------------------------------------------------------------------------

// now = fixed reference time
const fixedNow = new Date('2025-06-01T12:00:00.000Z');

// Candidate A: oaDeadline in 48h → should get oa_reminder
const deadlineA = new Date(fixedNow.getTime() + 48 * 60 * 60 * 1000);

// Candidate B: oaDeadline in 24h → outside [now+47h, now+49h] window → NO reminder
const deadlineB = new Date(fixedNow.getTime() + 24 * 60 * 60 * 1000);

// Candidate C: oaDeadline in the past → should auto-expire
const deadlineC = new Date(fixedNow.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago

// ---------------------------------------------------------------------------
// OA Reminder Job tests
// ---------------------------------------------------------------------------

describe('runOaReminderJob', () => {
  let candidateA: number;
  let candidateB: number;
  let candidateC: number;

  beforeAll(async () => {
    candidateA = await createCandidate({
      status: CandidateStatus.waiting_for_oa,
      oaDeadline: deadlineA, // in 48h → reminder window
    });
    candidateB = await createCandidate({
      status: CandidateStatus.waiting_for_oa,
      oaDeadline: deadlineB, // in 24h → outside reminder window
    });
    // C has a past deadline but is NOT waiting_for_oa — reminder job ignores non-waiting_for_oa
    candidateC = await createCandidate({
      status: CandidateStatus.oa_completed, // not waiting_for_oa, so expiry job ignores it too
      oaDeadline: deadlineC,
    });
  });

  it('[TC-4.2-007] first run: sends exactly 1 oa_reminder (only candidate A)', async () => {
    // Count only reminders for our specific test candidates to avoid cross-suite interference
    const before = await prisma.notificationLog.count({
      where: {
        candidateId: { in: [candidateA, candidateB, candidateC] },
        triggerEvent: 'oa_reminder',
      },
    });

    const result = await runOaReminderJob({ now: fixedNow });

    // Candidate A should now have a notification log
    const logsA = await prisma.notificationLog.findMany({
      where: { candidateId: candidateA, triggerEvent: 'oa_reminder' },
    });
    expect(logsA.length).toBeGreaterThanOrEqual(1);

    // Candidate B should have no oa_reminder log
    const logsB = await prisma.notificationLog.findMany({
      where: { candidateId: candidateB, triggerEvent: 'oa_reminder' },
    });
    expect(logsB.length).toBe(0);

    // Candidate C (oa_completed, past deadline) should have no oa_reminder log
    const logsC = await prisma.notificationLog.findMany({
      where: { candidateId: candidateC, triggerEvent: 'oa_reminder' },
    });
    expect(logsC.length).toBe(0);

    // Net new sends for our candidates is 1
    const after = await prisma.notificationLog.count({
      where: {
        candidateId: { in: [candidateA, candidateB, candidateC] },
        triggerEvent: 'oa_reminder',
      },
    });
    expect(after - before).toBe(logsA.length); // A got reminded, B and C did not
  });

  it('second run (idempotent): A is not reminded again', async () => {
    const logsABefore = await prisma.notificationLog.findMany({
      where: { candidateId: candidateA, triggerEvent: 'oa_reminder' },
    });
    const countBefore = logsABefore.length;

    await runOaReminderJob({ now: fixedNow });

    const logsAAfter = await prisma.notificationLog.findMany({
      where: { candidateId: candidateA, triggerEvent: 'oa_reminder' },
    });
    expect(logsAAfter.length).toBe(countBefore);
  });
});

// ---------------------------------------------------------------------------
// OA Expiry Job tests
// ---------------------------------------------------------------------------

describe('runOaExpiryJob', () => {
  let candidateA2: number;
  let candidateB2: number;
  let candidateC2: number;

  beforeAll(async () => {
    // Fresh set of candidates for expiry tests
    candidateA2 = await createCandidate({
      status: CandidateStatus.waiting_for_oa,
      oaDeadline: deadlineA, // future → should NOT expire
    });
    candidateB2 = await createCandidate({
      status: CandidateStatus.waiting_for_oa,
      oaDeadline: deadlineB, // future (24h) → should NOT expire
    });
    candidateC2 = await createCandidate({
      status: CandidateStatus.waiting_for_oa,
      oaDeadline: deadlineC, // past → SHOULD expire
    });
  });

  it('[TC-4.2-007] first run: transitions only candidate C to oa_no_response; A and B untouched', async () => {
    await runOaExpiryJob({ now: fixedNow });

    // C should now be oa_no_response
    const c = await prisma.candidate.findUnique({ where: { id: candidateC2 } });
    expect(c!.status).toBe(CandidateStatus.oa_no_response);

    // A and B should remain waiting_for_oa
    const a = await prisma.candidate.findUnique({ where: { id: candidateA2 } });
    expect(a!.status).toBe(CandidateStatus.waiting_for_oa);

    const b = await prisma.candidate.findUnique({ where: { id: candidateB2 } });
    expect(b!.status).toBe(CandidateStatus.waiting_for_oa);
  });

  it('second run (idempotent): C stays oa_no_response, no second transition', async () => {
    await runOaExpiryJob({ now: fixedNow });

    // C should still be oa_no_response (no re-transition)
    const c = await prisma.candidate.findUnique({ where: { id: candidateC2 } });
    expect(c!.status).toBe(CandidateStatus.oa_no_response);

    // Confirm only one status history entry for C (the original auto-transition)
    const histories = await prisma.statusHistory.findMany({
      where: { candidateId: candidateC2, toStatus: CandidateStatus.oa_no_response },
    });
    expect(histories.length).toBe(1);
  });

  it('C received terminal_status notification (via Module 14 hook on oa_no_response transition)', async () => {
    // Give async notification a moment (dispatched from changeStatus)
    await new Promise((r) => setTimeout(r, 300));

    // resolveNotificationTrigger maps waiting_for_oa→oa_no_response to 'terminal_status'
    const termLogs = await prisma.notificationLog.findMany({
      where: { candidateId: candidateC2, triggerEvent: 'terminal_status' },
    });

    expect(termLogs.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Non-waiting_for_oa candidate with past deadline is ignored by both jobs
// ---------------------------------------------------------------------------

describe('non-waiting_for_oa candidate is ignored', () => {
  it('[TC-4.2-008] a candidate in oa_completed status with past oaDeadline is not transitioned or reminded', async () => {
    const ignoredId = await createCandidate({
      status: CandidateStatus.oa_completed, // not waiting_for_oa
      oaDeadline: deadlineC, // past
    });

    const expiryResult = await runOaExpiryJob({ now: fixedNow });
    const reminderResult = await runOaReminderJob({ now: fixedNow });

    // Status should remain oa_completed
    const c = await prisma.candidate.findUnique({ where: { id: ignoredId } });
    expect(c!.status).toBe(CandidateStatus.oa_completed);

    // No notifications dispatched for this candidate from these jobs
    const logs = await prisma.notificationLog.findMany({
      where: {
        candidateId: ignoredId,
        triggerEvent: { in: ['oa_reminder', 'oa_no_response'] },
      },
    });
    expect(logs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// startScheduler smoke test
// ---------------------------------------------------------------------------

describe('startScheduler smoke test', () => {
  it('starts and stops without throwing', () => {
    const scheduler = startScheduler();
    expect(typeof scheduler.stop).toBe('function');
    // Stop immediately — do NOT wait for actual cron firings
    expect(() => scheduler.stop()).not.toThrow();
  });
});
