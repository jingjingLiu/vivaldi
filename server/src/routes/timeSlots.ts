import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../errors/HttpError.js';
import {
  listMySlots,
  createSlot,
  updateSlot,
  deleteSlot,
  listAvailableSlots,
} from '../services/timeSlotService.js';

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export const timeSlotsRouter = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;

const mineQuerySchema = z.object({
  from: z.string().regex(isoDateRegex, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(isoDateRegex, 'to must be YYYY-MM-DD').optional(),
});

const createSlotSchema = z.object({
  date: z.string().regex(isoDateRegex, 'date must be YYYY-MM-DD'),
  startTime: z.string().regex(timeRegex, 'startTime must be HH:MM'),
  endTime: z.string().regex(timeRegex, 'endTime must be HH:MM'),
});

const patchSlotSchema = z
  .object({
    date: z.string().regex(isoDateRegex, 'date must be YYYY-MM-DD').optional(),
    startTime: z.string().regex(timeRegex, 'startTime must be HH:MM').optional(),
    endTime: z.string().regex(timeRegex, 'endTime must be HH:MM').optional(),
  })
  .refine((v) => v.date !== undefined || v.startTime !== undefined || v.endTime !== undefined, {
    message: 'At least one of date, startTime, endTime must be provided',
  });

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const availableQuerySchema = z.object({
  positionId: z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// GET /time-slots/mine  (interviewer only)
// ---------------------------------------------------------------------------

timeSlotsRouter.get(
  '/mine',
  requireAuth,
  requireRole('interviewer'),
  validate({ query: mineQuerySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const query = req.query as z.infer<typeof mineQuerySchema>;
    const slots = await listMySlots(userId, query.from, query.to);
    res.json({ slots });
  }),
);

// Middleware: allow coordinator (internal role) OR candidate (kind='candidate')
function requireCoordOrCandidate(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
    return;
  }
  const isCoordinator = user.roles.includes('coordinator');
  const isCandidate = user.kind === 'candidate';
  if (!isCoordinator && !isCandidate) {
    next(new HttpError(403, 'FORBIDDEN', 'Insufficient role'));
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// GET /time-slots/available  (coordinator OR candidate)
// ---------------------------------------------------------------------------

timeSlotsRouter.get(
  '/available',
  requireAuth,
  requireCoordOrCandidate,
  validate({ query: availableQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as z.infer<typeof availableQuerySchema>;
    const slots = await listAvailableSlots(query.positionId);
    res.json({ slots });
  }),
);

// ---------------------------------------------------------------------------
// POST /time-slots  (interviewer only)
// ---------------------------------------------------------------------------

timeSlotsRouter.post(
  '/',
  requireAuth,
  requireRole('interviewer'),
  validate({ body: createSlotSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const body = req.body as z.infer<typeof createSlotSchema>;
    const slot = await createSlot(userId, body);
    res.status(201).json({ slot });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /time-slots/:id  (interviewer only)
// ---------------------------------------------------------------------------

timeSlotsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('interviewer'),
  validate({ params: idParamSchema, body: patchSlotSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof patchSlotSchema>;
    const slot = await updateSlot(userId, id, body);
    res.json({ slot });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /time-slots/:id  (interviewer only)
// ---------------------------------------------------------------------------

timeSlotsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('interviewer'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    await deleteSlot(userId, id);
    res.json({ ok: true });
  }),
);
