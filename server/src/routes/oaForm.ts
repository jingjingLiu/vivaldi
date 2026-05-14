import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../errors/HttpError.js';
import {
  getOaFormByPosition,
  upsertOaForm,
  deleteOaForm,
} from '../services/oaFormService.js';

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export const oaFormRouter = Router({ mergeParams: true });

// All OA form endpoints require auth + coordinator OR interviewer role
oaFormRouter.use(requireAuth, requireRole('coordinator', 'interviewer'));

const positionIdParamSchema = z.object({
  positionId: z.coerce.number().int().positive(),
});

const questionSchema = z.object({
  questionText: z.string().min(1).max(5000),
  answerType: z.enum(['text', 'code']),
  sortOrder: z.number().int().min(0),
});

const putOaFormSchema = z.object({
  timeLimitMinutes: z.number().int().min(1).max(360),
  instructionEn: z.string().max(20000).optional(),
  instructionZh: z.string().max(20000).optional(),
  questions: z.array(questionSchema).min(1).max(50),
});

// GET /positions/:positionId/oa-form
oaFormRouter.get(
  '/',
  validate({ params: positionIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { positionId } = req.params as unknown as z.infer<typeof positionIdParamSchema>;
    const form = await getOaFormByPosition(positionId);
    res.json({ form });
  }),
);

// PUT /positions/:positionId/oa-form
oaFormRouter.put(
  '/',
  validate({ params: positionIdParamSchema, body: putOaFormSchema }),
  asyncHandler(async (req, res) => {
    const { positionId } = req.params as unknown as z.infer<typeof positionIdParamSchema>;
    const body = req.body as z.infer<typeof putOaFormSchema>;

    // Check for duplicate sortOrders
    const sortOrders = body.questions.map((q) => q.sortOrder);
    const uniqueSortOrders = new Set(sortOrders);
    if (uniqueSortOrders.size !== sortOrders.length) {
      throw new HttpError(400, 'DUPLICATE_SORT_ORDER', 'questions contain duplicate sortOrder values');
    }

    const form = await upsertOaForm(positionId, body);
    res.json({ form });
  }),
);

// DELETE /positions/:positionId/oa-form
oaFormRouter.delete(
  '/',
  validate({ params: positionIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { positionId } = req.params as unknown as z.infer<typeof positionIdParamSchema>;
    await deleteOaForm(positionId);
    res.json({ ok: true });
  }),
);
