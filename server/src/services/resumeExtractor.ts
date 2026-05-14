export interface ExtractedFields {
  name?: string;
  gender?: 'male' | 'female';
  email?: string;
  phone?: string;
}

export interface ResumeExtractor {
  extract(markdown: string): Promise<ExtractedFields>;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_CANDIDATE_RE = /(?:\+?\d[\d \t().-]{6,}\d)/g;
const PHONE_VALID_RE = /^\+?[0-9]{7,20}$/;

export class LocalResumeExtractor implements ResumeExtractor {
  async extract(markdown: string): Promise<ExtractedFields> {
    const lines = markdown
      .split('\n')
      .map(line => cleanLine(line))
      .filter(Boolean);

    return {
      name: extractName(lines),
      gender: extractGender(lines),
      email: extractEmail(markdown),
      phone: extractPhone(markdown),
    };
  }
}

function extractEmail(text: string): string | undefined {
  const match = EMAIL_RE.exec(text);
  return match?.[0].toLowerCase();
}

function extractPhone(text: string): string | undefined {
  const matches = text.match(PHONE_CANDIDATE_RE) ?? [];
  for (const candidate of matches) {
    const normalized = normalizePhone(candidate);
    if (normalized && PHONE_VALID_RE.test(normalized)) {
      return normalized;
    }
  }
  return undefined;
}

function extractName(lines: string[]): string | undefined {
  const labeled = extractLabeledValue(lines, /^(?:姓名|名字|name)\s*[:：]\s*(.+)$/i);
  if (labeled && isLikelyName(labeled)) {
    return trimToMax(labeled, 100);
  }

  // Fall back to a conservative first-line heuristic for resumes without labels.
  const fallback = lines.slice(0, 8).find(line => isLikelyName(line));
  return fallback ? trimToMax(fallback, 100) : undefined;
}

function extractGender(lines: string[]): 'male' | 'female' | undefined {
  const labeled = extractLabeledValue(lines, /^(?:性别|gender|sex)\s*[:：]\s*(.+)$/i);
  if (!labeled) {
    return undefined;
  }
  if (/^(?:男|male|m)$/i.test(labeled)) {
    return 'male';
  }
  if (/^(?:女|female|f)$/i.test(labeled)) {
    return 'female';
  }
  return undefined;
}

function extractLabeledValue(lines: string[], pattern: RegExp): string | undefined {
  for (const line of lines) {
    const match = pattern.exec(line);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function cleanLine(line: string): string {
  return line
    .replace(/^#+\s*/, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyName(value: string): boolean {
  const cleaned = value.trim();
  if (cleaned.length < 2 || cleaned.length > 60) {
    return false;
  }
  if (EMAIL_RE.test(cleaned) || /https?:\/\/|www\.|@/.test(cleaned)) {
    return false;
  }
  if (/\d/.test(cleaned) || /[:：]/.test(cleaned)) {
    return false;
  }
  if (/resume|curriculum vitae|个人简历|简历|联系方式|电话|邮箱|email|phone/i.test(cleaned)) {
    return false;
  }
  return /^[\p{Script=Han}A-Za-z\s.'·-]+$/u.test(cleaned);
}

function normalizePhone(value: string): string | undefined {
  const trimmed = value.trim();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return undefined;
  }
  return hasLeadingPlus ? `+${digits}` : digits;
}

function trimToMax(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength).trim() : value;
}
