/**
 * Seed script to create notification logs for E2E test sub-module 1.4
 * Creates a mix of email/sms records in pending/sent/failed states.
 */
import { PrismaClient, NotificationType, DeliveryStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Pick first candidate with email to use as referent
  const candidateWithEmail = await prisma.candidate.findFirst({
    where: { email: { not: null } },
    select: { id: true, email: true, phone: true },
  });
  const candidateAny = await prisma.candidate.findFirst({
    select: { id: true, email: true, phone: true },
  });

  if (!candidateAny) {
    console.error('No candidates available');
    process.exit(1);
  }

  const cidEmail = candidateWithEmail?.id ?? candidateAny.id;
  const cidSms = candidateAny.id;
  const emailRecip = candidateWithEmail?.email ?? 'qa-test@test.local';
  const smsRecip = '13800138000';

  const now = new Date();
  const data = [
    // Sent email
    {
      candidateId: cidEmail,
      type: NotificationType.email,
      triggerEvent: 'new_to_oa',
      recipient: emailRecip,
      subject: 'OA Invitation',
      content: 'Please complete your online assessment.',
      deliveryStatus: DeliveryStatus.sent,
      sentAt: new Date(now.getTime() - 60_000 * 5),
      createdAt: new Date(now.getTime() - 60_000 * 60),
    },
    // Failed email
    {
      candidateId: cidEmail,
      type: NotificationType.email,
      triggerEvent: 'oa_reminder',
      recipient: emailRecip,
      subject: 'OA Reminder',
      content: 'Reminder: please complete your OA.',
      deliveryStatus: DeliveryStatus.failed,
      errorMessage: 'SMTP connection refused',
      createdAt: new Date(now.getTime() - 60_000 * 50),
    },
    // Pending email
    {
      candidateId: cidEmail,
      type: NotificationType.email,
      triggerEvent: 'date_confirmed',
      recipient: emailRecip,
      subject: 'Interview Confirmed',
      content: 'Your interview has been scheduled.',
      deliveryStatus: DeliveryStatus.pending,
      createdAt: new Date(now.getTime() - 60_000 * 40),
    },
    // Sent SMS
    {
      candidateId: cidSms,
      type: NotificationType.sms,
      triggerEvent: 'new_to_oa',
      recipient: smsRecip,
      subject: null,
      content: 'OA invitation: please complete assessment.',
      deliveryStatus: DeliveryStatus.sent,
      sentAt: new Date(now.getTime() - 60_000 * 30),
      createdAt: new Date(now.getTime() - 60_000 * 35),
    },
    // Failed SMS
    {
      candidateId: cidSms,
      type: NotificationType.sms,
      triggerEvent: 'oa_to_human',
      recipient: smsRecip,
      subject: null,
      content: 'Your OA review is pending human review.',
      deliveryStatus: DeliveryStatus.failed,
      errorMessage: 'SMS provider timeout',
      createdAt: new Date(now.getTime() - 60_000 * 20),
    },
    // Pending SMS
    {
      candidateId: cidSms,
      type: NotificationType.sms,
      triggerEvent: 'oa_reminder',
      recipient: smsRecip,
      subject: null,
      content: 'Reminder: complete your OA.',
      deliveryStatus: DeliveryStatus.pending,
      createdAt: new Date(now.getTime() - 60_000 * 10),
    },
  ];

  for (const d of data) {
    await prisma.notificationLog.create({ data: d });
  }
  console.log(`Seeded ${data.length} notification logs`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
