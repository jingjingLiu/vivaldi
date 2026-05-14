// ---------------------------------------------------------------------------
// Notification Service — dispatcher for all trigger events
//
// NOTE: locale is currently hardcoded to 'zhCN' for all candidates.
// TODO: tie locale to candidate settings once the URS is extended.
//
// NOTE: for date_confirmed, we log against the candidate only and include
// the interviewer's email in the content if available. A dedicated
// interviewer-side log is not created to keep scope minimal.
// ---------------------------------------------------------------------------

import { NotificationType, DeliveryStatus } from '@prisma/client';
import type { NotificationLog } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getSettings } from './settingService.js';
import { renderTemplate, type Locale } from './notificationTemplates.js';
import { ConfiguredEmailSender, type EmailSender } from './emailSender.js';
import { ConfiguredSmsSender, type SmsSender } from './smsSender.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TriggerEvent =
  | 'new_to_oa'
  | 'oa_reminder'
  | 'oa_no_response'
  | 'oa_to_human'
  | 'date_confirmed'
  | 'terminal_status';

export interface NotificationDeps {
  email?: EmailSender;
  sms?: SmsSender;
}

export interface DispatchParams {
  candidateId: number;
  triggerEvent: TriggerEvent;
  extraVars?: Record<string, string>;
  deps?: NotificationDeps;
}

// ---------------------------------------------------------------------------
// Channel map: which channels each trigger event uses
// ---------------------------------------------------------------------------

type Channel = 'email' | 'sms';

const TRIGGER_CHANNELS: Record<TriggerEvent, Channel[]> = {
  new_to_oa: ['email', 'sms'],
  oa_reminder: ['email', 'sms'],
  oa_no_response: ['email'],
  oa_to_human: ['email', 'sms'],
  date_confirmed: ['email'],
  terminal_status: ['email'],
};

// ---------------------------------------------------------------------------
// Module-level deps (override for tests via setGlobalNotificationDeps)
// ---------------------------------------------------------------------------

let _globalDeps: NotificationDeps = {};

export function setGlobalNotificationDeps(deps: NotificationDeps): void {
  _globalDeps = deps;
}

export function resetGlobalNotificationDeps(): void {
  _globalDeps = {};
}

// ---------------------------------------------------------------------------
// dispatchNotification
// ---------------------------------------------------------------------------

export async function dispatchNotification(
  p: DispatchParams,
): Promise<{ logs: NotificationLog[] }> {
  const deps = { ..._globalDeps, ...p.deps };

  // 1. Load candidate with position
  const candidate = await prisma.candidate.findUnique({
    where: { id: p.candidateId },
    include: { position: { select: { name: true } } },
  });
  if (!candidate) {
    throw new Error(`Candidate ${p.candidateId} not found`);
  }

  // 2. Determine locale (TODO: tie to candidate settings)
  const locale: Locale = 'zhCN';

  // 3. Load settings
  const settings = await getSettings();
  const emailSender: EmailSender = deps.email ?? new ConfiguredEmailSender(settings.smtp);
  const smsSender: SmsSender = deps.sms ?? new ConfiguredSmsSender(settings.sms);

  // 4. Build template vars
  const oaDeadlineStr = candidate.oaDeadline
    ? candidate.oaDeadline.toISOString().slice(0, 10)
    : '';

  const vars: Record<string, string> = {
    candidateName: candidate.name ?? '',
    oneTimeCode: candidate.oneTimeCode,
    oaLink: settings.baseUrl ? `${settings.baseUrl}/oa/${candidate.oneTimeCode}` : '',
    oaDeadline: oaDeadlineStr,
    statusLink: settings.baseUrl ? `${settings.baseUrl}/candidate/slots` : '',
    slotDate: '',
    slotTime: '',
    interviewerName: '',
    positionName: candidate.position.name,
    resultText: '',
    companyName: settings.companyName,
    ...p.extraVars,
  };

  // 5. Determine channels
  const channels = TRIGGER_CHANNELS[p.triggerEvent];

  const logs: NotificationLog[] = [];

  for (const channel of channels) {
    if (channel === 'email') {
      const recipient = candidate.email;

      if (!recipient) {
        // Create failed log — no email address
        const log = await prisma.notificationLog.create({
          data: {
            candidateId: p.candidateId,
            type: NotificationType.email,
            triggerEvent: p.triggerEvent,
            recipient: '',
            subject: null,
            content: '',
            deliveryStatus: DeliveryStatus.failed,
            errorMessage: 'no email',
          },
        });
        logs.push(log);
        continue;
      }

      const rendered = renderTemplate(p.triggerEvent, locale, vars);

      // Create pending log
      const log = await prisma.notificationLog.create({
        data: {
          candidateId: p.candidateId,
          type: NotificationType.email,
          triggerEvent: p.triggerEvent,
          recipient,
          subject: rendered.subject,
          content: rendered.text,
          deliveryStatus: DeliveryStatus.pending,
        },
      });

      // Attempt send
      try {
        await emailSender.send({
          to: recipient,
          subject: rendered.subject,
          htmlBody: rendered.html,
          textBody: rendered.text,
        });
        const updated = await prisma.notificationLog.update({
          where: { id: log.id },
          data: { deliveryStatus: DeliveryStatus.sent, sentAt: new Date() },
        });
        logs.push(updated);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const updated = await prisma.notificationLog.update({
          where: { id: log.id },
          data: { deliveryStatus: DeliveryStatus.failed, errorMessage },
        });
        logs.push(updated);
      }
    } else if (channel === 'sms') {
      const recipient = candidate.phone;

      if (!recipient) {
        // Create failed log — no phone number
        const log = await prisma.notificationLog.create({
          data: {
            candidateId: p.candidateId,
            type: NotificationType.sms,
            triggerEvent: p.triggerEvent,
            recipient: '',
            subject: null,
            content: '',
            deliveryStatus: DeliveryStatus.failed,
            errorMessage: 'no phone',
          },
        });
        logs.push(log);
        continue;
      }

      const rendered = renderTemplate(p.triggerEvent, locale, vars);

      // Create pending log
      const log = await prisma.notificationLog.create({
        data: {
          candidateId: p.candidateId,
          type: NotificationType.sms,
          triggerEvent: p.triggerEvent,
          recipient,
          subject: null,
          content: rendered.text,
          deliveryStatus: DeliveryStatus.pending,
        },
      });

      // Attempt send
      try {
        await smsSender.send({ to: recipient, text: rendered.text });
        const updated = await prisma.notificationLog.update({
          where: { id: log.id },
          data: { deliveryStatus: DeliveryStatus.sent, sentAt: new Date() },
        });
        logs.push(updated);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const updated = await prisma.notificationLog.update({
          where: { id: log.id },
          data: { deliveryStatus: DeliveryStatus.failed, errorMessage },
        });
        logs.push(updated);
      }
    }
  }

  return { logs };
}

// ---------------------------------------------------------------------------
// retrySendLog — re-send a stored notification log
// ---------------------------------------------------------------------------

export async function retrySendLog(
  logId: number,
  deps?: NotificationDeps,
): Promise<NotificationLog> {
  const resolvedDeps = { ..._globalDeps, ...deps };
  const settings = await getSettings();
  const emailSender: EmailSender = resolvedDeps.email ?? new ConfiguredEmailSender(settings.smtp);
  const smsSender: SmsSender = resolvedDeps.sms ?? new ConfiguredSmsSender(settings.sms);

  const log = await prisma.notificationLog.findUnique({ where: { id: logId } });
  if (!log) {
    throw new Error(`NotificationLog ${logId} not found`);
  }

  try {
    if (log.type === NotificationType.email) {
      await emailSender.send({
        to: log.recipient,
        subject: log.subject ?? '',
        htmlBody: log.content,
        textBody: log.content,
      });
    } else {
      await smsSender.send({ to: log.recipient, text: log.content });
    }

    return await prisma.notificationLog.update({
      where: { id: logId },
      data: { deliveryStatus: DeliveryStatus.sent, sentAt: new Date(), errorMessage: null },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return await prisma.notificationLog.update({
      where: { id: logId },
      data: { deliveryStatus: DeliveryStatus.failed, errorMessage },
    });
  }
}
