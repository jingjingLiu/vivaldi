import { prisma } from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmtpConfig {
  mode: 'smtp' | 'api';
  host: string;
  port: number;
  username: string;
  password: string;
  apiUrl: string;
  apiAppCode: string;
  apiAppSecret: string;
}

export interface SmsConfig {
  apiUrl: string;
  apiKey: string;
  senderNumber: string;
}

export interface AppSettings {
  companyName: string;
  baseUrl: string;
  oaDeadlineDays: number;
  smtp: SmtpConfig;
  sms: SmsConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SMTP: SmtpConfig = {
  mode: 'smtp',
  host: '',
  port: 0,
  username: '',
  password: '',
  apiUrl: '',
  apiAppCode: '',
  apiAppSecret: '',
};
const DEFAULT_SMS: SmsConfig = { apiUrl: '', apiKey: '', senderNumber: '' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowsToSettings(rows: { key: string; value: string }[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const companyName = map.get('company_name') ?? '';
  const baseUrl = map.get('base_url') ?? '';
  const oaDeadlineDays = parseInt(map.get('oa_deadline_days') ?? '0', 10) || 0;

  let smtp: SmtpConfig = { ...DEFAULT_SMTP };
  const smtpRaw = map.get('smtp_config');
  if (smtpRaw) {
    try {
      const parsed = JSON.parse(smtpRaw) as Partial<SmtpConfig>;
      smtp = {
        mode: parsed.mode === 'api' ? 'api' : 'smtp',
        host: typeof parsed.host === 'string' ? parsed.host : '',
        port: typeof parsed.port === 'number' ? parsed.port : 0,
        username: typeof parsed.username === 'string' ? parsed.username : '',
        password: typeof parsed.password === 'string' ? parsed.password : '',
        apiUrl: typeof parsed.apiUrl === 'string' ? parsed.apiUrl : '',
        apiAppCode: typeof parsed.apiAppCode === 'string' ? parsed.apiAppCode : '',
        apiAppSecret: typeof parsed.apiAppSecret === 'string' ? parsed.apiAppSecret : '',
      };
    } catch {
      // ignore bad JSON
    }
  }

  let sms: SmsConfig = { ...DEFAULT_SMS };
  const smsRaw = map.get('sms_config');
  if (smsRaw) {
    try {
      const parsed = JSON.parse(smsRaw) as Partial<SmsConfig>;
      sms = {
        apiUrl: typeof parsed.apiUrl === 'string' ? parsed.apiUrl : '',
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        senderNumber: typeof parsed.senderNumber === 'string' ? parsed.senderNumber : '',
      };
    } catch {
      // ignore bad JSON
    }
  }

  return { companyName, baseUrl, oaDeadlineDays, smtp, sms };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['company_name', 'base_url', 'oa_deadline_days', 'smtp_config', 'sms_config'] } },
    select: { key: true, value: true },
  });
  return rowsToSettings(rows);
}

export interface SettingsPatch {
  companyName?: string;
  baseUrl?: string;
  oaDeadlineDays?: number;
  smtp?: Partial<SmtpConfig>;
  sms?: Partial<SmsConfig>;
}

export async function updateSettings(patch: SettingsPatch): Promise<AppSettings> {
  // Fetch current state for merging JSON objects
  const current = await getSettings();

  const upserts: Array<{ key: string; value: string }> = [];

  if (patch.companyName !== undefined) {
    upserts.push({ key: 'company_name', value: patch.companyName });
  }
  if (patch.baseUrl !== undefined) {
    upserts.push({ key: 'base_url', value: patch.baseUrl });
  }
  if (patch.oaDeadlineDays !== undefined) {
    upserts.push({ key: 'oa_deadline_days', value: String(patch.oaDeadlineDays) });
  }
  if (patch.smtp !== undefined) {
    const merged: SmtpConfig = { ...current.smtp, ...patch.smtp };
    upserts.push({ key: 'smtp_config', value: JSON.stringify(merged) });
  }
  if (patch.sms !== undefined) {
    const merged: SmsConfig = { ...current.sms, ...patch.sms };
    upserts.push({ key: 'sms_config', value: JSON.stringify(merged) });
  }

  await prisma.$transaction(
    upserts.map(({ key, value }) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    ),
  );

  return getSettings();
}
