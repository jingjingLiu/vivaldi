import { Router, type Request, type Response } from 'express';
import { requireAuth, requireCandidate } from '../middleware/auth.js';
import { getCandidateById } from '../services/candidateService.js';

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export const candidatePortalRouter = Router();

// Candidate portal APIs are scoped to the logged-in candidate only.
candidatePortalRouter.use(requireAuth, requireCandidate);

candidatePortalRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const candidate = await getCandidateById(req.user!.userId);
    res.json({ candidate });
  }),
);
