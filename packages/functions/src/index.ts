import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';

// Initialize Firebase Admin
initializeApp();
export const db = getFirestore();

// Import context and services
import { ProductionFunctionContext } from './context.impl.js';
import { OAuthService } from './services/oauth-service.js';
import { BotManifestService } from './services/bot-manifest-service.js';
import { TokenRefreshService } from './services/token-refresh-service.js';
import { QueryLimitService } from './services/query-limit-service.js';
import { GuildInfoService } from './services/guild-info-service.js';
import { GuildUpgradeService } from './services/guild-upgrade-service.js';
import { InitService } from './services/init-service.js';
import { GuildProvisioningService } from './services/guild-provisioning-service.js';
import { StripeService } from './services/stripe-service.js';
import { StripeWebhookService } from './services/stripe-webhook-service.js';
import { sharedDiscordBotToken, sharedAnthropicApiKey } from './admin.js';

// Define secrets (stored in Google Cloud Secret Manager)
const googleClientId = defineSecret('GOOGLE_CLIENT_ID');
const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');
const flyApiToken = defineSecret('FLY_API_TOKEN');
const stripeApiKey = defineSecret('STRIPE_API_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const stripePriceIdStarter = defineSecret('STRIPE_PRICE_ID_STARTER');
const stripePriceIdPro = defineSecret('STRIPE_PRICE_ID_PRO');

/**
 * Exchange Google OAuth code for tokens and store in bot's profile
 */
export const exchangeGmailToken = onCall(
  { secrets: [googleClientId, googleClientSecret] },
  async (request) => {
    // Verify the user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to exchange Gmail token');
    }

    const { code, userId, botId, redirectUri } = request.data;

    if (!code || !userId || !botId || !redirectUri) {
      throw new HttpsError('invalid-argument', 'code, userId, botId, and redirectUri are required');
    }

    // Verify userId matches authenticated user
    if (request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'User can only exchange tokens for their own account');
    }

    // Create context with secrets
    const ctx = new ProductionFunctionContext({
      GOOGLE_CLIENT_ID: googleClientId,
      GOOGLE_CLIENT_SECRET: googleClientSecret,
    });

    try {
      // Execute business logic
      const service = new OAuthService(ctx);
      return await service.exchangeGmailToken({ code, userId, botId, redirectUri });
    } catch (error) {
      ctx.logger.error('Error exchanging Gmail token:', error);
      throw new HttpsError('internal', 'An error occurred while connecting Gmail');
    }
  }
);

/**
 * Get bot manifest with bot's tool configuration and tokens
 * Authenticated via bot auth token in request data
 * Returns per-bot OAuth connections and tools configuration
 */
export const getBotManifest = onCall(async (request) => {
  const { botToken } = request.data;

  if (!botToken) {
    throw new HttpsError('invalid-argument', 'botToken is required');
  }

  // Create context
  const ctx = new ProductionFunctionContext();

  try {
    // Execute business logic
    const service = new BotManifestService(ctx);
    const result = await service.getBotManifest({ botToken });

    if ('error' in result) {
      return result;
    }

    return result;
  } catch (error) {
    ctx.logger.error('Error generating bot manifest:', error);
    throw new HttpsError('internal', 'An error occurred while generating manifest');
  }
});

/**
 * Refresh an expired OAuth token for a specific category
 * Authenticated via bot auth token in request data
 * Updates per-bot OAuth connections
 */
export const refreshToken = onCall({ secrets: [googleClientId, googleClientSecret] }, async (request) => {
  const { botToken, category } = request.data;

  if (!botToken || !category) {
    throw new HttpsError('invalid-argument', 'botToken and category are required');
  }

  // Create context with secrets
  const ctx = new ProductionFunctionContext({
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
  });

  try {
    // Execute business logic
    const service = new TokenRefreshService(ctx);
    return await service.refreshToken({ botToken, category });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error refreshing token:', error);
    throw new HttpsError('internal', 'An error occurred while refreshing token');
  }
});

/**
 * Check if a guild can proceed with a query (called by bot)
 */
export const checkQueryLimit = onRequest(async (req, res) => {
  // Enable CORS for bot requests
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { guildId } = req.body.data || {};

  if (!guildId) {
    res.status(400).json({ error: 'guildId is required' });
    return;
  }

  const ctx = new ProductionFunctionContext();

  try {
    const service = new QueryLimitService(ctx);
    const result = await service.checkQueryLimit({ guildId });
    res.status(200).json({ result });
  } catch (error) {
    ctx.logger.error('Error checking query limit:', error);
    res.status(500).json({ error: 'An error occurred while checking query limit' });
  }
});

/**
 * Track query usage and update limits (called by bot)
 */
export const trackQueryLimit = onRequest(async (req, res) => {
  // Enable CORS for bot requests
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { guildId, type, cost, success, memoryTokens } = req.body.data || {};

  if (!guildId || !type || cost === undefined || success === undefined) {
    res.status(400).json({ error: 'guildId, type, cost, and success are required' });
    return;
  }

  const ctx = new ProductionFunctionContext();

  try {
    const service = new QueryLimitService(ctx);
    const result = await service.trackQueryLimit({ guildId, type, cost, success, memoryTokens });
    res.status(200).json({ result });
  } catch (error) {
    ctx.logger.error('Error tracking query limit:', error);
    res.status(500).json({ error: 'An error occurred while tracking query limit' });
  }
});

/**
 * Get guild deployment info for a user (called by web UI)
 */
export const getGuildDeploymentInfo = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId } = request.data;

  if (!guildId) {
    throw new HttpsError('invalid-argument', 'guildId is required');
  }

  const ctx = new ProductionFunctionContext();

  try {
    const service = new GuildInfoService(ctx);
    return await service.getGuildDeploymentInfo({ userId: request.auth.uid, guildId });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error getting guild deployment info:', error);
    throw new HttpsError('internal', 'An error occurred while fetching guild info');
  }
});

/**
 * List all guilds for a user (called by web UI)
 */
export const listUserGuilds = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const ctx = new ProductionFunctionContext();

  try {
    const service = new GuildInfoService(ctx);
    return await service.listUserGuilds({ userId: request.auth.uid });
  } catch (error) {
    ctx.logger.error('Error listing user guilds:', error);
    throw new HttpsError('internal', 'An error occurred while listing guilds');
  }
});

/**
 * Upgrade a guild to a paid tier (called by web UI)
 */
export const upgradeGuild = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId, targetTier } = request.data;

  if (!guildId || !targetTier) {
    throw new HttpsError('invalid-argument', 'guildId and targetTier are required');
  }

  if (!['starter', 'pro', 'business'].includes(targetTier)) {
    throw new HttpsError('invalid-argument', 'Invalid targetTier. Must be starter, pro, or business');
  }

  const ctx = new ProductionFunctionContext();

  try {
    const service = new GuildUpgradeService(ctx);
    return await service.upgradeGuild({ userId: request.auth.uid, guildId, targetTier });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error upgrading guild:', error);
    throw new HttpsError('internal', 'An error occurred while upgrading guild');
  }
});

/**
 * Provision a free tier guild (called by web UI)
 */
export const provisionFreeTierGuild = onCall({ secrets: [flyApiToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId } = request.data;

  if (!guildId) {
    throw new HttpsError('invalid-argument', 'guildId is required');
  }

  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
  });

  try {
    const service = new GuildProvisioningService(ctx);
    return await service.provisionFreeTierGuild({ userId: request.auth.uid, guildId });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error provisioning free tier guild:', error);
    throw new HttpsError('internal', 'An error occurred while provisioning guild');
  }
});

/**
 * Provision a paid tier guild (called by web UI after subscription is created)
 */
export const provisionPaidTierGuild = onCall(
  { secrets: [flyApiToken, sharedDiscordBotToken, sharedAnthropicApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { guildId } = request.data;

    if (!guildId) {
      throw new HttpsError('invalid-argument', 'guildId is required');
    }

    const ctx = new ProductionFunctionContext({
      FLY_API_TOKEN: flyApiToken,
      SHARED_DISCORD_BOT_TOKEN: sharedDiscordBotToken,
      SHARED_ANTHROPIC_API_KEY: sharedAnthropicApiKey,
    });

    try {
      const service = new GuildProvisioningService(ctx);
      return await service.provisionGuild({ guildId });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      ctx.logger.error('Error provisioning paid tier guild:', error);
      throw new HttpsError('internal', 'An error occurred while provisioning guild');
    }
  }
);

/**
 * Initialize free tier config (admin operation)
 */
export const initializeFreeTierConfig = onCall(async (request) => {
  // TODO: Add admin check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const ctx = new ProductionFunctionContext();

  try {
    const service = new InitService(ctx);
    await service.initializeFreeTierConfig();
    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error initializing free tier config:', error);
    throw new HttpsError('internal', 'An error occurred while initializing config');
  }
});

/**
 * Adjust free tier slots (admin operation)
 */
export const adjustFreeTierSlots = onCall(async (request) => {
  // TODO: Add admin check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { newMaxSlots } = request.data;

  if (newMaxSlots === undefined || typeof newMaxSlots !== 'number') {
    throw new HttpsError('invalid-argument', 'newMaxSlots is required and must be a number');
  }

  const ctx = new ProductionFunctionContext();

  try {
    const service = new InitService(ctx);
    await service.adjustFreeTierSlots(newMaxSlots);
    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error adjusting free tier slots:', error);
    throw new HttpsError('internal', 'An error occurred while adjusting slots');
  }
});

/**
 * Deprovision (delete) a guild deployment (called by web UI)
 */
export const deprovisionGuild = onCall({ secrets: [flyApiToken, stripeApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId } = request.data;

  if (!guildId) {
    throw new HttpsError('invalid-argument', 'guildId is required');
  }

  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
    STRIPE_API_KEY: stripeApiKey,
  });

  try {
    const service = new GuildProvisioningService(ctx);
    return await service.deprovisionGuild({ userId: request.auth.uid, guildId });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error deprovisioning guild:', error);
    throw new HttpsError('internal', 'An error occurred while deleting guild');
  }
});

/**
 * Restart a guild's machine (called by web UI)
 */
export const restartGuild = onCall({ secrets: [flyApiToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId } = request.data;

  if (!guildId) {
    throw new HttpsError('invalid-argument', 'guildId is required');
  }

  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
  });

  try {
    const service = new GuildProvisioningService(ctx);
    return await service.restartGuild({ userId: request.auth.uid, guildId });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error restarting guild:', error);
    throw new HttpsError('internal', 'An error occurred while restarting guild');
  }
});

/**
 * Repair a guild's machine by restoring environment variables (called by web UI)
 */
export const repairGuild = onCall({ secrets: [flyApiToken, sharedDiscordBotToken, sharedAnthropicApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId } = request.data;

  if (!guildId) {
    throw new HttpsError('invalid-argument', 'guildId is required');
  }

  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
    SHARED_DISCORD_BOT_TOKEN: sharedDiscordBotToken,
    SHARED_ANTHROPIC_API_KEY: sharedAnthropicApiKey,
  });

  try {
    const service = new GuildProvisioningService(ctx);
    return await service.repairGuild({ userId: request.auth.uid, guildId });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error repairing guild:', error);
    throw new HttpsError('internal', 'An error occurred while repairing guild');
  }
});

/**
 * Deploy an update to a guild's machine (called by web UI)
 */
export const deployGuildUpdate = onCall({ secrets: [flyApiToken, sharedDiscordBotToken, sharedAnthropicApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId, version } = request.data;

  if (!guildId || !version) {
    throw new HttpsError('invalid-argument', 'guildId and version are required');
  }

  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
    SHARED_DISCORD_BOT_TOKEN: sharedDiscordBotToken,
    SHARED_ANTHROPIC_API_KEY: sharedAnthropicApiKey,
  });

  try {
    const service = new GuildProvisioningService(ctx);
    return await service.deployGuildUpdate({ userId: request.auth.uid, guildId, version });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error deploying guild update:', error);
    throw new HttpsError('internal', 'An error occurred while deploying update');
  }
});

/**
 * Get guild machine status (called by web UI)
 */
export const getGuildStatus = onCall({ secrets: [flyApiToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId } = request.data;

  if (!guildId) {
    throw new HttpsError('invalid-argument', 'guildId is required');
  }

  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
  });

  try {
    const service = new GuildProvisioningService(ctx);
    return await service.getGuildStatus({ userId: request.auth.uid, guildId });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error getting guild status:', error);
    throw new HttpsError('internal', 'An error occurred while getting guild status');
  }
});

/**
 * Get guild machine logs (called by web UI)
 */
export const getGuildLogs = onCall({ secrets: [flyApiToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId } = request.data;

  if (!guildId) {
    throw new HttpsError('invalid-argument', 'guildId is required');
  }

  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
  });

  try {
    const service = new GuildProvisioningService(ctx);
    return await service.getGuildLogs({ userId: request.auth.uid, guildId });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    ctx.logger.error('Error getting guild logs:', error);
    throw new HttpsError('internal', 'An error occurred while getting guild logs');
  }
});

// Note: Guild provisioning happens automatically via onGuildCreated trigger
// No manual provisioning function needed

/**
 * Create a Stripe checkout session for guild subscription (called by web UI)
 */
export const createGuildSubscription = onCall(
  {
    secrets: [stripeApiKey, stripePriceIdStarter, stripePriceIdPro],
  },
  async (request) => {
    console.log('createGuildSubscription called');

    if (!request.auth) {
      console.log('No auth');
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { guildId, tier, successUrl, cancelUrl } = request.data;
    console.log('Request data:', { guildId, tier, successUrl, cancelUrl, userId: request.auth.uid });

    if (!guildId || !tier || !successUrl || !cancelUrl) {
      console.log('Missing required fields');
      throw new HttpsError(
        'invalid-argument',
        'guildId, tier, successUrl, and cancelUrl are required'
      );
    }

    if (!['starter', 'pro'].includes(tier)) {
      console.log('Invalid tier:', tier);
      throw new HttpsError('invalid-argument', 'Invalid tier. Must be starter or pro');
    }

    console.log('Creating context');
    const ctx = new ProductionFunctionContext({
      STRIPE_API_KEY: stripeApiKey,
      STRIPE_PRICE_ID_STARTER: stripePriceIdStarter,
      STRIPE_PRICE_ID_PRO: stripePriceIdPro,
    });

    try {
      console.log('Creating StripeService');
      const service = new StripeService(ctx);
      console.log('Calling createGuildSubscription');
      const result = await service.createGuildSubscription({
        guildId,
        tier,
        userId: request.auth.uid,
        successUrl,
        cancelUrl,
      });
      console.log('Success:', result);
      return result;
    } catch (error) {
      console.error('Caught error:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      ctx.logger.error('Error creating guild subscription:', error);
      throw new HttpsError('internal', 'An error occurred while creating subscription');
    }
  }
);

/**
 * Create a Stripe billing portal session (called by web UI)
 */
export const createBillingPortal = onCall(
  {
    secrets: [stripeApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { returnUrl } = request.data;

    if (!returnUrl) {
      throw new HttpsError('invalid-argument', 'returnUrl is required');
    }

    const ctx = new ProductionFunctionContext({
      STRIPE_API_KEY: stripeApiKey,
    });

    try {
      const service = new StripeService(ctx);
      return await service.createBillingPortal({
        userId: request.auth.uid,
        returnUrl,
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      ctx.logger.error('Error creating billing portal:', error);
      throw new HttpsError('internal', 'An error occurred while creating billing portal');
    }
  }
);

/**
 * Cancel a subscription at period end (called by web UI)
 */
export const cancelSubscription = onCall(
  {
    secrets: [stripeApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { subscriptionId } = request.data;

    if (!subscriptionId) {
      throw new HttpsError('invalid-argument', 'subscriptionId is required');
    }

    const ctx = new ProductionFunctionContext({
      STRIPE_API_KEY: stripeApiKey,
    });

    try {
      const service = new StripeService(ctx);
      return await service.cancelSubscription({
        subscriptionId,
        userId: request.auth.uid,
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      ctx.logger.error('Error canceling subscription:', error);
      throw new HttpsError('internal', 'An error occurred while canceling subscription');
    }
  }
);

/**
 * Resume a subscription that was set to cancel (called by web UI)
 */
export const resumeSubscription = onCall(
  {
    secrets: [stripeApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { subscriptionId } = request.data;

    if (!subscriptionId) {
      throw new HttpsError('invalid-argument', 'subscriptionId is required');
    }

    const ctx = new ProductionFunctionContext({
      STRIPE_API_KEY: stripeApiKey,
    });

    try {
      const service = new StripeService(ctx);
      return await service.resumeSubscription({
        subscriptionId,
        userId: request.auth.uid,
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      ctx.logger.error('Error resuming subscription:', error);
      throw new HttpsError('internal', 'An error occurred while resuming subscription');
    }
  }
);

/**
 * Stripe webhook handler (receives events from Stripe)
 * Includes provisioning secrets to trigger guild provisioning after subscription creation
 */
export const stripeWebhook = onRequest(
  {
    secrets: [stripeApiKey, stripeWebhookSecret, flyApiToken, sharedDiscordBotToken, sharedAnthropicApiKey],
  },
  async (req, res) => {
    const ctx = new ProductionFunctionContext({
      STRIPE_API_KEY: stripeApiKey,
      STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
      FLY_API_TOKEN: flyApiToken,
      SHARED_DISCORD_BOT_TOKEN: sharedDiscordBotToken,
      SHARED_ANTHROPIC_API_KEY: sharedAnthropicApiKey,
    });

    try {
      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        ctx.logger.error('Missing Stripe signature header');
        res.status(400).send('Missing signature');
        return;
      }

      const body = req.rawBody?.toString() || '';

      const service = new StripeWebhookService(ctx);
      await service.handleWebhook({
        body,
        signature,
      });

      res.status(200).json({ received: true });
    } catch (error) {
      ctx.logger.error('Error handling Stripe webhook:', error);
      res.status(400).send('Webhook error');
    }
  }
);

// Export Discord OAuth handler
export { processDiscordOAuth } from './process-oauth.js';

// Export Firestore triggers
export { onGuildCreated } from './guild-triggers.js';

// Export Auth triggers
export { onUserCreate, updateLastLogin } from './auth-triggers.js';
