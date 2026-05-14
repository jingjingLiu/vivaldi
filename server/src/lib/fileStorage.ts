import { promises as fs, createReadStream } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const UPLOADS_DIR = join(__dirname, '../../uploads');

// MIME type → extension mapping
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
};

export async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export function deriveExtension(mimeType: string, originalFilename: string): string {
  if (MIME_TO_EXT[mimeType]) {
    return MIME_TO_EXT[mimeType];
  }
  const ext = extname(originalFilename);
  return ext || '.bin';
}

export interface SaveUploadResult {
  storedFilename: string;
  storedPath: string;
}

export async function saveUpload(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string,
): Promise<SaveUploadResult> {
  await ensureUploadsDir();
  const ext = deriveExtension(mimeType, originalFilename);
  const storedFilename = `${randomUUID()}${ext}`;
  const storedPath = join(UPLOADS_DIR, storedFilename);
  await fs.writeFile(storedPath, buffer);
  return { storedFilename, storedPath };
}

export interface ReadUploadResult {
  stream: ReturnType<typeof createReadStream>;
  stat: Stats;
}

export async function readUpload(storedFilename: string): Promise<ReadUploadResult> {
  const storedPath = join(UPLOADS_DIR, storedFilename);
  const stat = await fs.stat(storedPath);
  const stream = createReadStream(storedPath);
  return { stream, stat };
}

export async function deleteUpload(storedFilename: string): Promise<void> {
  const storedPath = join(UPLOADS_DIR, storedFilename);
  await fs.unlink(storedPath).catch(() => {
    // Ignore if file doesn't exist
  });
}
