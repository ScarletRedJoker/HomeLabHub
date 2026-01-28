import { getStripeSync, getUncachableStripeClient } from './client';
import Stripe from 'stripe';

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
    
    if (sync) {
      await sync.processWebhook(payload, signature);
    } else {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET not configured');
      }
      
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );
      
      console.log('[Stripe Webhook] Received event:', event.type);
      
      switch (event.type) {
        case 'checkout.session.completed':
          console.log('[Stripe] Checkout completed:', event.data.object);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          console.log('[Stripe] Subscription event:', event.type, event.data.object);
          break;
        case 'invoice.paid':
        case 'invoice.payment_failed':
          console.log('[Stripe] Invoice event:', event.type, event.data.object);
          break;
        default:
          console.log('[Stripe] Unhandled event type:', event.type);
      }
    }
  }
}
