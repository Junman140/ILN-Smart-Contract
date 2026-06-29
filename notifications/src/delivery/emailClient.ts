import type { EmailClient, EmailMessage } from './emailDelivery.js';

export interface ResendEmailClientOptions {
  apiKey?: string;
  from: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export function createEmailClient(options: ResendEmailClientOptions): EmailClient {
  if (!options.apiKey) {
    return {
      async send(message: EmailMessage) {
        options.logger?.warn(
          `RESEND_API_KEY is not set; skipping real email delivery to ${message.to}`
        );
        return { id: `local_${Date.now().toString(36)}` };
      },
    };
  }

  return {
    async send(message: EmailMessage) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: options.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Resend request failed with HTTP ${response.status}${errorBody ? `: ${errorBody}` : ''}`);
      }

      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return { id: data.id ?? `resend_${Date.now().toString(36)}` };
    },
  };
}
