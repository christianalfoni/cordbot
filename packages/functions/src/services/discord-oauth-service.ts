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
    permissions: string;
    redirectUri: string;
    firebaseUserId: string;
  }): Promise<{
    success: true;
    guildId: string;
    guildName: string;
    guildIcon: string | null;
  }> {
    const { code, guildId, permissions, redirectUri, firebaseUserId } = params;

    this.ctx.logger.info('Processing Discord OAuth', { guildId });

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

    const tokens = await tokenResponse.json();

    // Step 2: Fetch guild details using the bot token
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

    // Step 3: Get user who installed the bot
    const userResponse = await this.ctx.http.fetch('https://discord.com/api/v10/users/@me', {
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
    const guildDoc: Guild = {
      guildName: guildData.name,
      guildIcon: guildData.icon || null,
      status: 'pending',
      installedBy,
      userId: firebaseUserId,
      permissions: permissions || '',
      createdAt: this.ctx.getCurrentTime().toISOString(),
      updatedAt: this.ctx.getCurrentTime().toISOString(),
      memoryContextSize: 10000,
    };

    await this.ctx.firestore.createGuild(guildId, guildDoc);

    this.ctx.logger.info('Guild document created successfully', {
      guildId,
      guildName: guildData.name,
    });

    return {
      success: true,
      guildId,
      guildName: guildData.name,
      guildIcon: guildData.icon,
    };
  }

  /**
   * Handle Discord OAuth callback (HTTP request version)
   */
  async handleDiscordOAuthCallback(params: {
    code: string;
    guildId: string;
    permissions: string;
  }): Promise<{ success: true; guildId: string; redirectUrl: string }> {
    const { code, guildId, permissions } = params;

    this.ctx.logger.info('Processing Discord OAuth callback', {
      guildId,
      permissions,
    });

    // Step 1: Exchange OAuth code for access token
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
        redirect_uri: this.ctx.secrets.getSecret('DISCORD_REDIRECT_URI'),
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      this.ctx.logger.error('Failed to exchange OAuth code', {
        status: tokenResponse.status,
        error: errorData,
      });
      throw new Error('Failed to exchange OAuth code');
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;

    // Step 2: Fetch guild details from Discord API
    const guildResponse = await this.ctx.http.fetch(
      `https://discord.com/api/v10/guilds/${guildId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!guildResponse.ok) {
      this.ctx.logger.error('Failed to fetch guild details', {
        status: guildResponse.status,
        guildId,
      });
      throw new Error('Failed to fetch guild details');
    }

    const guildData = await guildResponse.json();

    // Step 3: Get the user who installed the bot
    const currentUserResponse = await this.ctx.http.fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    let installedBy = 'unknown';
    if (currentUserResponse.ok) {
      const userData = await currentUserResponse.json();
      installedBy = userData.id;
    }

    // Step 4: Create guilds document in Firestore
    const guildDoc: Guild = {
      guildName: guildData.name,
      guildIcon: guildData.icon || null,
      status: 'pending',
      installedBy,
      permissions: permissions || '',
      createdAt: this.ctx.getCurrentTime().toISOString(),
      updatedAt: this.ctx.getCurrentTime().toISOString(),
      memoryContextSize: 10000,
    };

    await this.ctx.firestore.createGuild(guildId, guildDoc);

    this.ctx.logger.info('Created guild document', {
      guildId,
      guildName: guildData.name,
      installedBy,
    });

    // Build redirect URL
    const redirectUri = this.ctx.secrets.getSecret('DISCORD_REDIRECT_URI');
    const successUrl = `${redirectUri.replace('/auth/discord/callback', '')}/guilds/${guildId}/setup`;

    return {
      success: true,
      guildId,
      redirectUrl: successUrl,
    };
  }
}
