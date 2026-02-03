/**
 * OAuth Service - Gmail OAuth token exchange and management
 *
 * Pure business logic for OAuth operations.
 * No direct Firebase or external API imports.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext } from '../context.js';

export class OAuthService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Exchange Google OAuth code for tokens and store in bot's profile
   */
  async exchangeGmailToken(params: {
    code: string;
    userId: string;
    botId: string;
    redirectUri: string;
  }): Promise<{ success: true; email: string }> {
    const { code, userId, botId, redirectUri } = params;

    this.ctx.logger.info('Attempting token exchange', {
      redirectUri,
      hasCode: !!code,
    });

    // Exchange code for tokens
    const tokenResponse = await this.ctx.http.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.ctx.secrets.getSecret('GOOGLE_CLIENT_ID'),
        client_secret: this.ctx.secrets.getSecret('GOOGLE_CLIENT_SECRET'),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      this.ctx.logger.error('Failed to exchange OAuth code:', errorData);
      throw new HttpsError(
        'internal',
        `Failed to exchange authorization code: ${errorData.error_description || errorData.error}`
      );
    }

    const tokens = await tokenResponse.json();

    // Fetch user's Gmail email address
    const userInfoResponse = await this.ctx.http.fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      throw new HttpsError('internal', 'Failed to fetch user info from Google');
    }

    const userInfo = await userInfoResponse.json();

    // Store tokens in bot's Firestore document
    await this.ctx.firestore.updateBot(userId, botId, {
      oauthConnections: {
        gmail: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
          email: userInfo.email,
          scope: tokens.scope,
          connectedAt: this.ctx.getCurrentTime().toISOString(),
        },
      },
    } as any);

    this.ctx.logger.info(`Gmail connected for bot ${botId} (user ${userId}): ${userInfo.email}`);

    return {
      success: true,
      email: userInfo.email,
    };
  }
}
