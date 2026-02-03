/**
 * Token Refresh Service - Refresh expired OAuth tokens
 *
 * Pure business logic for token refresh operations.
 * No direct Firebase or external API imports.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext } from '../context.js';

export class TokenRefreshService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Refresh an expired OAuth token for a specific category
   */
  async refreshToken(params: {
    botToken: string;
    category: string;
  }): Promise<{ accessToken: string; expiresAt: number }> {
    const { botToken, category } = params;

    // Query bot documents across all users
    const botResult = await this.ctx.firestore.queryBotByToken(botToken);

    if (!botResult) {
      this.ctx.logger.warn('No bot found with provided Discord bot token');
      throw new HttpsError('not-found', 'Invalid bot token');
    }

    const { userId, botId, data: botData } = botResult;

    // Handle token refresh based on category
    if (category === 'gmail') {
      return this.refreshGmailToken(userId, botId, botData);
    } else {
      throw new HttpsError('invalid-argument', `Unknown token category: ${category}`);
    }
  }

  /**
   * Refresh Gmail OAuth token
   */
  private async refreshGmailToken(
    userId: string,
    botId: string,
    botData: any
  ): Promise<{ accessToken: string; expiresAt: number }> {
    const gmailConnection = botData.oauthConnections?.gmail;

    if (!gmailConnection) {
      throw new HttpsError('not-found', 'Gmail not connected for this bot');
    }

    if (!gmailConnection.refreshToken) {
      throw new HttpsError('failed-precondition', 'No refresh token available for Gmail');
    }

    this.ctx.logger.info(`Refreshing Gmail token for bot ${botId} (user ${userId})`);

    // Use refresh token to get new access token
    const tokenResponse = await this.ctx.http.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: gmailConnection.refreshToken,
        client_id: this.ctx.secrets.getSecret('GOOGLE_CLIENT_ID'),
        client_secret: this.ctx.secrets.getSecret('GOOGLE_CLIENT_SECRET'),
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      this.ctx.logger.error('Failed to refresh Gmail token:', {
        status: tokenResponse.status,
        error: errorData,
        botId,
        userId,
      });
      throw new HttpsError(
        'internal',
        `Failed to refresh token: ${errorData.error_description || errorData.error}`
      );
    }

    const tokens = await tokenResponse.json();

    // Update bot's Firestore document with new access token
    const newExpiresAt = Date.now() + tokens.expires_in * 1000;
    await this.ctx.firestore.updateBot(userId, botId, {
      oauthConnections: {
        ...botData.oauthConnections,
        gmail: {
          ...gmailConnection,
          accessToken: tokens.access_token,
          expiresAt: newExpiresAt,
        },
      },
    } as any);

    this.ctx.logger.info(
      `Gmail token refreshed for bot ${botId}, expires at ${new Date(newExpiresAt).toISOString()}`
    );

    return {
      accessToken: tokens.access_token,
      expiresAt: newExpiresAt,
    };
  }
}
