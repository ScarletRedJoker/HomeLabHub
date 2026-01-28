import { getUncachableStripeClient } from './client';
import { stripeStorage } from './storage';

export class StripeService {
  async createCustomer(email: string, userId?: string, metadata?: Record<string, string>) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      metadata: {
        ...(userId && { userId }),
        ...metadata,
      },
    });
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    mode: 'subscription' | 'payment' = 'subscription'
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async getProduct(productId: string) {
    return await stripeStorage.getProduct(productId);
  }

  async listProducts(active = true, limit = 20, offset = 0) {
    return await stripeStorage.listProducts(active, limit, offset);
  }

  async listProductsWithPrices(active = true, limit = 20, offset = 0) {
    return await stripeStorage.listProductsWithPrices(active, limit, offset);
  }

  async getSubscription(subscriptionId: string) {
    return await stripeStorage.getSubscription(subscriptionId);
  }

  async getCustomer(customerId: string) {
    return await stripeStorage.getCustomer(customerId);
  }
}

export const stripeService = new StripeService();
