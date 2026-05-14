import jwt, { type SignOptions } from 'jsonwebtoken';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET is missing or too short (>=16 chars required).');
  }
  return secret;
}

function getExpiry(): SignOptions['expiresIn'] {
  return (process.env.JWT_EXPIRES_IN ?? '2h') as SignOptions['expiresIn'];
}

export function signToken(payload: object): string {
  return jwt.sign(payload, getSecret(), { expiresIn: getExpiry() });
}

export function verifyToken<T extends object = Record<string, unknown>>(token: string): T {
  return jwt.verify(token, getSecret()) as T;
}
