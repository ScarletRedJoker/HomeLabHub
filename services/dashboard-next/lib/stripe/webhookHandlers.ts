import { getStripeSync } from './client';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means the body was parsed as JSON before reaching this handler. ' +
        'FIX: Ensure webhook route uses raw body parsing.'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }
}
