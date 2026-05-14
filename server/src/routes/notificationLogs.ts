import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { NotificationType, DeliveryStatus } from '@prisma/client';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../errors/HttpError.js';
import { prisma } from '../lib/prisma.js';
import { retrySendLog, type NotificationDeps } from '../services/notificationService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  candidateId: z.coerce.number().int().positive().optional(),
  type: z.nativeEnum(NotificationType).optional(),
  triggerEvent: z.string().optional(),
  deliveryStatus: z.nativeEnum(DeliveryStatus).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Router factory — injectable deps for testing
// ---------------------------------------------------------------------------

export function createNotificationLogsRouter(deps: NotificationDeps = {}): Router {
  const router = Router();

  // GET /notification-logs
  // Roles: coordinator
  router.get(
    '/',
    requireAuth,
    requireRole('coordinator'),
    validate({ query: listQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as z.infer<typeof listQuerySchema>;

      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
      const skip = (page - 1) * pageSize;

      const where: {
        candidateId?: number;
        type?: NotificationType;
        triggerEvent?: string;
        deliveryStatus?: DeliveryStatus;
      } = {};

      if (query.candidateId !== undefined) where.candidateId = query.candidateId;
      if (query.type !== undefined) where.type = query.type;
      if (query.triggerEvent !== undefined) where.triggerEvent = query.triggerEvent;
      if (query.deliveryStatus !== undefined) where.deliveryStatus = query.deliveryStatus;

      const [items, total] = await Promise.all([
        prisma.notificationLog.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { id: 'desc' },
        }),
        prisma.notificationLog.count({ where }),
      ]);

      res.json({ items, total, page, pageSize });
    }),
  );

  // POST /notification-logs/:id/retry
  // Roles: coordinator
  router.post(
    '/:id/retry',
    requireAuth,
    requireRole('coordinator'),
    validate({ params: idParamSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;

      // Verify log exists first for a clear 404
      const existing = await prisma.notificationLog.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', `NotificationLog ${id} not found`);
      }

      const log = await retrySendLog(id, deps);
      res.json({ log });
    }),
  );

  return router;
}

// Default export (for app.ts mount)
export const notificationLogsRouter = createNotificationLogsRouter();
