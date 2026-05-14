import 'dotenv/config';

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { CandidateStatus } from '@prisma/client';
import { disconnectPrisma } from './lib/prisma.js';
import { uploadResume } from './services/candidateService.js';
import { changeStatus } from './services/statusService.js';
import { dispatchNotification, type TriggerEvent } from './services/notificationService.js';
import { runOaReminderJob, runOaExpiryJob } from './services/scheduledJobs.js';

// ---------------------------------------------------------------------------
// MIME guessing by extension
// ---------------------------------------------------------------------------

function guessMime(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  };
  return map[ext] ?? 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Allowed TriggerEvent values
// ---------------------------------------------------------------------------

const TRIGGER_EVENTS: TriggerEvent[] = [
  'new_to_oa',
  'oa_reminder',
  'oa_no_response',
  'oa_to_human',
  'date_confirmed',
  'terminal_status',
];

// ---------------------------------------------------------------------------
// CLI setup
// ---------------------------------------------------------------------------

const program = new Command();
program.name('vivaldi').description('Vivaldi backend CLI').version('0.1.0');

// ---------------------------------------------------------------------------
// Subcommand: resume upload
// ---------------------------------------------------------------------------

const resumeCmd = program.command('resume');

resumeCmd
  .command('upload <file>')
  .description('Upload a resume file for a position')
  .requiredOption('--position <positionId>', 'Position ID (integer)')
  .action(async (file: string, opts: { position: string }) => {
    try {
      const positionId = parseInt(opts.position, 10);
      if (isNaN(positionId)) {
        process.stderr.write(`Error: --position must be a valid integer\n`);
        process.exitCode = 1;
        return;
      }

      let buffer: Buffer;
      try {
        buffer = readFileSync(file);
      } catch {
        process.stderr.write(`Error: Cannot read file "${file}"\n`);
        process.exitCode = 1;
        return;
      }

      const mimeType = guessMime(file);
      const originalFilename = file.split('/').pop() ?? file;

      const result = await uploadResume({
        buffer,
        originalFilename,
        mimeType,
        fileSize: buffer.length,
        positionId,
      });

      const c = result.candidate;
      // Note: CandidateSummary does not include oneTimeCode; printing available fields.
      process.stdout.write(
        JSON.stringify({ id: c.id, status: c.status, positionId: c.positionId }, null, 2) + '\n',
      );
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    } finally {
      await disconnectPrisma();
    }
  });

// ---------------------------------------------------------------------------
// Subcommand: status change
// ---------------------------------------------------------------------------

const statusCmd = program.command('status');

statusCmd
  .command('change <candidateId> <toStatus>')
  .description('Change a candidate status')
  .option('--note <note>', 'Optional note')
  .option('--operator <userId>', 'Operator user ID (integer)')
  .action(async (candidateIdStr: string, toStatusStr: string, opts: { note?: string; operator?: string }) => {
    try {
      const candidateId = parseInt(candidateIdStr, 10);
      if (isNaN(candidateId)) {
        process.stderr.write(`Error: candidateId must be a valid integer\n`);
        process.exitCode = 1;
        return;
      }

      // Validate toStatus against CandidateStatus enum
      const validStatuses = Object.values(CandidateStatus) as string[];
      if (!validStatuses.includes(toStatusStr)) {
        process.stderr.write(
          `Error: Invalid status "${toStatusStr}". Valid values: ${validStatuses.join(', ')}\n`,
        );
        process.exitCode = 1;
        return;
      }
      const toStatus = toStatusStr as CandidateStatus;

      const operatorId = opts.operator ? parseInt(opts.operator, 10) : null;
      if (opts.operator && isNaN(operatorId!)) {
        process.stderr.write(`Error: --operator must be a valid integer\n`);
        process.exitCode = 1;
        return;
      }

      const updated = await changeStatus(candidateId, toStatus, operatorId, opts.note);

      process.stdout.write(
        JSON.stringify(
          { id: updated.id, status: updated.status, positionId: updated.positionId, updatedAt: updated.updatedAt },
          null,
          2,
        ) + '\n',
      );
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    } finally {
      await disconnectPrisma();
    }
  });

// ---------------------------------------------------------------------------
// Subcommand: notify send
// ---------------------------------------------------------------------------

const notifyCmd = program.command('notify');

notifyCmd
  .command('send <candidateId> <triggerEvent>')
  .description('Dispatch a notification for a candidate')
  .action(async (candidateIdStr: string, triggerEventStr: string) => {
    try {
      const candidateId = parseInt(candidateIdStr, 10);
      if (isNaN(candidateId)) {
        process.stderr.write(`Error: candidateId must be a valid integer\n`);
        process.exitCode = 1;
        return;
      }

      if (!TRIGGER_EVENTS.includes(triggerEventStr as TriggerEvent)) {
        process.stderr.write(
          `Error: Invalid triggerEvent "${triggerEventStr}". Valid values: ${TRIGGER_EVENTS.join(', ')}\n`,
        );
        process.exitCode = 1;
        return;
      }
      const triggerEvent = triggerEventStr as TriggerEvent;

      const result = await dispatchNotification({ candidateId, triggerEvent });

      const summary = result.logs.map((l) => ({ id: l.id, deliveryStatus: l.deliveryStatus }));
      process.stdout.write(
        JSON.stringify({ count: result.logs.length, logs: summary }, null, 2) + '\n',
      );
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    } finally {
      await disconnectPrisma();
    }
  });

// ---------------------------------------------------------------------------
// Subcommand: oa-reminder run
// ---------------------------------------------------------------------------

const oaReminderCmd = program.command('oa-reminder');

oaReminderCmd
  .command('run')
  .description('Run the OA reminder job')
  .action(async () => {
    try {
      const result = await runOaReminderJob({ now: new Date() });
      process.stdout.write(JSON.stringify({ sent: result.sent }, null, 2) + '\n');
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    } finally {
      await disconnectPrisma();
    }
  });

// ---------------------------------------------------------------------------
// Subcommand: oa-expiry run
// ---------------------------------------------------------------------------

const oaExpiryCmd = program.command('oa-expiry');

oaExpiryCmd
  .command('run')
  .description('Run the OA expiry job')
  .action(async () => {
    try {
      const result = await runOaExpiryJob({ now: new Date() });
      process.stdout.write(JSON.stringify({ transitioned: result.transitioned }, null, 2) + '\n');
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    } finally {
      await disconnectPrisma();
    }
  });

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
