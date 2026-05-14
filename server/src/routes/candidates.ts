import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CandidateStatus } from '@prisma/client';
import multer from 'multer';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError } from '../errors/HttpError.js';
import {
  uploadResume,
  listCandidates,
  getCandidateById,
  updateCandidateInfo,
  deleteCandidate,
  getResumeFileMeta,
} from '../services/candidateService.js';
import { changeStatus, listStatusHistory } from '../services/statusService.js';
import {
  createEvaluation,
  listEvaluations,
  getOaAnswers,
} from '../services/evaluationService.js';
import { readUpload } from '../lib/fileStorage.js';
import type { ResumeConverter } from '../services/resumeConverter.js';
import type { ResumeExtractor } from '../services/resumeExtractor.js';

// ---------------------------------------------------------------------------
// Types for injectable dependencies
// ---------------------------------------------------------------------------

export interface CandidatesRouterDeps {
  converter?: ResumeConverter;
  extractor?: ResumeExtractor;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCREENING_DECISION_STATUSES = new Set<CandidateStatus>([
  CandidateStatus.waiting_for_oa,
  CandidateStatus.rejected,
]);

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Allowed MIME types
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Multer setup (memory storage)
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'INVALID_FILE_TYPE', `Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.nativeEnum(CandidateStatus).optional(),
  positionId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const changeStatusSchema = z.object({
  toStatus: z.nativeEnum(CandidateStatus),
  note: z.string().max(1000).optional(),
});

const createEvaluationSchema = z.object({
  result: z.enum(['passed', 'failed']),
  comment: z.string().max(5000).optional(),
});

const patchCandidateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  gender: z.enum(['male', 'female']).optional(),
  email: z.string().email().optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,20}$/, 'phone must be digits with optional leading +, length 7-20')
    .optional(),
  resumeMarkdown: z.string().max(50000).optional(),
});

// ---------------------------------------------------------------------------
// Router factory — injectable deps for testing
// ---------------------------------------------------------------------------

export function createCandidatesRouter(deps: CandidatesRouterDeps = {}): Router {
  const router = Router();

  // POST /candidates/upload-resume
  // Roles: screener OR coordinator
  router.post(
    '/upload-resume',
    requireAuth,
    requireRole('screener', 'coordinator'),
    upload.single('file'),
    asyncHandler(async (req, res) => {
      // Multer errors (file too large) are passed to next; handle inline too
      if (!req.file) {
        throw new HttpError(400, 'MISSING_FILE', 'A file field is required');
      }

      const positionId = Number(req.body.positionId);
      if (!Number.isInteger(positionId) || positionId <= 0) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'positionId must be a positive integer');
      }

      const result = await uploadResume({
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        positionId,
        converter: deps.converter,
        extractor: deps.extractor,
      });

      res.status(201).json(result);
    }),
  );

  // GET /candidates
  // Roles: coordinator OR screener OR interviewer
  router.get(
    '/',
    requireAuth,
    requireRole('coordinator', 'screener', 'interviewer'),
    validate({ query: listQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as z.infer<typeof listQuerySchema>;
      const result = await listCandidates({
        q: query.q,
        status: query.status,
        positionId: query.positionId,
        page: query.page,
        pageSize: query.pageSize,
      });
      res.json(result);
    }),
  );

  // GET /candidates/:id
  // Roles: coordinator OR screener OR interviewer
  router.get(
    '/:id',
    requireAuth,
    requireRole('coordinator', 'screener', 'interviewer'),
    validate({ params: idParamSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
      const candidate = await getCandidateById(id, req.user);
      res.json({ candidate });
    }),
  );

  // PATCH /candidates/:id
  // Roles: coordinator OR screener
  router.patch(
    '/:id',
    requireAuth,
    requireRole('coordinator', 'screener'),
    validate({ params: idParamSchema, body: patchCandidateSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
      const body = req.body as z.infer<typeof patchCandidateSchema>;
      const candidate = await updateCandidateInfo(id, body);
      res.json({ candidate });
    }),
  );

  // DELETE /candidates/:id
  // Roles: coordinator OR screener
  router.delete(
    '/:id',
    requireAuth,
    requireRole('coordinator', 'screener'),
    validate({ params: idParamSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
      await deleteCandidate(id);
      res.status(204).send();
    }),
  );

  // POST /candidates/:id/status
  // Roles: coordinator OR screener
  router.post(
    '/:id/status',
    requireAuth,
    requireRole('coordinator', 'screener'),
    validate({ params: idParamSchema, body: changeStatusSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
      const body = req.body as z.infer<typeof changeStatusSchema>;
      const operatorId = req.user!.userId;

      if (req.user!.roles.includes('screener') && !req.user!.roles.includes('coordinator')) {
        const candidate = await getCandidateById(id, req.user);
        const canMakeScreeningDecision =
          candidate.status === CandidateStatus.new && SCREENING_DECISION_STATUSES.has(body.toStatus);
        if (!canMakeScreeningDecision) {
          // Screeners own only the first screening decision; later workflow states stay coordinator-only.
          res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient role' });
          return;
        }
      }

      await changeStatus(id, body.toStatus, operatorId, body.note);
      const candidate = await getCandidateById(id, req.user);
      res.json({ candidate });
    }),
  );

  // GET /candidates/:id/status-history
  // Roles: coordinator OR screener OR interviewer
  router.get(
    '/:id/status-history',
    requireAuth,
    requireRole('coordinator', 'screener', 'interviewer'),
    validate({ params: idParamSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
      const history = await listStatusHistory(id);
      res.json({ history });
    }),
  );

  // GET /candidates/:id/resume-file
  // Roles: coordinator OR screener OR interviewer
  router.get(
    '/:id/resume-file',
    requireAuth,
    requireRole('coordinator', 'screener', 'interviewer'),
    validate({ params: idParamSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
      const meta = await getResumeFileMeta(id);
      const { stream, stat } = await readUpload(meta.storedFilename);
      res.setHeader('Content-Type', meta.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(meta.originalFilename)}"`,
      );
      res.setHeader('Content-Length', stat.size);
      stream.pipe(res);
    }),
  );

  // POST /candidates/:id/evaluations
  // Roles: interviewer only
  router.post(
    '/:id/evaluations',
    requireAuth,
    requireRole('interviewer'),
    validate({ params: idParamSchema, body: createEvaluationSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
      const body = req.body as z.infer<typeof createEvaluationSchema>;
      const interviewerId = req.user!.userId;
      const evaluation = await createEvaluation(interviewerId, id, body);
      res.status(201).json({ evaluation });
    }),
  );

  // GET /candidates/:id/evaluations
  // Roles: coordinator OR interviewer
  router.get(
    '/:id/evaluations',
    requireAuth,
    requireRole('coordinator', 'interviewer'),
    validate({ params: idParamSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
      const evaluations = await listEvaluations(id);
      res.json({ evaluations });
    }),
  );

  // GET /candidates/:id/oa-answers
  // Roles: coordinator OR interviewer
  router.get(
    '/:id/oa-answers',
    requireAuth,
    requireRole('coordinator', 'interviewer'),
    validate({ params: idParamSchema }),
    asyncHandler(async (req, res) => {
      const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
      const result = await getOaAnswers(id);
      res.json(result);
    }),
  );

  return router;
}

// Default export (for app.ts mount)
export const candidatesRouter = createCandidatesRouter();
