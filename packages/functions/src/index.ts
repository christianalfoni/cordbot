import {onCall, HttpsError} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {defineSecret} from "firebase-functions/params";

initializeApp();
export const db = getFirestore();

// Define secrets (stored in Google Cloud Secret Manager)
const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");

/**
 * Exchange Google OAuth code for tokens and store in bot's profile
 */
export const exchangeGmailToken = onCall(
  { secrets: [googleClientId, googleClientSecret] },
  async (request) => {
  // Verify the user is authenticated
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'User must be authenticated to exchange Gmail token'
    );
  }

  const { code, userId, botId, redirectUri } = request.data;

  if (!code || !userId || !botId || !redirectUri) {
    throw new HttpsError(
      'invalid-argument',
      'code, userId, botId, and redirectUri are required'
    );
  }

  // Verify userId matches authenticated user
  if (request.auth.uid !== userId) {
    throw new HttpsError(
      'permission-denied',
      'User can only exchange tokens for their own account'
    );
  }

  try {
    logger.info('Attempting token exchange', {
      redirectUri,
      hasCode: !!code,
      hasClientId: !!googleClientId.value(),
      hasClientSecret: !!googleClientSecret.value(),
    });

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: googleClientId.value(),
        client_secret: googleClientSecret.value(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      logger.error('Failed to exchange OAuth code:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorData,
        redirectUri,
      });
      throw new HttpsError(
        'internal',
        `Failed to exchange authorization code: ${errorData.error_description || errorData.error}`
      );
    }

    const tokens = await tokenResponse.json();

    // Fetch user's Gmail email address
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      throw new HttpsError(
        'internal',
        'Failed to fetch user info from Google'
      );
    }

    const userInfo = await userInfoResponse.json();

    // Store tokens in bot's Firestore document
    const botRef = db.collection('users').doc(userId).collection('bots').doc(botId);
    await botRef.update({
      'oauthConnections.gmail': {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
        email: userInfo.email,
        scope: tokens.scope,
        connectedAt: new Date().toISOString(),
      },
    });

    logger.info(`Gmail connected for bot ${botId} (user ${userId}): ${userInfo.email}`);

    return {
      success: true,
      email: userInfo.email,
    };
  } catch (error) {
    logger.error('Error exchanging Gmail token:', error);
    throw new HttpsError(
      'internal',
      'An error occurred while connecting Gmail'
    );
  }
  }
);

/**
 * Get bot manifest with bot's tool configuration and tokens
 * Authenticated via bot auth token in request data
 * Returns per-bot OAuth connections and tools configuration
 */
export const getBotManifest = onCall(async (request) => {
  const { botToken } = request.data;

  if (!botToken) {
    throw new HttpsError(
      'invalid-argument',
      'botToken is required'
    );
  }

  try {
    // Query bot documents across all users using collection group query
    const botsSnapshot = await db.collectionGroup('bots')
      .where('discordBotToken', '==', botToken)
      .limit(1)
      .get();

    if (botsSnapshot.empty) {
      logger.warn('No bot found with provided auth token');
      return {
        error: 'Invalid bot token',
      };
    }

    const botDoc = botsSnapshot.docs[0];
    const botData = botDoc.data();
    const botId = botDoc.id;

    // Extract user ID from document path (format: users/{userId}/bots/{botId})
    const userId = botDoc.ref.parent.parent?.id;

    // Get per-bot toolsConfig and oauthConnections
    // e.g., { gmail: ['send_email', 'list_messages'] }
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

    logger.info(`Manifest generated for bot ${botId} (user ${userId}): ${toolCount} tools configured`);

    return {
      userId,
      botId,
      toolsConfig,
      tokens,
      memoryContextSize: botData.memoryContextSize || 10000, // Default 10k tokens
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error generating bot manifest:', error);
    throw new HttpsError(
      'internal',
      'An error occurred while generating manifest'
    );
  }
});

/**
 * Refresh an expired OAuth token for a specific category
 * Authenticated via bot auth token in request data
 * Updates per-bot OAuth connections
 */
export const refreshToken = onCall(
  { secrets: [googleClientId, googleClientSecret] },
  async (request) => {
    const { botToken, category } = request.data;

    if (!botToken || !category) {
      throw new HttpsError(
        'invalid-argument',
        'botToken and category are required'
      );
    }

    try {
      // Query bot documents across all users using collection group query
      const botsSnapshot = await db.collectionGroup('bots')
        .where('discordBotToken', '==', botToken)
        .limit(1)
        .get();

      if (botsSnapshot.empty) {
        logger.warn('No bot found with provided Discord bot token');
        throw new HttpsError(
          'not-found',
          'Invalid bot token'
        );
      }

      const botDoc = botsSnapshot.docs[0];
      const botData = botDoc.data();
      const botId = botDoc.id;

      // Extract user ID from document path
      const userId = botDoc.ref.parent.parent?.id;

      // Handle token refresh based on category
      if (category === 'gmail') {
        const gmailConnection = botData.oauthConnections?.gmail;

        if (!gmailConnection) {
          throw new HttpsError(
            'not-found',
            'Gmail not connected for this bot'
          );
        }

        if (!gmailConnection.refreshToken) {
          throw new HttpsError(
            'failed-precondition',
            'No refresh token available for Gmail'
          );
        }

        logger.info(`Refreshing Gmail token for bot ${botId} (user ${userId})`);

        // Use refresh token to get new access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            refresh_token: gmailConnection.refreshToken,
            client_id: googleClientId.value(),
            client_secret: googleClientSecret.value(),
            grant_type: 'refresh_token',
          }),
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          logger.error('Failed to refresh Gmail token:', {
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
        const newExpiresAt = Date.now() + (tokens.expires_in * 1000);
        await botDoc.ref.update({
          'oauthConnections.gmail.accessToken': tokens.access_token,
          'oauthConnections.gmail.expiresAt': newExpiresAt,
        });

        logger.info(`Gmail token refreshed for bot ${botId}, expires at ${new Date(newExpiresAt).toISOString()}`);

        return {
          accessToken: tokens.access_token,
          expiresAt: newExpiresAt,
        };
      } else {
        throw new HttpsError(
          'invalid-argument',
          `Unknown token category: ${category}`
        );
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error('Error refreshing token:', error);
      throw new HttpsError(
        'internal',
        'An error occurred while refreshing token'
      );
    }
  }
);

// Export Fly.io hosting functions
export {
  applyForHostingBeta,
  createHostedBot,
  getHostedBotStatus,
  getHostedBotLogs,
  restartHostedBot,
  deployHostedBot,
  deprovisionHostedBot,
  provisionGuild,
} from './fly-hosting.js';

// Export Discord OAuth handlers
export { handleDiscordOAuth } from './discord-oauth.js';
export { processDiscordOAuth } from './process-oauth.js';

// Export Firestore triggers
export { onGuildCreated } from './guild-triggers.js';
