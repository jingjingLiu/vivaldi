import { Role, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { HttpError } from '../errors/HttpError.js';

export interface SerializedUser {
  id: number;
  username: string;
  name: string;
  enabled: boolean;
  locale: string;
  roles: Role[];
  createdAt: Date;
  updatedAt: Date;
}

function serializeUser(user: {
  id: number;
  username: string;
  name: string;
  enabled: boolean;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
  roles: { role: Role }[];
}): SerializedUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    enabled: user.enabled,
    locale: user.locale,
    roles: user.roles.map((r) => r.role),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export interface ListUsersOptions {
  q?: string;
  role?: Role;
  page?: number;
  pageSize?: number;
}

export interface ListUsersResult {
  items: SerializedUser[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listUsers(opts: ListUsersOptions): Promise<ListUsersResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.UserWhereInput = {};

  if (opts.q) {
    where.OR = [
      { username: { contains: opts.q } },
      { name: { contains: opts.q } },
    ];
  }

  if (opts.role) {
    where.roles = { some: { role: opts.role } };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { roles: true },
      skip,
      take: pageSize,
      orderBy: { id: 'asc' },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: users.map(serializeUser),
    total,
    page,
    pageSize,
  };
}

export async function getUserById(id: number): Promise<SerializedUser> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { roles: true },
  });

  if (!user) {
    throw new HttpError(404, 'NOT_FOUND', `User ${id} not found`);
  }

  return serializeUser(user);
}

export interface CreateUserInput {
  username: string;
  password: string;
  name: string;
  roles: Role[];
  locale?: string;
}

export async function createUser(input: CreateUserInput): Promise<SerializedUser> {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        username: input.username,
        passwordHash,
        name: input.name,
        locale: input.locale ?? 'zhCN',
        roles: {
          create: input.roles.map((role) => ({ role })),
        },
      },
      include: { roles: true },
    });

    return serializeUser(user);
  } catch (err: unknown) {
    // Prisma unique constraint violation
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      throw new HttpError(409, 'USERNAME_TAKEN', `Username '${input.username}' is already taken`);
    }
    throw err;
  }
}

export interface UpdateUserInput {
  name?: string;
  enabled?: boolean;
  locale?: string;
  roles?: Role[];
}

export async function updateUser(id: number, input: UpdateUserInput): Promise<SerializedUser> {
  // Ensure user exists
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', `User ${id} not found`);
  }

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;
  if (input.locale !== undefined) updateData.locale = input.locale;

  let user;

  if (input.roles !== undefined) {
    // Atomic role replacement inside transaction
    user = await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      return tx.user.update({
        where: { id },
        data: {
          ...updateData,
          roles: {
            create: input.roles!.map((role) => ({ role })),
          },
        },
        include: { roles: true },
      });
    });
  } else {
    user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { roles: true },
    });
  }

  return serializeUser(user);
}

export async function resetPassword(id: number, password: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', `User ${id} not found`);
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id },
    data: { passwordHash },
  });
}
