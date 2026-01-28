import { NextRequest, NextResponse } from 'next/server';
import { WebhookHandlers } from '@/lib/stripe/webhookHandlers';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await request.arrayBuffer());

    await WebhookHandlers.processWebhook(buffer, signature);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('Stripe webhook error:', error.message);

    if (error.message?.includes('payload must be provided as a string or a Buffer')) {
      console.error(
        'STRIPE WEBHOOK ERROR: Payload is not a Buffer. ' +
        'Ensure the route uses raw body parsing, not JSON.'
      );
    }

    return NextResponse.json(
      { error: 'Webhook processing error' },
      { status: 400 }
    );
  }
}
