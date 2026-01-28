import { getStripeSync } from './client';

let initialized = false;

function isReplitEnvironment(): boolean {
  return !!(process.env.REPLIT_CONNECTORS_HOSTNAME && (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
}

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

  if (!isReplitEnvironment()) {
    console.log('[Stripe] Running outside Replit - using direct Stripe API');
    console.log('[Stripe] Ensure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set');
    initialized = true;
    return;
  }

  try {
    const { runMigrations } = await import('stripe-replit-sync');
    
    console.log('[Stripe] Running migrations...');
    await runMigrations({ 
      databaseUrl,
      schema: 'stripe'
    });
    console.log('[Stripe] Migrations complete');

    const stripeSync = await getStripeSync();
    
    if (!stripeSync) {
      console.warn('[Stripe] StripeSync not available, skipping webhook setup');
      initialized = true;
      return;
    }

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
    initialized = true;
  }
}

export function isStripeInitialized(): boolean {
  return initialized;
}
