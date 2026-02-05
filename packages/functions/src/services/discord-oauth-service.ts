/**
 * Discord OAuth Service - Handle Discord OAuth flow
 *
 * Pure business logic for Discord OAuth operations.
 * No direct Firebase or external API imports.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext, Guild } from '../context.js';

export class DiscordOAuthService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Process Discord OAuth callback and create guild document
   */
  async processDiscordOAuth(params: {
    code: string;
    guildId: string;
    permissions: string;  // Received from Discord but not stored (same for all bots)
    redirectUri: string;
    firebaseUserId: string;
    tier?: 'free' | 'starter' | 'pro' | 'business';
  }): Promise<{
    success: true;
    guildId: string;
    guildName: string;
    guildIcon: string | null;
  }> {
    const { code, guildId, redirectUri, firebaseUserId, tier } = params;

    this.ctx.logger.info('Processing Discord OAuth', { guildId });

    // Exchange code and create guild document
    const guildData = await this.exchangeCodeAndCreateGuild({
      code,
      guildId,
      redirectUri,
      userId: firebaseUserId,
      tier: tier || 'free',
    });

    return {
      success: true,
      guildId,
      guildName: guildData.name,
      guildIcon: guildData.icon,
    };
  }

  /**
   * Core OAuth flow: Exchange code for token, fetch guild details, create guild document
   * Consolidated logic used by all OAuth entry points
   */
  private async exchangeCodeAndCreateGuild(params: {
    code: string;
    guildId: string;
    redirectUri: string;
    userId: string;
    tier: 'free' | 'starter' | 'pro' | 'business';
  }): Promise<{ name: string; icon: string | null }> {
    const { code, guildId, redirectUri, userId, tier } = params;

    // Check if user is trying to create another free tier bot
    if (tier === 'free') {
      const user = await this.ctx.firestore.getUser(userId);
      if (user?.freeTierBotDeployed) {
        this.ctx.logger.warn('User attempted to create multiple free tier bots', { userId });
        throw new HttpsError(
          'failed-precondition',
          'You can only create one free tier bot. Please upgrade to a paid tier to create additional bots.'
        );
      }
    }

    // Step 1: Exchange code for access token
    const tokenResponse = await this.ctx.http.fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.ctx.secrets.getSecret('DISCORD_CLIENT_ID'),
        client_secret: this.ctx.secrets.getSecret('DISCORD_CLIENT_SECRET'),
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      this.ctx.logger.error('Failed to exchange OAuth code:', errorData);
      throw new HttpsError('internal', 'Failed to exchange authorization code');
    }

    await tokenResponse.json();

    // Step 2: Fetch guild details using the bot token
    // Note: Using bot token instead of OAuth access token for more reliable access
    const guildResponse = await this.ctx.http.fetch(
      `https://discord.com/api/v10/guilds/${guildId}`,
      {
        headers: {
          Authorization: `Bot ${this.ctx.secrets.getSecret('SHARED_DISCORD_BOT_TOKEN')}`,
        },
      }
    );

    if (!guildResponse.ok) {
      const errorData = await guildResponse.json().catch(() => ({}));
      this.ctx.logger.error('Failed to fetch guild details', {
        status: guildResponse.status,
        statusText: guildResponse.statusText,
        guildId,
        error: errorData,
      });
      throw new HttpsError(
        'internal',
        `Failed to fetch guild details: ${guildResponse.status} ${guildResponse.statusText}`
      );
    }

    const guildData = await guildResponse.json();

    // Step 3: Create guild document in Firestore
    const now = this.ctx.getCurrentTime().toISOString();
    const guildDoc: Guild = {
      guildName: guildData.name,
      guildIcon: guildData.icon || null,
      status: 'pending',
      userId,
      tier,
      createdAt: now,
      updatedAt: now,
      memoryContextSize: 10000,
      periodStart: now,
      periodEnd: null,
      lastDeployedAt: now,
    };

    await this.ctx.firestore.createGuild(guildId, guildDoc);

    this.ctx.logger.info('Guild document created successfully', {
      guildId,
      guildName: guildData.name,
    });

    return {
      name: guildData.name,
      icon: guildData.icon || null,
    };
  }
}
