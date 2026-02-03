import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { db } from './index.js';
import { discordClientId, discordClientSecret, sharedDiscordBotToken, sharedAnthropicApiKey } from './admin.js';
import { provisionGuildInternal } from './fly-hosting.js';

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
      throw new HttpsError(
        'invalid-argument',
        'code, guildId, and redirectUri are required'
      );
    }

    if (!firebaseUserId) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    try {
      logger.info('Processing Discord OAuth', { guildId });

      // Step 1: Exchange code for access token (SECURE - uses client secret on backend)
      // Use the redirectUri that was passed from frontend (must match the one used in OAuth request)
      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: discordClientId.value(),
          client_secret: discordClientSecret.value(), // SECURE: Only on backend
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri, // Use the exact redirect_uri from the frontend
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        logger.error('Failed to exchange OAuth code:', errorData);
        throw new HttpsError(
          'internal',
          'Failed to exchange authorization code'
        );
      }

      const tokens = await tokenResponse.json();

      // Step 2: Fetch guild details using the bot token (not user's OAuth token)
      // The bot was just added to this guild, so it has access
      const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
        headers: {
          Authorization: `Bot ${sharedDiscordBotToken.value()}`,
        },
      });

      if (!guildResponse.ok) {
        const errorData = await guildResponse.json().catch(() => ({}));
        logger.error('Failed to fetch guild details', {
          status: guildResponse.status,
          statusText: guildResponse.statusText,
          guildId,
          error: errorData,
        });
        throw new HttpsError('internal', `Failed to fetch guild details: ${guildResponse.status} ${guildResponse.statusText}`);
      }

      const guildData = await guildResponse.json();

      // Step 3: Get user who installed the bot
      const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      let installedBy = 'unknown';
      if (userResponse.ok) {
        const userData = await userResponse.json();
        installedBy = userData.id;
      }

      // Step 4: Create guild document in Firestore
      const guildDoc = {
        guildName: guildData.name,
        guildIcon: guildData.icon || null,
        status: 'pending' as const,
        installedBy, // Discord user ID
        userId: firebaseUserId, // Firebase auth user ID
        permissions: permissions || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        memoryContextSize: 10000,
      };

      await db.collection('guilds').doc(guildId).set(guildDoc);

      logger.info('Guild document created successfully', {
        guildId,
        guildName: guildData.name,
      });

      // Step 5: Immediately provision Fly.io deployment
      logger.info('Starting Fly.io provisioning', { guildId });

      try {
        const deployResult = await provisionGuildInternal(
          guildId,
          sharedDiscordBotToken.value(),
          sharedAnthropicApiKey.value(),
          flyApiToken.value()
        );

        logger.info('Fly.io provisioning completed', {
          guildId,
          appName: deployResult.appName,
          machineId: deployResult.machineId,
        });

        return {
          success: true,
          guildId,
          guildName: guildData.name,
          guildIcon: guildData.icon,
          deployed: true,
          appName: deployResult.appName,
          machineId: deployResult.machineId,
        };
      } catch (deployError) {
        logger.error('Fly.io provisioning failed', {
          guildId,
          error: deployError,
        });

        // Update guild status to reflect deployment failure
        await db.collection('guilds').doc(guildId).update({
          status: 'error',
          error: deployError instanceof Error ? deployError.message : 'Deployment failed',
          updatedAt: new Date().toISOString(),
        });

        throw new HttpsError(
          'internal',
          `Guild created but deployment failed: ${
            deployError instanceof Error ? deployError.message : 'Unknown error'
          }`
        );
      }
    } catch (error) {
      logger.error('Error processing OAuth:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        `Failed to process OAuth: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
);
