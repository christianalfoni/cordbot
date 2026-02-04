import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  discordClientId,
  discordClientSecret,
  sharedDiscordBotToken,
} from './admin.js';
import { ProductionFunctionContext } from './context.impl.js';
import { DiscordOAuthService } from './services/discord-oauth-service.js';

/**
 * Process Discord OAuth callback securely on the backend
 * Called by the frontend after Discord redirects back with a code
 *
 * This function:
 * 1. Exchanges OAuth code for access token (client secret stays secure on backend)
 * 2. Fetches guild details from Discord API using shared bot token
 * 3. Creates guild document in Firestore with status: 'pending'
 * 4. Firestore trigger (onGuildCreated) handles provisioning automatically
 */
export const processDiscordOAuth = onCall(
  {
    secrets: [discordClientSecret, sharedDiscordBotToken],
  },
  async (request) => {
    const { code, guildId, permissions, redirectUri, tier } = request.data;

    // Get Firebase user ID from auth context
    const firebaseUserId = request.auth?.uid;

    if (!code || !guildId || !redirectUri) {
      throw new HttpsError('invalid-argument', 'code, guildId, and redirectUri are required');
    }

    if (!firebaseUserId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Create context with secrets
    const ctx = new ProductionFunctionContext({
      DISCORD_CLIENT_ID: discordClientId,
      DISCORD_CLIENT_SECRET: discordClientSecret,
      SHARED_DISCORD_BOT_TOKEN: sharedDiscordBotToken,
    });

    try {
      ctx.logger.info('Processing Discord OAuth', { guildId });

      // Execute Discord OAuth business logic
      const oauthService = new DiscordOAuthService(ctx);
      const oauthResult = await oauthService.processDiscordOAuth({
        code,
        guildId,
        permissions,
        redirectUri,
        firebaseUserId,
        tier: tier || 'free', // Default to free if not specified
      });

      ctx.logger.info('Guild document created, provisioning will happen via trigger', { guildId });

      return {
        success: true,
        guildId: oauthResult.guildId,
        guildName: oauthResult.guildName,
        guildIcon: oauthResult.guildIcon,
      };
    } catch (error) {
      ctx.logger.error('Error processing OAuth:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        `Failed to process OAuth: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);
