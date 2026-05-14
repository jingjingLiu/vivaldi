// ---------------------------------------------------------------------------
// CLI integration tests
//
// Spawns `src/cli.ts` via tsx in a subprocess for each scenario.
// Seeds test data directly via Prisma, then cleans up in afterAll.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CandidateStatus } from '@prisma/client';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../src/cli.ts');
const SERVER_DIR = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(
    'node',
    ['--import', 'tsx', CLI_PATH, ...args],
    {
      cwd: SERVER_DIR,
      encoding: 'utf8',
      timeout: 30000,
      // LOG_LEVEL=silent keeps pino quiet so stdout is clean JSON only
      env: { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' },
    },
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const RUN_ID = Date.now();
const SUFFIX = `cli_${RUN_ID}`;

let testPositionId: number;
const createdCandidateIds: number[] = [];
let _codeSeq = 0;

function nextOTC(): string {
  _codeSeq++;
  const ts = RUN_ID.toString(36).toUpperCase().slice(-4);
  const cnt = _codeSeq.toString().padStart(3, '0');
  return `CL${ts}${cnt}`.slice(0, 10);
}

async function createCandidate(opts: {
  status: CandidateStatus;
  email?: string;
  phone?: string;
  oaDeadline?: Date | null;
}): Promise<number> {
  const code = nextOTC();
  const c = await prisma.candidate.create({
    data: {
      positionId: testPositionId,
      status: opts.status,
      oneTimeCode: code,
      name: `CLITest-${code}`,
      email: opts.email ?? `cli+${code}@example.com`,
      phone: opts.phone ?? `139${_codeSeq.toString().padStart(8, '0')}`,
      oaDeadline: opts.oaDeadline !== undefined ? opts.oaDeadline : null,
    },
  });
  createdCandidateIds.push(c.id);
  return c.id;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await prisma.systemSetting.upsert({
    where: { key: 'oa_deadline_days' },
    update: {},
    create: { key: 'oa_deadline_days', value: '7' },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'base_url' },
    update: {},
    create: { key: 'base_url', value: 'https://example.com' },
  });
  await prisma.systemSetting.upsert({
    where: { key: 'company_name' },
    update: {},
    create: { key: 'company_name', value: 'Test Company' },
  });

  const pos = await prisma.position.create({
    data: { name: `CLI Test Position ${SUFFIX}` },
  });
  testPositionId = pos.id;
});

afterAll(async () => {
  if (createdCandidateIds.length > 0) {
    await prisma.notificationLog.deleteMany({ where: { candidateId: { in: createdCandidateIds } } });
    await prisma.statusHistory.deleteMany({ where: { candidateId: { in: createdCandidateIds } } });
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
  }
  await prisma.position.deleteMany({ where: { id: testPositionId } });
  await disconnectPrisma();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI: status change', () => {
  it('changes a candidate status from new to waiting_for_oa', async () => {
    const candidateId = await createCandidate({ status: CandidateStatus.new });

    const { stdout, stderr, exitCode } = runCli([
      'status', 'change', String(candidateId), 'waiting_for_oa',
      '--operator', '1',
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(result.id).toBe(candidateId);
    expect(result.status).toBe('waiting_for_oa');
  });

  it('returns non-zero exit and stderr for invalid toStatus', async () => {
    const candidateId = await createCandidate({ status: CandidateStatus.new });

    const { stdout, stderr, exitCode } = runCli([
      'status', 'change', String(candidateId), 'totally_bogus_status',
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/invalid status/i);
  });
});

describe('CLI: notify send', () => {
  it('creates NotificationLog rows for new_to_oa event', async () => {
    // Candidate needs to be in waiting_for_oa (has email/phone)
    const candidateId = await createCandidate({
      status: CandidateStatus.waiting_for_oa,
      email: `notifytest+${RUN_ID}@example.com`,
      phone: `13800001234`,
    });

    const { stdout, stderr, exitCode } = runCli([
      'notify', 'send', String(candidateId), 'new_to_oa',
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(result.count).toBeGreaterThan(0);
    expect(Array.isArray(result.logs)).toBe(true);
    // Each log should have a deliveryStatus
    for (const log of result.logs) {
      expect(log.deliveryStatus).toBeDefined();
    }
  });
});

describe('CLI: oa-reminder run', () => {
  it('prints { sent: N } (N >= 0)', () => {
    const { stdout, stderr, exitCode } = runCli(['oa-reminder', 'run']);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(typeof result.sent).toBe('number');
    expect(result.sent).toBeGreaterThanOrEqual(0);
  });
});

describe('CLI: oa-expiry run', () => {
  it('prints { transitioned: N } (N >= 0)', () => {
    const { stdout, stderr, exitCode } = runCli(['oa-expiry', 'run']);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(typeof result.transitioned).toBe('number');
    expect(result.transitioned).toBeGreaterThanOrEqual(0);
  });
});
