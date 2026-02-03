import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db } from './index.js';
import {
  discordClientId,
  discordClientSecret,
  discordRedirectUri,
} from './admin.js';

/**
 * Handle Discord OAuth callback
 * This function is called when a user completes the Discord OAuth flow
 *
 * Flow:
 * 1. User clicks "Add to Discord" on website
 * 2. Discord redirects to this endpoint with code and guild_id
 * 3. Exchange code for access token
 * 4. Fetch guild details from Discord API
 * 5. Create guilds/{guildId} document in Firestore
 * 6. Trigger provisionGuild to create Fly.io resources
 * 7. Redirect to success page
 */
export const handleDiscordOAuth = onRequest(
  {
    secrets: [discordClientSecret],
  },
  async (req, res) => {
    try {
      const { code, guild_id, permissions } = req.query;

      if (!code || !guild_id) {
        logger.error('Missing required OAuth parameters', { code: !!code, guild_id: !!guild_id });
        res.status(400).send('Missing required parameters: code and guild_id');
        return;
      }

      logger.info('Processing Discord OAuth callback', {
        guild_id,
        permissions,
      });

      // Step 1: Exchange OAuth code for access token
      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: discordClientId.value(),
          client_secret: discordClientSecret.value(),
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: discordRedirectUri.value(),
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        logger.error('Failed to exchange OAuth code', {
          status: tokenResponse.status,
          error: errorData,
        });
        res.status(500).send('Failed to exchange OAuth code');
        return;
      }

      const tokens = await tokenResponse.json();
      const accessToken = tokens.access_token;

      // Step 2: Fetch guild details from Discord API
      const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guild_id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!guildResponse.ok) {
        logger.error('Failed to fetch guild details', {
          status: guildResponse.status,
          guild_id,
        });
        res.status(500).send('Failed to fetch guild details');
        return;
      }

      const guildData = await guildResponse.json();

      // Step 3: Get the user who installed the bot (from the webhook payload)
      // Discord includes this in the OAuth flow
      const currentUserResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      let installedBy = 'unknown';
      if (currentUserResponse.ok) {
        const userData = await currentUserResponse.json();
        installedBy = userData.id;
      }

      // Step 4: Create guilds/{guildId} document in Firestore
      const guildDoc = {
        guildName: guildData.name,
        guildIcon: guildData.icon || null,
        status: 'pending' as const, // Will be updated to 'provisioning' then 'active'
        installedBy,
        permissions: permissions as string || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        memoryContextSize: 10000, // Default memory context size
      };

      await db.collection('guilds').doc(guild_id as string).set(guildDoc);

      logger.info('Created guild document', {
        guild_id,
        guildName: guildData.name,
        installedBy,
      });

      // Step 5: Redirect to success page where provisionGuild will be triggered
      // The success page will listen to the guild document and call provisionGuild
      const successUrl = `${discordRedirectUri.value().replace('/auth/discord/callback', '')}/guilds/${guild_id}/setup`;

      res.redirect(successUrl);

    } catch (error) {
      logger.error('Error handling Discord OAuth callback', error);
      res.status(500).send('Internal server error during OAuth flow');
    }
  }
);
