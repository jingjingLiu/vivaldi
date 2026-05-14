import { Role, UserNotificationEvent, type CandidateStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../errors/HttpError.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserNotificationItem {
  id: number;
  userId: number;
  candidateId: number | null;
  event: UserNotificationEvent;
  title: string;
  content: string;
  readAt: Date | null;
  createdAt: Date;
  candidate: {
    id: number;
    name: string | null;
    status: CandidateStatus;
    positionName: string;
  } | null;
}

export interface ListMyNotificationsOptions {
  userId: number;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListMyNotificationsResult {
  items: UserNotificationItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateUserNotificationsInput {
  userIds: number[];
  candidateId: number;
  event: UserNotificationEvent;
  title: string;
  content: string;
}

export interface NotifyInterviewBookedInput {
  candidateId: number;
  interviewerId: number;
  slotDate: string;
  slotTime: string;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeNotification(n: {
  id: number;
  userId: number;
  candidateId: number | null;
  event: UserNotificationEvent;
  title: string;
  content: string;
  readAt: Date | null;
  createdAt: Date;
  candidate: {
    id: number;
    name: string | null;
    status: CandidateStatus;
    position: { name: string };
  } | null;
}): UserNotificationItem {
  return {
    id: n.id,
    userId: n.userId,
    candidateId: n.candidateId,
    event: n.event,
    title: n.title,
    content: n.content,
    readAt: n.readAt,
    createdAt: n.createdAt,
    candidate: n.candidate
      ? {
          id: n.candidate.id,
          name: n.candidate.name,
          status: n.candidate.status,
          positionName: n.candidate.position.name,
        }
      : null,
  };
}

function candidateDisplayName(candidate: { name: string | null; id: number }): string {
  return candidate.name || `候选人 #${candidate.id}`;
}

function dedupeUserIds(userIds: number[]): number[] {
  return [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
}

// ---------------------------------------------------------------------------
// Recipient helpers
// ---------------------------------------------------------------------------

async function listEnabledCoordinatorIds(): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: {
      enabled: true,
      roles: { some: { role: Role.coordinator } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

async function ensureEnabledUserIds(userIds: number[]): Promise<number[]> {
  const distinctIds = dedupeUserIds(userIds);
  if (distinctIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: distinctIds }, enabled: true },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ---------------------------------------------------------------------------
// Create notifications
// ---------------------------------------------------------------------------

export async function createUserNotifications(input: CreateUserNotificationsInput): Promise<{ count: number }> {
  const userIds = await ensureEnabledUserIds(input.userIds);
  if (userIds.length === 0) return { count: 0 };

  const result = await prisma.userNotification.createMany({
    data: userIds.map((userId) => ({
      userId,
      candidateId: input.candidateId,
      event: input.event,
      title: input.title,
      content: input.content,
    })),
    // The unique key keeps workflow retries from generating duplicate unread messages.
    skipDuplicates: true,
  });

  return { count: result.count };
}

export async function notifyOaCompleted(candidateId: number): Promise<{ count: number }> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { position: { select: { name: true } } },
  });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${candidateId} not found`);
  }

  const coordinatorIds = await listEnabledCoordinatorIds();
  return createUserNotifications({
    userIds: coordinatorIds,
    candidateId,
    event: UserNotificationEvent.oa_completed,
    title: '候选人已完成 OA',
    content: `${candidateDisplayName(candidate)} 已完成 ${candidate.position.name} 的 OA，请进入候选人详情进行复核。`,
  });
}

export async function notifyInterviewBooked(input: NotifyInterviewBookedInput): Promise<{ count: number }> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: input.candidateId },
    include: { position: { select: { name: true } } },
  });
  if (!candidate) {
    throw new HttpError(404, 'NOT_FOUND', `Candidate ${input.candidateId} not found`);
  }

  const coordinatorIds = await listEnabledCoordinatorIds();
  const userIds = dedupeUserIds([...coordinatorIds, input.interviewerId]);
  return createUserNotifications({
    userIds,
    candidateId: input.candidateId,
    event: UserNotificationEvent.interview_booked,
    title: '候选人已确认面试时间',
    content: `${candidateDisplayName(candidate)} 已确认 ${candidate.position.name} 的面试时间：${input.slotDate} ${input.slotTime}。`,
  });
}

// ---------------------------------------------------------------------------
// Query and read state
// ---------------------------------------------------------------------------

export async function listMyNotifications(
  opts: ListMyNotificationsOptions,
): Promise<ListMyNotificationsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where = {
    userId: opts.userId,
    ...(opts.unreadOnly ? { readAt: null } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.userNotification.findMany({
      where,
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            status: true,
            position: { select: { name: true } },
          },
        },
      },
      skip,
      take: pageSize,
      orderBy: { id: 'desc' },
    }),
    prisma.userNotification.count({ where }),
  ]);

  return {
    items: items.map(serializeNotification),
    total,
    page,
    pageSize,
  };
}

export async function getUnreadCount(userId: number): Promise<number> {
  return prisma.userNotification.count({ where: { userId, readAt: null } });
}

export async function markNotificationRead(id: number, userId: number): Promise<UserNotificationItem> {
  const existing = await prisma.userNotification.findFirst({
    where: { id, userId },
    select: { id: true, readAt: true },
  });
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', `UserNotification ${id} not found`);
  }

  if (existing.readAt === null) {
    await prisma.userNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  const notification = await prisma.userNotification.findUniqueOrThrow({
    where: { id },
    include: {
      candidate: {
        select: {
          id: true,
          name: true,
          status: true,
          position: { select: { name: true } },
        },
      },
    },
  });

  return serializeNotification(notification);
}

export async function markAllNotificationsRead(userId: number): Promise<{ count: number }> {
  const result = await prisma.userNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { count: result.count };
}
