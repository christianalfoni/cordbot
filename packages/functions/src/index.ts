import { onCall, HttpsError } from 'firebase-functions/v2/https';
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

// Define secrets (stored in Google Cloud Secret Manager)
const googleClientId = defineSecret('GOOGLE_CLIENT_ID');
const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');

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

// Export Fly.io hosting functions
export {
  applyForHostingBeta,
  createHostedBot,
  getHostedBotStatus,
  getHostedBotLogs,
  restartHostedBot,
  deployHostedBot,
  deprovisionHostedBot,
  provisionGuild,
} from './fly-hosting.js';

// Export Discord OAuth handlers
export { handleDiscordOAuth } from './discord-oauth.js';
export { processDiscordOAuth } from './process-oauth.js';

// Export Firestore triggers
export { onGuildCreated } from './guild-triggers.js';
