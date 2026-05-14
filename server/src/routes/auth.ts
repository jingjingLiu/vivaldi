import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, AUTH_COOKIE_NAME } from '../middleware/auth.js';
import { createLoginRateLimiter } from '../middleware/rateLimit.js';
import { signToken } from '../lib/jwt.js';
import { authenticateInternal, authenticateCandidate } from '../services/authService.js';
import type { AuthPrincipal } from '../types/express.d.js';

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export const authRouter = Router();

const loginLimiter = createLoginRateLimiter();

const internalLoginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1),
});

const candidateLoginSchema = z.object({
  oneTimeCode: z.string().min(1).max(10),
  phoneLast4: z.string().regex(/^\d{4}$/, 'phoneLast4 must be 4 digits'),
});

function setSessionCookie(res: Response, principal: AuthPrincipal): void {
  const token = signToken(principal);
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    // Zeabur 前后端分别使用不同子域名，生产环境需要允许跨站 XHR 携带会话 Cookie。
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 2 * 60 * 60 * 1000,
    path: '/',
  });
}

authRouter.post(
  '/login',
  loginLimiter,
  validate({ body: internalLoginSchema }),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as z.infer<typeof internalLoginSchema>;
    const principal = await authenticateInternal(username, password);
    setSessionCookie(res, principal);
    res.json({ user: principal });
  }),
);

authRouter.post(
  '/candidate-login',
  loginLimiter,
  validate({ body: candidateLoginSchema }),
  asyncHandler(async (req, res) => {
    const { oneTimeCode, phoneLast4 } = req.body as z.infer<typeof candidateLoginSchema>;
    const principal = await authenticateCandidate(oneTimeCode, phoneLast4);
    setSessionCookie(res, principal);
    res.json({ user: principal });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
