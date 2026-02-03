import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { ProductionFunctionContext } from './context.impl.js';
import { FlyHostingService } from './services/fly-hosting-service.js';
import { GuildProvisioningService } from './services/guild-provisioning-service.js';

// Define Fly.io API secret
const flyApiToken = defineSecret('FLY_API_TOKEN');

/**
 * Apply for hosting beta access
 */
export const applyForHostingBeta = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;

  // Create context
  const ctx = new ProductionFunctionContext();

  try {
    const service = new FlyHostingService(ctx);
    return await service.applyForHostingBeta({ userId });
  } catch (error) {
    ctx.logger.error('Error applying for hosting beta:', error);
    throw new HttpsError('internal', 'Failed to submit beta application');
  }
});

/**
 * Provision a hosted bot (creates Fly.io resources and updates bot document)
 * Can be used for new bots or to provision existing unconfigured bots
 */
export const createHostedBot = onCall({ secrets: [flyApiToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const {
    botId: existingBotId,
    botName,
    mode,
    discordBotToken: providedDiscordBotToken,
    discordGuildId: providedDiscordGuildId,
    anthropicApiKey,
    memoryContextSize = 10000,
    region = 'sjc',
    version = 'latest',
  } = request.data;

  // Create context with secrets
  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
  });

  try {
    const service = new FlyHostingService(ctx);
    return await service.createHostedBot({
      userId,
      botId: existingBotId,
      botName,
      mode,
      discordBotToken: providedDiscordBotToken,
      discordGuildId: providedDiscordGuildId,
      anthropicApiKey,
      memoryContextSize,
      region,
      version,
    });
  } catch (error) {
    ctx.logger.error('Error creating hosted bot:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'internal',
      `Failed to create hosted bot: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

/**
 * Get hosted bot status from Fly.io
 */
export const getHostedBotStatus = onCall({ secrets: [flyApiToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const { botId } = request.data;

  if (!botId) {
    throw new HttpsError('invalid-argument', 'botId is required');
  }

  // Create context with secrets
  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
  });

  try {
    const service = new FlyHostingService(ctx);
    return await service.getHostedBotStatus({ userId, botId });
  } catch (error) {
    ctx.logger.error('Error getting hosted bot status:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Failed to get hosted bot status');
  }
});

/**
 * Get hosted bot logs
 * MVP: Returns CLI command to view logs
 */
export const getHostedBotLogs = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const { botId } = request.data;

  if (!botId) {
    throw new HttpsError('invalid-argument', 'botId is required');
  }

  // Create context
  const ctx = new ProductionFunctionContext();

  try {
    const service = new FlyHostingService(ctx);
    return await service.getHostedBotLogs({ userId, botId });
  } catch (error) {
    ctx.logger.error('Error getting hosted bot logs:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Failed to get hosted bot logs');
  }
});

/**
 * Restart hosted bot machine
 */
export const restartHostedBot = onCall({ secrets: [flyApiToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const { botId } = request.data;

  if (!botId) {
    throw new HttpsError('invalid-argument', 'botId is required');
  }

  // Create context with secrets
  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
  });

  try {
    const service = new FlyHostingService(ctx);
    return await service.restartHostedBot({ userId, botId });
  } catch (error) {
    ctx.logger.error('Error restarting hosted bot:', error);

    // Update status to error if restart fails
    try {
      await ctx.firestore.updateBot(userId, botId, {
        status: 'error',
        errorMessage: `Failed to restart: ${error instanceof Error ? error.message : 'Unknown error'}`,
        updatedAt: ctx.getCurrentTime().toISOString(),
      });
    } catch (updateError) {
      ctx.logger.error('Failed to update bot status to error:', updateError);
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'internal',
      `Failed to restart hosted bot: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

/**
 * Deploy new version to hosted bot
 */
export const deployHostedBot = onCall({ secrets: [flyApiToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const { version, botId } = request.data;

  if (!version) {
    throw new HttpsError('invalid-argument', 'version is required');
  }

  if (!botId) {
    throw new HttpsError('invalid-argument', 'botId is required');
  }

  // Create context with secrets
  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
  });

  try {
    const service = new FlyHostingService(ctx);
    return await service.deployHostedBot({ userId, botId, version });
  } catch (error) {
    ctx.logger.error('Error deploying hosted bot:', error);

    // Update status to error if deploy fails
    try {
      await ctx.firestore.updateBot(userId, botId, {
        status: 'error',
        errorMessage: `Failed to deploy update: ${error instanceof Error ? error.message : 'Unknown error'}`,
        updatedAt: ctx.getCurrentTime().toISOString(),
      });
    } catch (updateError) {
      ctx.logger.error('Failed to update bot status to error:', updateError);
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'internal',
      `Failed to deploy update: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

/**
 * Deprovision (delete) hosted bot
 */
export const deprovisionHostedBot = onCall({ secrets: [flyApiToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = request.auth.uid;
  const { botId } = request.data;

  if (!botId) {
    throw new HttpsError('invalid-argument', 'botId is required');
  }

  // Create context with secrets
  const ctx = new ProductionFunctionContext({
    FLY_API_TOKEN: flyApiToken,
  });

  try {
    const service = new FlyHostingService(ctx);
    return await service.deprovisionHostedBot({ userId, botId });
  } catch (error) {
    ctx.logger.error('Error deprovisioning hosted bot:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'internal',
      `Failed to delete hosted bot: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

/**
 * Provision a guild (OAuth-based shared bot model)
 * Creates Fly.io resources for a guild using shared Discord bot token and Anthropic API key
 *
 * Note: This callable function is kept for manual/testing purposes.
 * In production, guilds are auto-provisioned via Firestore trigger (onGuildCreated).
 */
export const provisionGuild = onCall(
  {
    secrets: [flyApiToken],
  },
  async (request) => {
    const { guildId } = request.data;

    if (!guildId) {
      throw new HttpsError('invalid-argument', 'guildId is required');
    }

    // Create context with secrets
    const ctx = new ProductionFunctionContext({
      FLY_API_TOKEN: flyApiToken,
    });

    try {
      const service = new GuildProvisioningService(ctx);
      const result = await service.provisionGuild({ guildId });

      return {
        success: true,
        guildId,
        appName: result.appName,
        machineId: result.machineId,
      };
    } catch (error) {
      ctx.logger.error('Error provisioning guild via callable function:', error);

      // Update guild status to error
      try {
        await ctx.firestore.updateGuild(guildId, {
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: ctx.getCurrentTime().toISOString(),
        });
      } catch (updateError) {
        ctx.logger.error('Failed to update guild status to error:', updateError);
      }

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        `Failed to provision guild: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);
