import type { RequestHandler } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { HttpError } from '../errors/HttpError.js';
import type { AuthPrincipal } from '../types/express.js';

export const AUTH_COOKIE_NAME = 'vivaldi_session';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token || typeof token !== 'string') {
    return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
  }
  try {
    const decoded = verifyToken<AuthPrincipal>(token);
    if (typeof decoded.userId !== 'number' || !Array.isArray(decoded.roles) || !decoded.kind) {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Invalid token payload'));
    }
    req.user = decoded;
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHENTICATED', 'Invalid or expired token'));
  }
};

export function requireRole(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
    const ok = roles.some((r) => req.user!.roles.includes(r));
    if (!ok) return next(new HttpError(403, 'FORBIDDEN', 'Insufficient role'));
    next();
  };
}

export const requireCandidate: RequestHandler = (req, _res, next) => {
  if (!req.user || req.user.kind !== 'candidate') {
    return next(new HttpError(403, 'FORBIDDEN', 'Candidate authentication required'));
  }
  next();
};
