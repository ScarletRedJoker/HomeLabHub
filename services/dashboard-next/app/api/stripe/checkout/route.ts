import { NextRequest, NextResponse } from 'next/server';
import { stripeService } from '@/lib/stripe/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { priceId, customerId, successUrl, cancelUrl, mode } = body;

    if (!priceId) {
      return NextResponse.json(
        { error: 'priceId is required' },
        { status: 400 }
      );
    }

    if (!customerId) {
      return NextResponse.json(
        { error: 'customerId is required' },
        { status: 400 }
      );
    }

    const host = request.headers.get('host') || 'localhost:5000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      successUrl || `${baseUrl}/checkout/success`,
      cancelUrl || `${baseUrl}/checkout/cancel`,
      mode || 'subscription'
    );

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error('Checkout session error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
