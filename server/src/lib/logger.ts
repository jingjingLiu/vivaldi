import pino, { type Logger, type LoggerOptions } from 'pino';

export function createLogger(level: LoggerOptions['level'] = 'info', nodeEnv = process.env.NODE_ENV): Logger {
  const options: LoggerOptions = {
    level,
    base: { service: 'vivaldi-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (nodeEnv !== 'production') {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
    };
  }

  return pino(options);
}

export const logger = createLogger(
  (process.env.LOG_LEVEL as LoggerOptions['level']) ?? 'info',
);
