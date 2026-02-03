import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { db } from './index.js';
import { sharedDiscordBotToken, sharedAnthropicApiKey } from './admin.js';
import { defineSecret } from 'firebase-functions/params';

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

    if (!guildData) {
      logger.error('No guild data in created document', { guildId });
      return;
    }

    logger.info('Guild document created, starting auto-provisioning', {
      guildId,
      guildName: guildData.guildName,
      status: guildData.status,
    });

    // Only provision if status is 'pending'
    if (guildData.status !== 'pending') {
      logger.info('Guild status is not pending, skipping provisioning', {
        guildId,
        status: guildData.status,
      });
      return;
    }

    try {
      // Import provisioning logic from fly-hosting
      // We'll call the internal provisioning logic
      const { provisionGuildInternal } = await import('./fly-hosting.js');

      await provisionGuildInternal(
        guildId,
        sharedDiscordBotToken.value(),
        sharedAnthropicApiKey.value(),
        flyApiToken.value()
      );

      logger.info('Auto-provisioning completed successfully', { guildId });
    } catch (error) {
      logger.error('Auto-provisioning failed', {
        guildId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Update guild document with error status
      await db.collection('guilds').doc(guildId).update({
        status: 'error',
        errorMessage: `Auto-provisioning failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        updatedAt: new Date().toISOString(),
      });
    }
  }
);
