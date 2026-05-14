import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { HttpError } from '../errors/HttpError.js';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEXT_MIME = 'text/plain';
const MAX_MARKDOWN_LENGTH = 50_000;

export interface ResumeConverter {
  convert(input: { storedPath: string; mimeType: string; originalFilename: string }): Promise<string>; // returns markdown
}

export class LocalResumeConverter implements ResumeConverter {
  async convert(input: { storedPath: string; mimeType: string; originalFilename: string }): Promise<string> {
    try {
      const rawText = await this.extractText(input);
      return normalizeResumeText(rawText);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(400, 'RESUME_PARSE_FAILED', 'Failed to parse resume file');
    }
  }

  private async extractText(input: { storedPath: string; mimeType: string; originalFilename: string }): Promise<string> {
    if (input.mimeType === PDF_MIME) {
      return extractPdfText(input.storedPath);
    }
    if (input.mimeType === DOCX_MIME) {
      return extractDocxText(input.storedPath);
    }
    if (input.mimeType === TEXT_MIME) {
      return readFile(input.storedPath, 'utf8');
    }
    throw new HttpError(400, 'UNSUPPORTED_RESUME_FORMAT', `Unsupported resume format: ${input.mimeType}`);
  }
}

async function extractPdfText(storedPath: string): Promise<string> {
  const data = await readFile(storedPath);
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(storedPath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: storedPath });
  return result.value;
}

function normalizeResumeText(text: string): string {
  // Normalize parser output so the detail page can render readable Markdown.
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    throw new HttpError(400, 'RESUME_TEXT_EMPTY', 'Resume file does not contain extractable text');
  }

  return normalized.length > MAX_MARKDOWN_LENGTH
    ? normalized.slice(0, MAX_MARKDOWN_LENGTH).trimEnd()
    : normalized;
}
