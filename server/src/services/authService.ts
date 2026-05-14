import { prisma } from '../lib/prisma.js';
import { verifyPassword } from '../lib/password.js';
import { HttpError } from '../errors/HttpError.js';
import type { AuthPrincipal } from '../types/express.d.js';
import { TERMINAL_STATUSES } from './statusService.js';

export async function authenticateInternal(username: string, password: string): Promise<AuthPrincipal> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { roles: true },
  });

  if (!user) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  if (!user.enabled) {
    throw new HttpError(403, 'ACCOUNT_DISABLED', 'Account is disabled, please contact administrator');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  return {
    userId: user.id,
    roles: user.roles.map((r) => r.role),
    kind: 'internal',
  };
}

export async function authenticateCandidate(oneTimeCode: string, phoneLast4: string): Promise<AuthPrincipal> {
  const candidate = await prisma.candidate.findUnique({ where: { oneTimeCode } });

  if (!candidate || !candidate.phone) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid code or phone');
  }

  if (TERMINAL_STATUSES.includes(candidate.status)) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid code or phone');
  }

  const last4 = candidate.phone.slice(-4);
  if (last4 !== phoneLast4) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid code or phone');
  }

  return {
    userId: candidate.id,
    roles: [],
    kind: 'candidate',
  };
}
