import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCandidate } from '../middleware/auth.js';
import {
  listAvailableForCandidate,
  bookSlot,
  getOwnBooking,
} from '../services/candidateSlotService.js';

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export const candidateSlotsRouter = Router();

// All routes require auth + candidate kind
candidateSlotsRouter.use(requireAuth, requireCandidate);

const slotIdParamSchema = z.object({
  slotId: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------------------
// GET /candidate/time-slots/available
// ---------------------------------------------------------------------------

candidateSlotsRouter.get(
  '/available',
  asyncHandler(async (req, res) => {
    const candidateId = req.user!.userId;
    const result = await listAvailableForCandidate(candidateId);
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// GET /candidate/time-slots/mine
// ---------------------------------------------------------------------------

candidateSlotsRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const candidateId = req.user!.userId;
    const slot = await getOwnBooking(candidateId);
    res.json({ slot });
  }),
);

// ---------------------------------------------------------------------------
// POST /candidate/time-slots/:slotId/book
// ---------------------------------------------------------------------------

candidateSlotsRouter.post(
  '/:slotId/book',
  validate({ params: slotIdParamSchema }),
  asyncHandler(async (req, res) => {
    const candidateId = req.user!.userId;
    const { slotId } = req.params as unknown as z.infer<typeof slotIdParamSchema>;
    const result = await bookSlot(candidateId, slotId);
    res.json(result);
  }),
);
