import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCandidate } from '../middleware/auth.js';
import {
  getOaState,
  startOa,
  getQuestionsForCandidate,
  saveAnswer,
  submitOa,
} from '../services/oaRuntimeService.js';

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export const oaRouter = Router();

// All /oa routes require a valid session + must be a candidate
oaRouter.use(requireAuth, requireCandidate);

const questionIdParamSchema = z.object({
  questionId: z.coerce.number().int().positive(),
});

const saveAnswerBodySchema = z.object({
  answerContent: z.string(),
});

// GET /oa — state check, always allowed
oaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const candidateId = req.user!.userId;
    const result = await getOaState(candidateId);
    res.json(result);
  }),
);

// POST /oa/start
oaRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    const candidateId = req.user!.userId;
    const result = await startOa(candidateId);
    res.json(result);
  }),
);

// GET /oa/questions
oaRouter.get(
  '/questions',
  asyncHandler(async (req, res) => {
    const candidateId = req.user!.userId;
    const result = await getQuestionsForCandidate(candidateId);
    res.json(result);
  }),
);

// PUT /oa/answers/:questionId
oaRouter.put(
  '/answers/:questionId',
  validate({ params: questionIdParamSchema, body: saveAnswerBodySchema }),
  asyncHandler(async (req, res) => {
    const candidateId = req.user!.userId;
    const { questionId } = req.params as unknown as z.infer<typeof questionIdParamSchema>;
    const { answerContent } = req.body as z.infer<typeof saveAnswerBodySchema>;
    const result = await saveAnswer(candidateId, questionId, answerContent);
    res.json({ ok: true, updatedAt: result.updatedAt });
  }),
);

// POST /oa/submit
oaRouter.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const candidateId = req.user!.userId;
    const result = await submitOa(candidateId, false);
    res.json(result);
  }),
);
