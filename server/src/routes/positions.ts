import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listPositions,
  getPositionById,
  createPosition,
  updatePosition,
  deletePosition,
} from '../services/positionService.js';

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export const positionsRouter = Router();

// All positions endpoints require auth + coordinator role
positionsRouter.use(requireAuth, requireRole('coordinator'));

const listQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const createPositionSchema = z.object({
  name: z.string().min(1).max(100),
  interviewerIds: z.array(z.number().int().positive()).optional(),
});

const patchPositionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  interviewerIds: z.array(z.number().int().positive()).optional(),
});

// GET /positions
positionsRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as z.infer<typeof listQuerySchema>;
    const result = await listPositions({
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
    res.json(result);
  }),
);

// GET /positions/:id
positionsRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const position = await getPositionById(id);
    res.json({ position });
  }),
);

// POST /positions
positionsRouter.post(
  '/',
  validate({ body: createPositionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createPositionSchema>;
    const position = await createPosition(body);
    res.status(201).json({ position });
  }),
);

// PATCH /positions/:id
positionsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: patchPositionSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof patchPositionSchema>;
    const position = await updatePosition(id, body);
    res.json({ position });
  }),
);

// DELETE /positions/:id
positionsRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    await deletePosition(id);
    res.json({ ok: true });
  }),
);
