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
 * Validate a user's bot token and fetch bot information
 * This is used when a user provides their own bot token
 */
export const validateBotToken = onCall(async (request) => {
  // Verify the user is authenticated
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'User must be authenticated to validate bot token'
    );
  }

  const { botToken } = request.data;

  if (!botToken) {
    throw new HttpsError(
      'invalid-argument',
      'botToken is required'
    );
  }

  try {
    // Validate token by fetching bot user info
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });

    if (!userResponse.ok) {
      if (userResponse.status === 401) {
        return {
          valid: false,
          error: 'Invalid bot token. Please check and try again.',
        };
      } else {
        return {
          valid: false,
          error: 'Failed to validate bot token. Please try again.',
        };
      }
    }

    const botInfo = await userResponse.json();

    // Get guilds the bot is in
    const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });

    let guilds: any[] = [];
    if (guildsResponse.ok) {
      guilds = await guildsResponse.json();
    }

    return {
      valid: true,
      bot: {
        id: botInfo.id,
        username: botInfo.username,
        discriminator: botInfo.discriminator,
        avatar: botInfo.avatar,
      },
      guilds: guilds.map(guild => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: guild.owner || false,
        permissions: guild.permissions,
      })),
    };
  } catch (error) {
    logger.error('Error validating bot token:', error);
    return {
      valid: false,
      error: 'An error occurred while validating the token.',
    };
  }
});

/**
 * Exchange Google OAuth code for tokens and store in user's profile
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

  const { code, userId, redirectUri } = request.data;

  if (!code || !userId || !redirectUri) {
    throw new HttpsError(
      'invalid-argument',
      'code, userId, and redirectUri are required'
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

    // Store tokens in Firestore
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      'oauthConnections.gmail': {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
        email: userInfo.email,
        scope: tokens.scope,
        connectedAt: new Date().toISOString(),
      },
    });

    logger.info(`Gmail connected for user ${userId}: ${userInfo.email}`);

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
 * Get bot manifest with user's tool configuration and tokens
 * Authenticated via bot token in request data
 * Simply returns the user's data - bot decides what to load
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
    // Query Firestore for user with matching botToken
    const usersSnapshot = await db.collection('users')
      .where('botToken', '==', botToken)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      logger.warn('No user found with provided bot token');
      return {
        error: 'Invalid bot token',
      };
    }

    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;

    // Get toolsConfig directly from user data (new format)
    // e.g., { gmail: ['send_email', 'list_messages'] }
    const toolsConfig = userData.toolsConfig || {};

    // Build tokens object from oauthConnections
    const tokens: { gmail?: { accessToken: string; expiresAt: number } } = {};
    const oauthConnections = userData.oauthConnections || {};

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

    logger.info(`Manifest generated for user ${userId}: ${toolCount} tools configured`);

    return {
      userId,
      toolsConfig,
      tokens,
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
 * Authenticated via bot token in request data
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
      // Query Firestore for user with matching botToken
      const usersSnapshot = await db.collection('users')
        .where('botToken', '==', botToken)
        .limit(1)
        .get();

      if (usersSnapshot.empty) {
        logger.warn('No user found with provided bot token');
        throw new HttpsError(
          'not-found',
          'Invalid bot token'
        );
      }

      const userDoc = usersSnapshot.docs[0];
      const userData = userDoc.data();
      const userId = userDoc.id;

      // Handle token refresh based on category
      if (category === 'gmail') {
        const gmailConnection = userData.oauthConnections?.gmail;

        if (!gmailConnection) {
          throw new HttpsError(
            'not-found',
            'Gmail not connected for this user'
          );
        }

        if (!gmailConnection.refreshToken) {
          throw new HttpsError(
            'failed-precondition',
            'No refresh token available for Gmail'
          );
        }

        logger.info(`Refreshing Gmail token for user ${userId}`);

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
            userId,
          });
          throw new HttpsError(
            'internal',
            `Failed to refresh token: ${errorData.error_description || errorData.error}`
          );
        }

        const tokens = await tokenResponse.json();

        // Update Firestore with new access token
        const newExpiresAt = Date.now() + (tokens.expires_in * 1000);
        await userDoc.ref.update({
          'oauthConnections.gmail.accessToken': tokens.access_token,
          'oauthConnections.gmail.expiresAt': newExpiresAt,
        });

        logger.info(`Gmail token refreshed for user ${userId}, expires at ${new Date(newExpiresAt).toISOString()}`);

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
  provisionHostedBot,
  getHostedBotStatus,
  getHostedBotLogs,
  restartHostedBot,
  deployHostedBot,
  deprovisionHostedBot,
} from './fly-hosting.js';
