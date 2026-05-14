export interface AuthPrincipal {
  userId: number;
  roles: string[];
  kind: 'internal' | 'candidate';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPrincipal;
    }
  }
}
