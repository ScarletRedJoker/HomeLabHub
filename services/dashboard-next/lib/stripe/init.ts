import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './client';

let initialized = false;

export async function initStripe(): Promise<void> {
  if (initialized) {
    console.log('[Stripe] Already initialized, skipping...');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn('[Stripe] DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('[Stripe] Running migrations...');
    await runMigrations({ 
      databaseUrl,
      schema: 'stripe'
    });
    console.log('[Stripe] Migrations complete');

    const stripeSync = await getStripeSync();

    console.log('[Stripe] Setting up managed webhook...');
    const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
    const primaryDomain = domains[0];
    
    if (primaryDomain) {
      const webhookUrl = `https://${primaryDomain}/api/stripe/webhook`;
      const { webhook } = await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      console.log(`[Stripe] Webhook configured: ${webhook.url}`);
    } else {
      console.warn('[Stripe] No REPLIT_DOMAINS found, skipping webhook setup');
    }

    console.log('[Stripe] Starting background sync...');
    stripeSync.syncBackfill()
      .then(() => {
        console.log('[Stripe] Background sync complete');
      })
      .catch((err: Error) => {
        console.error('[Stripe] Background sync error:', err);
      });

    initialized = true;
    console.log('[Stripe] Initialization complete');
  } catch (error) {
    console.error('[Stripe] Initialization failed:', error);
    throw error;
  }
}

export function isStripeInitialized(): boolean {
  return initialized;
}
