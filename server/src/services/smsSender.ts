// ---------------------------------------------------------------------------
// SmsSender — interface + stub
// ---------------------------------------------------------------------------

import type { SmsConfig } from './settingService.js';

export interface SmsSendInput {
  to: string;
  text: string;
}

export interface SmsSender {
  send(input: SmsSendInput): Promise<void>;
}

function isCompleteSmsConfig(config: SmsConfig): boolean {
  // Generic SMS delivery needs an endpoint, API key and sender value before calling the provider.
  return Boolean(config.apiUrl && config.apiKey && config.senderNumber);
}

export class StubSmsSender implements SmsSender {
  async send(_input: SmsSendInput): Promise<void> {
    // Test-only no-op sender; production dispatch uses ConfiguredSmsSender when no sender is injected.
  }
}

export class ConfiguredSmsSender implements SmsSender {
  constructor(private readonly config: SmsConfig) {}

  async send(input: SmsSendInput): Promise<void> {
    if (!isCompleteSmsConfig(this.config)) {
      throw new Error('sms service not configured');
    }

    // The built-in integration expects a generic JSON SMS API contract.
    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        from: this.config.senderNumber,
        to: input.to,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(`sms service failed: ${response.status} ${responseText}`.trim());
    }
  }
}
