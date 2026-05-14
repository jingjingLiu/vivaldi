import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSettings, updateSettings, type SettingsPatch } from '../services/settingService.js';

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export const settingsRouter = Router();

// All settings endpoints require auth + coordinator role
settingsRouter.use(requireAuth, requireRole('coordinator'));

const smtpPatchSchema = z.object({
  mode: z.enum(['smtp', 'api']).optional(),
  host: z.string().max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  apiUrl: z.string().url().or(z.literal('')).optional(),
  apiAppCode: z.string().optional(),
  apiAppSecret: z.string().optional(),
});

const smsPatchSchema = z.object({
  apiUrl: z.string().optional(),
  apiKey: z.string().optional(),
  senderNumber: z.string().optional(),
});

const putSettingsSchema = z
  .object({
    companyName: z.string().min(1).max(200).optional(),
    baseUrl: z.string().url().optional(),
    oaDeadlineDays: z.number().int().min(1).max(90).optional(),
    smtp: smtpPatchSchema.optional(),
    sms: smsPatchSchema.optional(),
  })
  .refine(
    (data) =>
      data.companyName !== undefined ||
      data.baseUrl !== undefined ||
      data.oaDeadlineDays !== undefined ||
      data.smtp !== undefined ||
      data.sms !== undefined,
    { message: 'At least one field must be provided' },
  );

// GET /settings
settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    res.json({ settings });
  }),
);

// PUT /settings
settingsRouter.put(
  '/',
  validate({ body: putSettingsSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof putSettingsSchema>;
    const settings = await updateSettings(body as SettingsPatch);
    res.json({ settings });
  }),
);
