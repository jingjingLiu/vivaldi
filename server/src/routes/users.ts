import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listUsers, getUserById, createUser, updateUser, resetPassword } from '../services/userService.js';

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export const usersRouter = Router();

// All users endpoints require auth + coordinator role
usersRouter.use(requireAuth, requireRole('coordinator'));

const roleEnum = z.nativeEnum(Role);

const listQuerySchema = z.object({
  q: z.string().optional(),
  role: roleEnum.optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const createUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9_.-]+$/, 'username may only contain lowercase letters, digits, _, ., -'),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  roles: z.array(roleEnum).min(1),
  locale: z.enum(['en', 'zhCN']).optional(),
});

const patchUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  locale: z.enum(['en', 'zhCN']).optional(),
  roles: z.array(roleEnum).min(1).optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8),
});

// GET /users
usersRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as z.infer<typeof listQuerySchema>;
    const result = await listUsers({
      q: query.q,
      role: query.role,
      page: query.page,
      pageSize: query.pageSize,
    });
    res.json(result);
  }),
);

// GET /users/:id
usersRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const user = await getUserById(id);
    res.json({ user });
  }),
);

// POST /users
usersRouter.post(
  '/',
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createUserSchema>;
    const user = await createUser(body);
    res.status(201).json({ user });
  }),
);

// PATCH /users/:id
usersRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: patchUserSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const body = req.body as z.infer<typeof patchUserSchema>;
    const user = await updateUser(id, body);
    res.json({ user });
  }),
);

// POST /users/:id/password
usersRouter.post(
  '/:id/password',
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as unknown as z.infer<typeof idParamSchema>;
    const { password } = req.body as z.infer<typeof resetPasswordSchema>;
    await resetPassword(id, password);
    res.json({ ok: true });
  }),
);
