// ---------------------------------------------------------------------------
// Scheduled Jobs Service
//
// Implements two periodic jobs:
//   1. OA Reminder — sends oa_reminder notification 2 days before oaDeadline
//   2. OA Expiry   — auto-transitions waiting_for_oa → oa_no_response when
//                    oaDeadline has passed
//
// Both jobs are idempotent: duplicate sends / transitions are prevented.
// ---------------------------------------------------------------------------

import { schedule, type ScheduledTask } from 'node-cron';
import { CandidateStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { dispatchNotification } from './notificationService.js';
import { changeStatus } from './statusService.js';

// ---------------------------------------------------------------------------
// runOaReminderJob
//
// Finds candidates with status='waiting_for_oa' whose oaDeadline falls within
// [now+47h, now+49h] and who have NOT yet received an oa_reminder in the last
// 24h. For each such candidate, dispatches an oa_reminder notification.
// ---------------------------------------------------------------------------

export async function runOaReminderJob(deps?: { now?: Date }): Promise<{ sent: number }> {
  const now = deps?.now ?? new Date();
  logger.info({ now }, '[scheduledJobs] runOaReminderJob start');

  const windowStart = new Date(now.getTime() + 47 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 49 * 60 * 60 * 1000);
  const dedupeWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Find candidates in waiting_for_oa with oaDeadline in [now+47h, now+49h]
  const candidates = await prisma.candidate.findMany({
    where: {
      status: CandidateStatus.waiting_for_oa,
      oaDeadline: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    select: { id: true },
  });

  let sent = 0;

  for (const candidate of candidates) {
    try {
      // Check for an existing oa_reminder log in the last 24h (idempotency)
      const existing = await prisma.notificationLog.findFirst({
        where: {
          candidateId: candidate.id,
          triggerEvent: 'oa_reminder',
          createdAt: { gte: dedupeWindow },
        },
        select: { id: true },
      });

      if (existing) {
        logger.info(
          { candidateId: candidate.id },
          '[scheduledJobs] oa_reminder already sent — skipping',
        );
        continue;
      }

      await dispatchNotification({ candidateId: candidate.id, triggerEvent: 'oa_reminder' });
      sent++;
      logger.info({ candidateId: candidate.id }, '[scheduledJobs] oa_reminder dispatched');
    } catch (err) {
      logger.error(
        { err, candidateId: candidate.id },
        '[scheduledJobs] oa_reminder dispatch failed — continuing',
      );
    }
  }

  logger.info({ sent }, '[scheduledJobs] runOaReminderJob end');
  return { sent };
}

// ---------------------------------------------------------------------------
// runOaExpiryJob
//
// Finds candidates with status='waiting_for_oa' and oaDeadline < now. For each,
// calls changeStatus(..., 'oa_no_response', ...) which fires the oa_no_response
// + terminal_status notifications via the Module 14 hook.
//
// Idempotency: changeStatus will throw TERMINAL_STATUS if already transitioned;
// we catch errors per candidate and keep processing.
// ---------------------------------------------------------------------------

export async function runOaExpiryJob(deps?: { now?: Date }): Promise<{ transitioned: number }> {
  const now = deps?.now ?? new Date();
  logger.info({ now }, '[scheduledJobs] runOaExpiryJob start');

  const candidates = await prisma.candidate.findMany({
    where: {
      status: CandidateStatus.waiting_for_oa,
      oaDeadline: { lt: now },
    },
    select: { id: true },
  });

  let transitioned = 0;

  for (const candidate of candidates) {
    try {
      await changeStatus(
        candidate.id,
        CandidateStatus.oa_no_response,
        null,
        'auto-transition: OA deadline passed',
      );
      transitioned++;
      logger.info(
        { candidateId: candidate.id },
        '[scheduledJobs] auto-transitioned to oa_no_response',
      );
    } catch (err) {
      logger.error(
        { err, candidateId: candidate.id },
        '[scheduledJobs] oa_expiry transition failed — continuing',
      );
    }
  }

  logger.info({ transitioned }, '[scheduledJobs] runOaExpiryJob end');
  return { transitioned };
}

// ---------------------------------------------------------------------------
// startScheduler
//
// Schedules both jobs to run every hour (on the hour). Returns a { stop() }
// handle that unschedules all tasks gracefully.
// ---------------------------------------------------------------------------

export function startScheduler(): { stop: () => void } {
  const tasks: ScheduledTask[] = [];

  const reminderTask = schedule('0 * * * *', async () => {
    try {
      await runOaReminderJob();
    } catch (err) {
      logger.error({ err }, '[scheduledJobs] unhandled error in reminderTask');
    }
  });

  const expiryTask = schedule('0 * * * *', async () => {
    try {
      await runOaExpiryJob();
    } catch (err) {
      logger.error({ err }, '[scheduledJobs] unhandled error in expiryTask');
    }
  });

  tasks.push(reminderTask, expiryTask);

  logger.info('[scheduledJobs] scheduler started (0 * * * *)');

  return {
    stop: () => {
      for (const task of tasks) {
        task.stop();
      }
      logger.info('[scheduledJobs] scheduler stopped');
    },
  };
}
