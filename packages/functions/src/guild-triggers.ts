import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { sharedDiscordBotToken, sharedAnthropicApiKey } from './admin.js';
import { ProductionFunctionContext } from './context.impl.js';
import { GuildProvisioningService } from './services/guild-provisioning-service.js';

// Import Fly.io token for provisioning
const flyApiToken = defineSecret('FLY_API_TOKEN');

/**
 * Automatically provision a guild when its document is created
 * This trigger fires when a new guild document is created via OAuth flow
 */
export const onGuildCreated = onDocumentCreated(
  {
    document: 'guilds/{guildId}',
    secrets: [flyApiToken, sharedDiscordBotToken, sharedAnthropicApiKey],
  },
  async (event) => {
    const guildId = event.params.guildId;
    const guildData = event.data?.data();

    // Create context with secrets
    const ctx = new ProductionFunctionContext({
      FLY_API_TOKEN: flyApiToken,
      SHARED_DISCORD_BOT_TOKEN: sharedDiscordBotToken,
      SHARED_ANTHROPIC_API_KEY: sharedAnthropicApiKey,
    });

    if (!guildData) {
      ctx.logger.error('No guild data in created document', { guildId });
      return;
    }

    ctx.logger.info('Guild document created, starting auto-provisioning', {
      guildId,
      guildName: guildData.guildName,
      status: guildData.status,
    });

    // Only provision if status is 'pending'
    if (guildData.status !== 'pending') {
      ctx.logger.info('Guild status is not pending, skipping provisioning', {
        guildId,
        status: guildData.status,
      });
      return;
    }

    try {
      // Execute provisioning business logic
      const service = new GuildProvisioningService(ctx);
      await service.provisionGuild({ guildId });

      ctx.logger.info('Auto-provisioning completed successfully', { guildId });
    } catch (error) {
      ctx.logger.error('Auto-provisioning failed', {
        guildId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Update guild document with error status
      await ctx.firestore.updateGuild(guildId, {
        status: 'error',
        errorMessage: `Auto-provisioning failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        updatedAt: ctx.getCurrentTime().toISOString(),
      });
    }
  }
);
