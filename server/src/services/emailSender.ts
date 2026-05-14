// ---------------------------------------------------------------------------
// EmailSender — interface + stub
// ---------------------------------------------------------------------------

import nodemailer from 'nodemailer';
import type { SmtpConfig } from './settingService.js';

const DEFAULT_KALEIDO_AUTH_URL = 'https://v5.kaleido.guru/api/bach_api/get_api_auth';

export interface EmailSendInput {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

interface EmailApiAuthConfig {
  authUrl: string;
  appCode: string;
  appSecret: string;
}

interface KaleidoAuthResponse {
  err_code?: number;
  err_message?: string;
  body?: {
    token?: string;
  };
}

interface KaleidoSendResponse {
  status?: number;
  err_message?: string;
  body?: {
    status?: number;
  };
}

export interface EmailSender {
  send(input: EmailSendInput): Promise<void>;
}

function isCompleteSmtpConfig(config: SmtpConfig): boolean {
  // SMTP delivery needs a host, port, account and password before any network call is meaningful.
  return Boolean(config.host && config.port > 0 && config.username && config.password);
}

function isCompleteEmailApiConfig(config: SmtpConfig): boolean {
  // API delivery mode intentionally requires only one endpoint URL.
  return Boolean(config.apiUrl);
}

function getEmailApiAuthConfig(): EmailApiAuthConfig {
  return {
    // Auth URL has a stable default; app credentials are maintained in system settings.
    authUrl: process.env.KALEIDO_EMAIL_AUTH_URL ?? DEFAULT_KALEIDO_AUTH_URL,
    appCode: '',
    appSecret: '',
  };
}

export class StubEmailSender implements EmailSender {
  async send(_input: EmailSendInput): Promise<void> {
    // Test-only no-op sender; production dispatch uses ConfiguredEmailSender when no sender is injected.
  }
}

export class ConfiguredEmailSender implements EmailSender {
  constructor(
    private readonly config: SmtpConfig,
    private readonly apiAuthConfig: EmailApiAuthConfig = getEmailApiAuthConfig(),
  ) {}

  async send(input: EmailSendInput): Promise<void> {
    if (this.config.mode === 'api') {
      await this.sendWithApi(input);
      return;
    }

    if (!isCompleteSmtpConfig(this.config)) {
      throw new Error('email service not configured');
    }

    // Nodemailer handles SMTP transport details; port 465 is conventionally SMTPS.
    const transport = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.port === 465,
      auth: {
        user: this.config.username,
        pass: this.config.password,
      },
    });

    await transport.sendMail({
      from: this.config.username,
      to: input.to,
      subject: input.subject,
      text: input.textBody,
      html: input.htmlBody,
    });
  }

  private async sendWithApi(input: EmailSendInput): Promise<void> {
    if (!isCompleteEmailApiConfig(this.config)) {
      throw new Error('email api service not configured');
    }
    const authConfig = this.resolveApiAuthConfig();
    if (!authConfig.appCode || !authConfig.appSecret) {
      throw new Error('email api auth not configured');
    }

    const token = await this.fetchApiToken(authConfig);

    // Kaleido API expects the misspelled "adress" field name and renders content as HTML.
    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({
        data_rows: {
          adress: input.to,
          title: input.subject,
          content: input.htmlBody,
        },
        return_method: 'blocking',
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(`email api service failed: ${response.status} ${responseText}`.trim());
    }

    const result = (await response.json()) as KaleidoSendResponse;
    if (result.body?.status !== 2) {
      throw new Error(`email api service failed: ${result.err_message ?? 'unexpected response status'}`);
    }
  }

  private resolveApiAuthConfig(): EmailApiAuthConfig {
    return {
      authUrl: this.apiAuthConfig.authUrl,
      appCode: this.config.apiAppCode || this.apiAuthConfig.appCode,
      appSecret: this.config.apiAppSecret || this.apiAuthConfig.appSecret,
    };
  }

  private async fetchApiToken(authConfig: EmailApiAuthConfig): Promise<string> {
    // Token is short-lived, so it is fetched immediately before each API-mode send attempt.
    const response = await fetch(authConfig.authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_code: authConfig.appCode,
        app_secret: authConfig.appSecret,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(`email api auth failed: ${response.status} ${responseText}`.trim());
    }

    const result = (await response.json()) as KaleidoAuthResponse;
    if (result.err_code !== 0 || !result.body?.token) {
      throw new Error(`email api auth failed: ${result.err_message ?? 'token missing'}`);
    }
    return result.body.token;
  }
}
