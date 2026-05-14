import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getUnreadCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/userNotificationService.js';

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
  unreadOnly: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const userNotificationsRouter = Router();

// Every station message endpoint is scoped to the current internal user.
userNotificationsRouter.use(requireAuth, requireRole('coordinator', 'screener', 'interviewer'));

userNotificationsRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as z.infer<typeof listQuerySchema>;
    const result = await listMyNotifications({
      userId: req.user!.userId,
      unreadOnly: query.unreadOnly,
      page: query.page,
      pageSize: query.pageSize,
    });
    res.json(result);
  }),
);

userNotificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const count = await getUnreadCount(req.user!.userId);
    res.json({ count });
  }),
);

userNotificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await markAllNotificationsRead(req.user!.userId);
    res.json(result);
  }),
);

userNotificationsRouter.post(
  '/:id/read',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const notification = await markNotificationRead(id, req.user!.userId);
    res.json({ notification });
  }),
);
