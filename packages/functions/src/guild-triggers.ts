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

    // Create context with secrets
    const ctx = new ProductionFunctionContext({
      FLY_API_TOKEN: flyApiToken,
      SHARED_DISCORD_BOT_TOKEN: sharedDiscordBotToken,
      SHARED_ANTHROPIC_API_KEY: sharedAnthropicApiKey,
    });

    // CRITICAL: Read current document state from Firestore, not event snapshot
    // The event snapshot shows the state at creation time, so if this trigger
    // fires multiple times (retries), all executions would see status: 'pending'
    const guildData = await ctx.firestore.getGuild(guildId);

    if (!guildData) {
      ctx.logger.error('Guild document not found', { guildId });
      return;
    }

    ctx.logger.info('Guild document created, checking current status', {
      guildId,
      guildName: guildData.guildName,
      status: guildData.status,
      tier: guildData.tier,
    });

    // Only provision if status is 'pending'
    // This reads the CURRENT status, so if another execution already updated it
    // to 'provisioning', this execution will skip
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

      // Only auto-provision free tier guilds
      // Paid tier guilds wait for subscription creation (handled by webhook)
      if (guildData.tier === 'free') {
        ctx.logger.info('Provisioning free tier guild', { guildId });
        await service.provisionFreeTierGuild({
          userId: guildData.userId,
          guildId
        });
        ctx.logger.info('Auto-provisioning completed successfully', { guildId });
      } else {
        // For paid tiers, skip auto-provisioning and wait for subscription
        ctx.logger.info('Paid tier guild detected - waiting for subscription before provisioning', {
          guildId,
          tier: guildData.tier
        });
      }
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
