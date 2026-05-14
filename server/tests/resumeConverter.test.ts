import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpError } from '../src/errors/HttpError.js';
import { LocalResumeConverter } from '../src/services/resumeConverter.js';

let tempDir: string | undefined;

async function writeTempFile(filename: string, content: string): Promise<string> {
  tempDir ??= await mkdtemp(join(tmpdir(), 'vivaldi-resume-'));
  const path = join(tempDir, filename);
  await writeFile(path, content);
  return path;
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('LocalResumeConverter', () => {
  it('normalizes TXT resume content into readable markdown', async () => {
    const converter = new LocalResumeConverter();
    const storedPath = await writeTempFile('resume.txt', ' 张三 \r\n\r\n\r\n 邮箱: zhang@example.com\t ');

    const result = await converter.convert({
      storedPath,
      mimeType: 'text/plain',
      originalFilename: 'resume.txt',
    });

    expect(result).toBe('张三\n\n邮箱: zhang@example.com');
  });

  it('throws RESUME_TEXT_EMPTY when no text can be extracted', async () => {
    const converter = new LocalResumeConverter();
    const storedPath = await writeTempFile('empty.txt', ' \n\t ');

    await expect(
      converter.convert({
        storedPath,
        mimeType: 'text/plain',
        originalFilename: 'empty.txt',
      }),
    ).rejects.toMatchObject<HttpError>({ code: 'RESUME_TEXT_EMPTY' });
  });

  it('throws UNSUPPORTED_RESUME_FORMAT for unsupported MIME types', async () => {
    const converter = new LocalResumeConverter();
    const storedPath = await writeTempFile('resume.png', 'not an image');

    await expect(
      converter.convert({
        storedPath,
        mimeType: 'image/png',
        originalFilename: 'resume.png',
      }),
    ).rejects.toMatchObject<HttpError>({ code: 'UNSUPPORTED_RESUME_FORMAT' });
  });
});
