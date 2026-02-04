/**
 * Stripe Service - Handle Stripe subscription operations
 *
 * Pure business logic for Stripe operations.
 * No direct Firebase or external API imports.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext } from '../context.js';
import Stripe from 'stripe';

export class StripeService {
  private stripe: Stripe;

  constructor(private ctx: FunctionContext) {
    const apiKey = this.ctx.secrets.getSecret('STRIPE_API_KEY');
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2026-01-28.clover',
    });
  }

  /**
   * Create a Stripe checkout session for guild subscription
   */
  async createGuildSubscription(params: {
    guildId: string;
    tier: 'starter' | 'pro';
    userId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    const { guildId, tier, userId, successUrl, cancelUrl } = params;

    this.ctx.logger.info('Creating guild subscription checkout', {
      guildId,
      tier,
      userId,
    });

    // Get or create Stripe customer
    const customerId = await this.getOrCreateCustomer(userId);

    // Get price ID based on tier
    const priceId = tier === 'starter'
      ? this.ctx.secrets.getSecret('STRIPE_PRICE_ID_STARTER')
      : this.ctx.secrets.getSecret('STRIPE_PRICE_ID_PRO');

    // Create checkout session
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          guildId,
          firebaseUserId: userId,
          tier,
        },
      },
      metadata: {
        guildId,
        firebaseUserId: userId,
        tier,
      },
    });

    if (!session.url) {
      this.ctx.logger.error('Stripe checkout session created without URL', {
        sessionId: session.id,
      });
      throw new HttpsError('internal', 'Failed to create checkout session');
    }

    this.ctx.logger.info('Checkout session created', {
      sessionId: session.id,
      guildId,
    });

    return {
      url: session.url,
      sessionId: session.id,
    };
  }

  /**
   * Create a Stripe billing portal session
   */
  async createBillingPortal(params: {
    userId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const { userId, returnUrl } = params;

    this.ctx.logger.info('Creating billing portal session', { userId });

    // Get customer ID
    const user = await this.ctx.firestore.getUser(userId);
    if (!user?.stripeCustomerId) {
      throw new HttpsError(
        'failed-precondition',
        'User does not have a Stripe customer ID'
      );
    }

    // Create portal session
    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    this.ctx.logger.info('Billing portal session created', {
      sessionId: session.id,
      userId,
    });

    return {
      url: session.url,
    };
  }

  /**
   * Cancel a subscription at period end
   */
  async cancelSubscription(params: {
    subscriptionId: string;
    userId: string;
  }): Promise<{ success: true }> {
    const { subscriptionId, userId } = params;

    this.ctx.logger.info('Canceling subscription', { subscriptionId, userId });

    // Verify ownership
    const subscription = await this.ctx.firestore.getSubscription(subscriptionId);
    if (!subscription) {
      throw new HttpsError('not-found', 'Subscription not found');
    }

    if (subscription.userId !== userId) {
      throw new HttpsError(
        'permission-denied',
        'User does not own this subscription'
      );
    }

    // Cancel at period end in Stripe
    await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    this.ctx.logger.info('Subscription canceled at period end', {
      subscriptionId,
    });

    return { success: true };
  }

  /**
   * Resume a subscription that was set to cancel at period end
   */
  async resumeSubscription(params: {
    subscriptionId: string;
    userId: string;
  }): Promise<{ success: true }> {
    const { subscriptionId, userId } = params;

    this.ctx.logger.info('Resuming subscription', { subscriptionId, userId });

    // Verify ownership
    const subscription = await this.ctx.firestore.getSubscription(subscriptionId);
    if (!subscription) {
      throw new HttpsError('not-found', 'Subscription not found');
    }

    if (subscription.userId !== userId) {
      throw new HttpsError(
        'permission-denied',
        'User does not own this subscription'
      );
    }

    // Resume subscription in Stripe
    await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    this.ctx.logger.info('Subscription resumed', { subscriptionId });

    return { success: true };
  }

  /**
   * Get or create Stripe customer for a Firebase user
   */
  async getOrCreateCustomer(userId: string): Promise<string> {
    // Check if user already has a Stripe customer ID
    let user = await this.ctx.firestore.getUser(userId);

    if (user?.stripeCustomerId) {
      this.ctx.logger.info('Using existing Stripe customer', {
        customerId: user.stripeCustomerId,
        userId,
      });
      return user.stripeCustomerId;
    }

    // Create new Stripe customer
    const customer = await this.stripe.customers.create({
      metadata: {
        firebaseUserId: userId,
        environment: process.env.FUNCTIONS_EMULATOR === 'true' ? 'emulator' : 'production',
      },
    });

    this.ctx.logger.info('Created new Stripe customer', {
      customerId: customer.id,
      userId,
    });

    // Create user document if it doesn't exist
    if (!user) {
      user = {
        stripeCustomerId: customer.id,
      };
      await this.ctx.firestore.updateUser(userId, user);
    } else {
      // Update existing user with customer ID
      await this.ctx.firestore.updateUser(userId, {
        stripeCustomerId: customer.id,
      });
    }

    return customer.id;
  }
}
