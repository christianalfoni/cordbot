/**
 * Stripe Webhook Service
 *
 * Handles Stripe webhook events for subscriptions and payments.
 * Performs triple write pattern: subscription + guild + guildDeployment
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext, Subscription, Payment } from '../context.js';
import Stripe from 'stripe';

// Tier configurations
const TIER_CONFIGS = {
  starter: {
    queriesTotal: 500,
    monthlyQueries: 500,
  },
  pro: {
    queriesTotal: 1200,
    monthlyQueries: 1200,
  },
};

export class StripeWebhookService {
  private stripe: Stripe;

  constructor(private ctx: FunctionContext) {
    const apiKey = this.ctx.secrets.getSecret('STRIPE_API_KEY');
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2026-01-28.clover',
    });
  }

  /**
   * Main webhook handler - verifies signature and routes events
   */
  async handleWebhook(params: {
    body: string;
    signature: string;
  }): Promise<{ received: true }> {
    const { body, signature } = params;

    // Verify webhook signature
    const webhookSecret = this.ctx.secrets.getSecret('STRIPE_WEBHOOK_SECRET');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      this.ctx.logger.error('Webhook signature verification failed', err);
      throw new HttpsError('invalid-argument', 'Invalid signature');
    }

    this.ctx.logger.info('Stripe webhook event received', {
      type: event.type,
      id: event.id,
    });

    // Route event to appropriate handler
    try {
      switch (event.type) {
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.paid':
          await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          this.ctx.logger.info('Unhandled webhook event type', { type: event.type });
      }
    } catch (err) {
      this.ctx.logger.error('Error handling webhook event', {
        type: event.type,
        id: event.id,
        error: err,
      });
      throw err;
    }

    return { received: true };
  }

  /**
   * Handle subscription.created event
   */
  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    this.ctx.logger.info('Processing subscription.created', {
      subscriptionId: subscription.id,
    });

    const metadata = subscription.metadata;
    const guildId = metadata.guildId;
    const firebaseUserId = metadata.firebaseUserId;
    const tier = metadata.tier as 'starter' | 'pro';

    if (!guildId || !firebaseUserId || !tier) {
      this.ctx.logger.error('Missing metadata in subscription', {
        subscriptionId: subscription.id,
        metadata,
      });
      throw new HttpsError('invalid-argument', 'Missing required metadata');
    }

    const now = this.ctx.getCurrentTime().toISOString();

    // Create subscription document
    const stripeSubscription = subscription as any;
    const subscriptionDoc: Subscription = {
      id: subscription.id,
      userId: firebaseUserId,
      customerId: subscription.customer as string,
      guildId,
      tier,
      status: subscription.status as Subscription['status'],
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      priceId: subscription.items.data[0].price.id,
      createdAt: now,
      updatedAt: now,
    };

    await this.ctx.firestore.createSubscription(subscription.id, subscriptionDoc);

    // Update guild with subscription reference
    await this.ctx.firestore.updateGuild(guildId, {
      subscriptionId: subscription.id,
      updatedAt: now,
    });

    // Check if deployment exists before denormalizing
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (deployment) {
      // Denormalize subscription data to guildDeployment
      await this.ctx.firestore.updateGuildDeployment(guildId, {
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status as any,
        subscriptionPeriodEnd: subscriptionDoc.currentPeriodEnd,
        updatedAt: now,
      });
    }

    this.ctx.logger.info('Subscription created and linked to guild', {
      subscriptionId: subscription.id,
      guildId,
      tier,
      subscriptionStatus: subscription.status,
    });
  }

  /**
   * Handle subscription.updated event
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    this.ctx.logger.info('Processing subscription.updated', {
      subscriptionId: subscription.id,
    });

    const now = this.ctx.getCurrentTime().toISOString();

    // Get existing subscription to find guildId
    const existingSubscription = await this.ctx.firestore.getSubscription(subscription.id);
    if (!existingSubscription) {
      this.ctx.logger.warn('Subscription not found in Firestore, skipping update', {
        subscriptionId: subscription.id,
      });
      return;
    }

    // Update subscription document
    const stripeSubscription = subscription as any;
    await this.ctx.firestore.updateSubscription(subscription.id, {
      status: subscription.status as Subscription['status'],
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: now,
    });

    // Update guild
    await this.ctx.firestore.updateGuild(existingSubscription.guildId, {
      updatedAt: now,
    });

    // Denormalize to guildDeployment
    const deployment = await this.ctx.firestore.getGuildDeployment(existingSubscription.guildId);
    if (deployment) {
      await this.ctx.firestore.updateGuildDeployment(existingSubscription.guildId, {
        subscriptionStatus: subscription.status as any,
        subscriptionPeriodEnd: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
        updatedAt: now,
      });
    }

    this.ctx.logger.info('Subscription updated', {
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }

  /**
   * Handle subscription.deleted event
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    this.ctx.logger.info('Processing subscription.deleted', {
      subscriptionId: subscription.id,
    });

    const now = this.ctx.getCurrentTime().toISOString();

    // Get existing subscription to find guildId
    const existingSubscription = await this.ctx.firestore.getSubscription(subscription.id);
    if (!existingSubscription) {
      this.ctx.logger.warn('Subscription not found in Firestore, skipping deletion', {
        subscriptionId: subscription.id,
      });
      return;
    }

    // Update subscription document (don't delete, just mark as canceled)
    await this.ctx.firestore.updateSubscription(subscription.id, {
      status: 'canceled',
      updatedAt: now,
    });

    // Update guild
    await this.ctx.firestore.updateGuild(existingSubscription.guildId, {
      updatedAt: now,
    });

    // Denormalize to guildDeployment
    const deployment = await this.ctx.firestore.getGuildDeployment(existingSubscription.guildId);
    if (deployment) {
      await this.ctx.firestore.updateGuildDeployment(existingSubscription.guildId, {
        subscriptionStatus: 'canceled',
        updatedAt: now,
      });
    }

    this.ctx.logger.info('Subscription deleted/canceled', {
      subscriptionId: subscription.id,
      guildId: existingSubscription.guildId,
    });
  }

  /**
   * Handle invoice.paid event - Reset query limits
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const invoiceAny = invoice as any;
    const subscriptionId = typeof invoiceAny.subscription_details?.subscription === 'string'
      ? invoiceAny.subscription_details.subscription
      : invoiceAny.subscription_details?.subscription?.id;

    this.ctx.logger.info('Processing invoice.paid', {
      invoiceId: invoice.id,
      subscriptionId,
    });

    // Only process subscription invoices
    if (!subscriptionId) {
      this.ctx.logger.info('Invoice not associated with subscription, skipping', {
        invoiceId: invoice.id,
      });
      return;
    }

    // Get subscription document
    const subscription = await this.ctx.firestore.getSubscription(subscriptionId);
    if (!subscription) {
      this.ctx.logger.warn('Subscription not found for invoice', {
        invoiceId: invoice.id,
        subscriptionId,
      });
      return;
    }

    const now = this.ctx.getCurrentTime().toISOString();
    const tierConfig = TIER_CONFIGS[subscription.tier];

    if (!tierConfig) {
      this.ctx.logger.error('Invalid tier in subscription', {
        subscriptionId,
        tier: subscription.tier,
      });
      return;
    }

    // Reset query limits in guildDeployment
    const deployment = await this.ctx.firestore.getGuildDeployment(subscription.guildId);
    if (deployment) {
      await this.ctx.firestore.updateGuildDeployment(subscription.guildId, {
        queriesUsed: 0,
        costThisPeriod: 0,
        updatedAt: now,
      });

      this.ctx.logger.info('Query limits reset for paid invoice', {
        guildId: subscription.guildId,
        tier: subscription.tier,
        queriesTotal: tierConfig.queriesTotal,
      });
    }

    // Log payment in subcollection
    const payment: Payment = {
      id: invoice.id,
      invoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      periodStart: new Date(invoice.period_start! * 1000).toISOString(),
      periodEnd: new Date(invoice.period_end! * 1000).toISOString(),
      paidAt: new Date(invoice.status_transitions.paid_at! * 1000).toISOString(),
      createdAt: now,
    };

    await this.ctx.firestore.createPayment(subscriptionId, invoice.id, payment);

    this.ctx.logger.info('Payment logged', {
      invoiceId: invoice.id,
      subscriptionId,
      amountPaid: invoice.amount_paid,
    });
  }

  /**
   * Handle invoice.payment_failed event
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const invoiceAny = invoice as any;
    const subscriptionId = typeof invoiceAny.subscription_details?.subscription === 'string'
      ? invoiceAny.subscription_details.subscription
      : invoiceAny.subscription_details?.subscription?.id;

    this.ctx.logger.info('Processing invoice.payment_failed', {
      invoiceId: invoice.id,
      subscriptionId,
    });

    // Only process subscription invoices
    if (!subscriptionId) {
      this.ctx.logger.info('Invoice not associated with subscription, skipping', {
        invoiceId: invoice.id,
      });
      return;
    }

    // Get subscription document
    const subscription = await this.ctx.firestore.getSubscription(subscriptionId);
    if (!subscription) {
      this.ctx.logger.warn('Subscription not found for failed invoice', {
        invoiceId: invoice.id,
        subscriptionId,
      });
      return;
    }

    const now = this.ctx.getCurrentTime().toISOString();

    // Update subscription status
    await this.ctx.firestore.updateSubscription(subscriptionId, {
      status: 'past_due',
      updatedAt: now,
    });

    // Update guild
    await this.ctx.firestore.updateGuild(subscription.guildId, {
      updatedAt: now,
    });

    // Denormalize to guildDeployment
    const deployment = await this.ctx.firestore.getGuildDeployment(subscription.guildId);
    if (deployment) {
      await this.ctx.firestore.updateGuildDeployment(subscription.guildId, {
        subscriptionStatus: 'past_due',
        updatedAt: now,
      });
    }

    // Log failed payment
    const payment: Payment = {
      id: invoice.id,
      invoiceId: invoice.id,
      amountPaid: 0,
      currency: invoice.currency,
      status: 'failed',
      periodStart: new Date(invoice.period_start! * 1000).toISOString(),
      periodEnd: new Date(invoice.period_end! * 1000).toISOString(),
      paidAt: now,
      createdAt: now,
    };

    await this.ctx.firestore.createPayment(subscriptionId, invoice.id, payment);

    this.ctx.logger.error('Payment failed for invoice', {
      invoiceId: invoice.id,
      subscriptionId,
      guildId: subscription.guildId,
    });
  }
}
