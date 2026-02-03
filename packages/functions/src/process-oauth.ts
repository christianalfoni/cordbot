import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
  discordClientId,
  discordClientSecret,
  sharedDiscordBotToken,
  sharedAnthropicApiKey,
} from './admin.js';
import { ProductionFunctionContext } from './context.impl.js';
import { DiscordOAuthService } from './services/discord-oauth-service.js';
import { GuildProvisioningService } from './services/guild-provisioning-service.js';

const flyApiToken = defineSecret('FLY_API_TOKEN');

/**
 * Process Discord OAuth callback securely on the backend and deploy immediately
 * Called by the frontend after Discord redirects back with a code
 *
 * This function:
 * 1. Exchanges OAuth code for access token (client secret stays secure on backend)
 * 2. Fetches guild details from Discord API
 * 3. Creates guild document in Firestore
 * 4. Immediately provisions Fly.io deployment with shared bot token and API key
 */
export const processDiscordOAuth = onCall(
  {
    secrets: [discordClientSecret, sharedDiscordBotToken, sharedAnthropicApiKey, flyApiToken],
  },
  async (request) => {
    const { code, guildId, permissions, redirectUri } = request.data;

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
      SHARED_ANTHROPIC_API_KEY: sharedAnthropicApiKey,
      FLY_API_TOKEN: flyApiToken,
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
      });

      // Immediately provision Fly.io deployment
      ctx.logger.info('Starting Fly.io provisioning', { guildId });

      try {
        const provisioningService = new GuildProvisioningService(ctx);
        const deployResult = await provisioningService.provisionGuild({ guildId });

        ctx.logger.info('Fly.io provisioning completed', {
          guildId,
          appName: deployResult.appName,
          machineId: deployResult.machineId,
        });

        return {
          success: true,
          guildId: oauthResult.guildId,
          guildName: oauthResult.guildName,
          guildIcon: oauthResult.guildIcon,
          deployed: true,
          appName: deployResult.appName,
          machineId: deployResult.machineId,
        };
      } catch (deployError) {
        ctx.logger.error('Fly.io provisioning failed', {
          guildId,
          error: deployError,
        });

        // Update guild status to reflect deployment failure
        await ctx.firestore.updateGuild(guildId, {
          status: 'error',
          error: deployError instanceof Error ? deployError.message : 'Deployment failed',
          updatedAt: ctx.getCurrentTime().toISOString(),
        });

        throw new HttpsError(
          'internal',
          `Guild created but deployment failed: ${
            deployError instanceof Error ? deployError.message : 'Unknown error'
          }`
        );
      }
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
