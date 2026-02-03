/**
 * Bot Manifest Service - Generate bot manifests with tool configuration and tokens
 *
 * Pure business logic for bot manifest generation.
 * No direct Firebase or external API imports.
 */

import type { FunctionContext } from '../context.js';

export class BotManifestService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Get bot manifest with bot's tool configuration and tokens
   * Authenticated via bot auth token
   */
  async getBotManifest(params: {
    botToken: string;
  }): Promise<{
    userId: string;
    botId: string;
    toolsConfig: Record<string, string[]>;
    tokens: { gmail?: { accessToken: string; expiresAt: number } };
    memoryContextSize: number;
    generatedAt: string;
  } | { error: string }> {
    const { botToken } = params;

    // Query bot documents across all users using collection group query
    const botResult = await this.ctx.firestore.queryBotByToken(botToken);

    if (!botResult) {
      this.ctx.logger.warn('No bot found with provided auth token');
      return {
        error: 'Invalid bot token',
      };
    }

    const { userId, botId, data: botData } = botResult;

    // Get per-bot toolsConfig and oauthConnections
    const toolsConfig = botData.toolsConfig || {};

    // Build tokens object from bot's oauthConnections
    const tokens: { gmail?: { accessToken: string; expiresAt: number } } = {};
    const oauthConnections = botData.oauthConnections || {};

    // Add Gmail token if connected (return even if expired - bot will refresh on demand)
    if (oauthConnections.gmail) {
      tokens.gmail = {
        accessToken: oauthConnections.gmail.accessToken,
        expiresAt: oauthConnections.gmail.expiresAt,
      };
    }

    // Count tools for logging
    const toolCount = Object.values(toolsConfig).reduce(
      (sum: number, tools: any) => sum + (Array.isArray(tools) ? tools.length : 0),
      0
    );

    this.ctx.logger.info(
      `Manifest generated for bot ${botId} (user ${userId}): ${toolCount} tools configured`
    );

    return {
      userId,
      botId,
      toolsConfig,
      tokens,
      memoryContextSize: botData.memoryContextSize || 10000,
      generatedAt: this.ctx.getCurrentTime().toISOString(),
    };
  }
}
