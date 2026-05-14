import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requestLog } from './middleware/requestLog.js';
import { errorHandler } from './middleware/errorHandler.js';
import { HttpError } from './errors/HttpError.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { positionsRouter } from './routes/positions.js';
import { settingsRouter } from './routes/settings.js';
import { candidatesRouter } from './routes/candidates.js';
import { oaFormRouter } from './routes/oaForm.js';
import { oaRouter } from './routes/oa.js';
import { timeSlotsRouter } from './routes/timeSlots.js';
import { candidatePortalRouter } from './routes/candidatePortal.js';
import { candidateSlotsRouter } from './routes/candidateSlots.js';
import { notificationLogsRouter } from './routes/notificationLogs.js';
import { userNotificationsRouter } from './routes/userNotifications.js';
import { mcpRouter } from './routes/mcp.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  // MCP 简历上传使用 Base64 JSON 传输，整体请求体需要覆盖 10 MB 文件和编码开销。
  app.use(express.json({ limit: '14mb' }));
  app.use(requestLog);

  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/users', usersRouter);
  app.use('/positions/:positionId/oa-form', oaFormRouter);
  app.use('/positions', positionsRouter);
  app.use('/settings', settingsRouter);
  app.use('/candidates', candidatesRouter);
  app.use('/oa', oaRouter);
  app.use('/time-slots', timeSlotsRouter);
  app.use('/candidate', candidatePortalRouter);
  app.use('/candidate/time-slots', candidateSlotsRouter);
  app.use('/notification-logs', notificationLogsRouter);
  app.use('/user-notifications', userNotificationsRouter);
  app.use('/mcp', mcpRouter);

  // 404 fallthrough — must be registered AFTER all routes.
  app.use((req, _res, next) => {
    next(new HttpError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
  });

  app.use(errorHandler);

  return app;
}
