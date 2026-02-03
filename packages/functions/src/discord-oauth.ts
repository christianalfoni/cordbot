import { onRequest } from 'firebase-functions/v2/https';
import { discordClientSecret, discordRedirectUri } from './admin.js';
import { ProductionFunctionContext } from './context.impl.js';
import { DiscordOAuthService } from './services/discord-oauth-service.js';

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
    secrets: [discordClientSecret, discordRedirectUri],
  },
  async (req, res) => {
    // Create context with secrets
    const ctx = new ProductionFunctionContext({
      DISCORD_CLIENT_SECRET: discordClientSecret,
      DISCORD_REDIRECT_URI: discordRedirectUri,
    });

    try {
      const { code, guild_id, permissions } = req.query;

      if (!code || !guild_id) {
        ctx.logger.error('Missing required OAuth parameters', { code: !!code, guild_id: !!guild_id });
        res.status(400).send('Missing required parameters: code and guild_id');
        return;
      }

      // Execute business logic
      const service = new DiscordOAuthService(ctx);
      const result = await service.handleDiscordOAuthCallback({
        code: code as string,
        guildId: guild_id as string,
        permissions: (permissions as string) || '',
      });

      // Redirect to success page
      res.redirect(result.redirectUrl);
    } catch (error) {
      ctx.logger.error('Error handling Discord OAuth callback', error);
      res.status(500).send('Internal server error during OAuth flow');
    }
  }
);
