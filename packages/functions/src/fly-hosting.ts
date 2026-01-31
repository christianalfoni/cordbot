import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { db } from "./index.js";

// Define Fly.io API secret
const flyApiToken = defineSecret("FLY_API_TOKEN");

// Fly.io configuration
const FLY_API_BASE = "https://api.machines.dev/v1";
const FLY_ORG = "cordbot"; // Update with your Fly.io organization slug
const DEFAULT_IMAGE = "registry-1.docker.io/christianalfoni/cordbot-agent";
const DEFAULT_VERSION = "latest";

interface FlyMachineConfig {
  image: string;
  env?: Record<string, string>;
  services?: Array<{
    ports: Array<{ port: number; handlers?: string[] }>;
    protocol: string;
    internal_port: number;
  }>;
  guest?: {
    cpu_kind: string;
    cpus: number;
    memory_mb: number;
  };
  mounts?: Array<{
    volume: string;
    path: string;
  }>;
}

/**
 * Helper to make authenticated requests to Fly.io API
 */
async function flyRequest(
  path: string,
  options: RequestInit = {},
  token: string
): Promise<any> {
  const url = `${FLY_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const responseText = await response.text();
  let data;

  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (e) {
    logger.error("Failed to parse Fly.io response:", responseText);
    throw new Error("Invalid response from Fly.io API");
  }

  if (!response.ok) {
    logger.error("Fly.io API error:", {
      status: response.status,
      statusText: response.statusText,
      data,
      path,
    });
    throw new Error(data?.error || `Fly.io API error: ${response.statusText}`);
  }

  return data;
}

/**
 * Generate a unique app name for a user and bot
 * Format: cordbot-{first8ofuid}-{first8ofbotid}
 * Apps allow dashes and up to 63 chars
 */
function generateAppName(userId: string, botId: string): string {
  const userPrefix = userId.substring(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
  const botPrefix = botId.substring(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `cordbot-${userPrefix}-${botPrefix}`;
}

/**
 * Generate a volume name from user ID and bot ID
 * Format: cb_{first6ofuid}_{first6ofbotid}
 * Volumes only allow underscores/alphanumeric and max 30 chars
 */
function generateVolumeName(userId: string, botId: string): string {
  const userPrefix = userId.substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '');
  const botPrefix = botId.substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `cb_${userPrefix}_${botPrefix}`;
}

/**
 * Helper: Get a bot document from subcollection
 */
async function getBotDoc(userId: string, botId: string): Promise<any> {
  const botDoc = await db
    .collection("users")
    .doc(userId)
    .collection("bots")
    .doc(botId)
    .get();

  if (!botDoc.exists) {
    return null;
  }

  return { id: botDoc.id, ...botDoc.data() };
}

/**
 * Helper: Update a bot document in subcollection
 */
async function updateBotDoc(
  userId: string,
  botId: string,
  updates: any
): Promise<void> {
  await db
    .collection("users")
    .doc(userId)
    .collection("bots")
    .doc(botId)
    .update(updates);
}

/**
 * Helper: Delete a bot document from subcollection
 */
async function deleteBotDoc(userId: string, botId: string): Promise<void> {
  await db
    .collection("users")
    .doc(userId)
    .collection("bots")
    .doc(botId)
    .delete();
}

/**
 * Apply for hosting beta access
 */
export const applyForHostingBeta = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;

  try {
    await db.collection("users").doc(userId).update({
      hostingBetaRequested: true,
      hostingBetaRequestedAt: new Date().toISOString(),
    });

    logger.info(`User ${userId} applied for hosting beta`);

    return {
      success: true,
      message: "Beta access requested. You'll be notified when approved.",
    };
  } catch (error) {
    logger.error("Error applying for hosting beta:", error);
    throw new HttpsError("internal", "Failed to submit beta application");
  }
});

/**
 * Create a bot document without provisioning (for onboarding flow)
 */
export const createBotDocument = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const { botName, mode = "personal" } = request.data;

  if (!botName) {
    throw new HttpsError("invalid-argument", "botName is required");
  }

  if (mode !== "personal" && mode !== "shared") {
    throw new HttpsError("invalid-argument", 'mode must be "personal" or "shared"');
  }

  try {
    // Check if user is approved for beta
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.hostingBetaApproved) {
      throw new HttpsError(
        "permission-denied",
        "User is not approved for hosting beta"
      );
    }

    // Check bot limit (max 10 per user)
    const botsSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("bots")
      .get();

    if (botsSnapshot.size >= 10) {
      throw new HttpsError(
        "resource-exhausted",
        "Maximum of 10 bots per user reached"
      );
    }

    // Generate unique bot ID and auth token
    const botId = crypto.randomUUID();
    const authToken = crypto.randomUUID(); // Separate token for API authentication

    // Create bot document with unconfigured status
    const newBot = {
      botName,
      mode,
      status: "unconfigured" as const,
      authToken, // Token for bot to authenticate to getBotManifest, refreshToken, etc.
      memoryContextSize: 10000,
      oauthConnections: {}, // Per-bot OAuth connections (gmail, etc.)
      toolsConfig: {}, // Per-bot tools configuration
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db
      .collection("users")
      .doc(userId)
      .collection("bots")
      .doc(botId)
      .set(newBot);

    logger.info(`Created bot document ${botId} for user ${userId}`);

    return {
      success: true,
      botId,
      bot: { id: botId, ...newBot },
    };
  } catch (error) {
    logger.error("Error creating bot document:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      `Failed to create bot: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
});

/**
 * List all hosted bots for a user
 */
export const listHostedBots = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;

  try {
    const botsSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("bots")
      .get();

    const bots = botsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      bots,
      canCreateMore: bots.length < 10,
    };
  } catch (error) {
    logger.error("Error listing hosted bots:", error);
    throw new HttpsError("internal", "Failed to list hosted bots");
  }
});

/**
 * Update bot with Discord configuration (without provisioning)
 * Used during onboarding to save Discord credentials
 */
export const updateBotDiscordConfig = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const {
    botId,
    discordBotToken,
    discordGuildId,
    discordGuildName,
    discordGuildIcon,
    discordBotUserId,
    botDiscordUsername,
    botDiscordAvatar,
  } = request.data;

  if (!botId || !discordBotToken || !discordGuildId) {
    throw new HttpsError(
      "invalid-argument",
      "botId, discordBotToken, and discordGuildId are required"
    );
  }

  try {
    const bot = await getBotDoc(userId, botId);
    if (!bot) {
      throw new HttpsError("not-found", "Bot not found");
    }

    // Update bot with Discord credentials and change status to 'configured'
    await updateBotDoc(userId, botId, {
      discordBotToken,
      discordGuildId,
      discordGuildName: discordGuildName || null,
      discordGuildIcon: discordGuildIcon || null,
      discordBotUserId: discordBotUserId || null,
      botDiscordUsername: botDiscordUsername || null,
      botDiscordAvatar: botDiscordAvatar || null,
      status: "configured" as const,
      updatedAt: new Date().toISOString(),
    });

    logger.info(`Discord config updated for bot ${botId} (user ${userId})`);

    return {
      success: true,
      message: "Discord configuration saved",
    };
  } catch (error) {
    logger.error("Error updating bot Discord config:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      `Failed to update Discord config: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
});

/**
 * Poll Fly.io machine status and update bot status to "running" when ready
 */
async function pollMachineStatusAndUpdateBot(
  userId: string,
  botId: string,
  appName: string,
  machineId: string,
  token: string
): Promise<void> {
  const maxAttempts = 60; // Poll for up to 5 minutes (60 * 5 seconds)
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Wait before polling (except first attempt)
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      // Get machine status from Fly.io
      const machine = await flyRequest(
        `/apps/${appName}/machines/${machineId}`,
        { method: "GET" },
        token
      );

      logger.info(`Machine ${machineId} status: ${machine.state}`, {
        attempt: attempt + 1,
        botId,
      });

      // Check if machine is running (state: "started")
      if (machine.state === "started") {
        // Update bot status to running
        await db
          .collection("users")
          .doc(userId)
          .collection("bots")
          .doc(botId)
          .update({
            status: "running",
            updatedAt: new Date().toISOString(),
          });

        logger.info(`Bot ${botId} status updated to running`);
        return;
      }

      // Check for error states
      if (machine.state === "stopped" || machine.state === "failed") {
        logger.error(`Machine ${machineId} in error state: ${machine.state}`);
        await db
          .collection("users")
          .doc(userId)
          .collection("bots")
          .doc(botId)
          .update({
            status: "error",
            errorMessage: `Machine failed to start (state: ${machine.state})`,
            updatedAt: new Date().toISOString(),
          });
        return;
      }
    } catch (error) {
      logger.error(
        `Error polling machine status (attempt ${attempt + 1}):`,
        error
      );
      // Continue polling on error (Fly.io API might be temporarily unavailable)
    }
  }

  // If we get here, machine didn't start within timeout
  logger.error(`Bot ${botId} did not start within timeout (5 minutes)`);
  await db
    .collection("users")
    .doc(userId)
    .collection("bots")
    .doc(botId)
    .update({
      status: "error",
      errorMessage: "Machine did not start within 5 minutes. Check logs for details.",
      updatedAt: new Date().toISOString(),
    });
}

/**
 * Provision a hosted bot (creates Fly.io resources and updates bot document)
 * Can be used for new bots or to provision existing unconfigured bots
 */
export const createHostedBot = onCall(
  { secrets: [flyApiToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const {
      botId: existingBotId, // Optional: if provided, update existing bot
      botName,
      mode,
      discordBotToken: providedDiscordBotToken,
      discordGuildId: providedDiscordGuildId,
      anthropicApiKey,
      memoryContextSize = 10000,
      region = "sjc",
      version = DEFAULT_VERSION,
    } = request.data;

    // Validate memory context size
    if (memoryContextSize < 1000 || memoryContextSize > 100000) {
      throw new HttpsError(
        "invalid-argument",
        "memoryContextSize must be between 1000 and 100000"
      );
    }

    try {
      // Check if user is approved for beta
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.hostingBetaApproved) {
        throw new HttpsError(
          "permission-denied",
          "User is not approved for hosting beta"
        );
      }

      let botId: string;
      let authToken: string;
      let finalBotName: string;
      let finalMode: "personal" | "shared";
      let discordBotToken: string;
      let discordGuildId: string;

      if (existingBotId) {
        // Update existing bot document
        const existingBot = await getBotDoc(userId, existingBotId);
        if (!existingBot) {
          throw new HttpsError("not-found", "Bot not found");
        }

        botId = existingBotId;
        authToken = existingBot.authToken || crypto.randomUUID();
        finalBotName = existingBot.botName;
        finalMode = existingBot.mode;
        // Use existing bot's Discord credentials or override if provided
        discordBotToken = providedDiscordBotToken || existingBot.discordBotToken;
        discordGuildId = providedDiscordGuildId || existingBot.discordGuildId;

        if (!discordBotToken || !discordGuildId) {
          throw new HttpsError(
            "invalid-argument",
            "Bot is missing Discord credentials. Please complete bot setup first."
          );
        }
      } else {
        // Create new bot
        if (!botName || !mode) {
          throw new HttpsError(
            "invalid-argument",
            "botName and mode are required for new bots"
          );
        }

        if (!providedDiscordBotToken || !providedDiscordGuildId || !anthropicApiKey) {
          throw new HttpsError(
            "invalid-argument",
            "discordBotToken, discordGuildId, and anthropicApiKey are required for new bots"
          );
        }

        // Validate mode
        if (mode !== "personal" && mode !== "shared") {
          throw new HttpsError(
            "invalid-argument",
            'mode must be "personal" or "shared"'
          );
        }

        // Check bot limit (max 10 per user)
        const botsSnapshot = await db
          .collection("users")
          .doc(userId)
          .collection("bots")
          .get();

        if (botsSnapshot.size >= 10) {
          throw new HttpsError(
            "resource-exhausted",
            "Maximum of 10 bots per user reached"
          );
        }

        botId = crypto.randomUUID();
        authToken = crypto.randomUUID();
        finalBotName = botName;
        finalMode = mode;
        discordBotToken = providedDiscordBotToken;
        discordGuildId = providedDiscordGuildId;
      }

      // Validate anthropicApiKey is provided
      if (!anthropicApiKey) {
        throw new HttpsError(
          "invalid-argument",
          "anthropicApiKey is required"
        );
      }

      const token = flyApiToken.value();

      // Validate Discord token and fetch bot username
      logger.info(`Validating Discord token for bot ${botId}`);
      let botInfo;
      try {
        const response = await fetch("https://discord.com/api/v10/users/@me", {
          headers: { Authorization: `Bot ${discordBotToken}` },
        });

        if (!response.ok) {
          throw new HttpsError(
            "invalid-argument",
            "Invalid Discord bot token. Please check and try again."
          );
        }

        botInfo = await response.json();
        logger.info(`Bot username: ${botInfo.username}`);
      } catch (error) {
        logger.error("Failed to validate Discord token:", error);
        throw new HttpsError(
          "invalid-argument",
          "Failed to validate Discord bot token"
        );
      }

      const appName = generateAppName(userId, botId);
      const volumeName = generateVolumeName(userId, botId);

      logger.info(`Provisioning hosted bot for user ${userId}`, {
        botId,
        botName: finalBotName,
        mode: finalMode,
        appName,
        region,
        version,
      });

      // Step 1: Create the Fly.io app
      logger.info(`Creating Fly.io app: ${appName}`);
      await flyRequest(
        `/apps`,
        {
          method: "POST",
          body: JSON.stringify({
            app_name: appName,
            org_slug: FLY_ORG,
          }),
        },
        token
      );

      // Step 2: Create volume
      logger.info(`Creating volume: ${volumeName}`);
      const volumeResponse = await flyRequest(
        `/apps/${appName}/volumes`,
        {
          method: "POST",
          body: JSON.stringify({
            name: volumeName,
            region,
            size_gb: 1,
          }),
        },
        token
      );

      // Step 3: Create machine with configuration
      logger.info(`Creating machine in region ${region}`);
      const machineConfig: FlyMachineConfig = {
        image: `${DEFAULT_IMAGE}:${version}`,
        guest: {
          cpu_kind: "shared",
          cpus: 1,
          memory_mb: 1024,
        },
        env: {
          DISCORD_BOT_TOKEN: discordBotToken,
          DISCORD_GUILD_ID: discordGuildId,
          ANTHROPIC_API_KEY: anthropicApiKey,
          BOT_MODE: finalMode,
          BOT_ID: botId,
          DISCORD_BOT_USERNAME: botInfo.username,
          MEMORY_CONTEXT_SIZE: memoryContextSize.toString(),
        },
        mounts: [
          {
            volume: volumeResponse.id,
            path: "/workspace",
          },
        ],
      };

      const machineResponse = await flyRequest(
        `/apps/${appName}/machines`,
        {
          method: "POST",
          body: JSON.stringify({
            name: `${appName}-main`,
            config: machineConfig,
            region,
          }),
        },
        token
      );

      // Step 4: Update Firestore with provisioning info
      const botUpdate = {
        botName: finalBotName,
        botDiscordUsername: botInfo.username,
        mode: finalMode,
        authToken, // Token for bot to authenticate to getBotManifest, refreshToken, etc.
        appName,
        machineId: machineResponse.id,
        volumeId: volumeResponse.id,
        region,
        status: "provisioning" as const,
        version,
        provisionedAt: new Date().toISOString(),
        discordBotToken, // Store per-bot token
        discordGuildId, // Store per-bot guild
        memoryContextSize, // Memory context size in tokens
        updatedAt: new Date().toISOString(),
      };

      // Add fields for new bots only
      if (!existingBotId) {
        Object.assign(botUpdate, {
          oauthConnections: {}, // Per-bot OAuth connections (gmail, etc.)
          toolsConfig: {}, // Per-bot tools configuration
          createdAt: new Date().toISOString(),
        });
      }

      await db
        .collection("users")
        .doc(userId)
        .collection("bots")
        .doc(botId)
        .set(botUpdate, { merge: true });

      logger.info(`Successfully provisioned hosted bot for user ${userId}`, {
        botId,
        appName,
        machineId: machineResponse.id,
      });

      // Poll machine status in background and update bot status when running
      // Don't await this - let it run in the background
      pollMachineStatusAndUpdateBot(
        userId,
        botId,
        appName,
        machineResponse.id,
        token
      ).catch((err) => {
        logger.error(`Failed to poll machine status for bot ${botId}:`, err);
      });

      return {
        success: true,
        botId,
        bot: { id: botId, ...botUpdate },
      };
    } catch (error) {
      logger.error("Error creating hosted bot:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to create hosted bot: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
);

/**
 * Get hosted bot status from Fly.io
 */
export const getHostedBotStatus = onCall(
  { secrets: [flyApiToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const { botId } = request.data;

    if (!botId) {
      throw new HttpsError("invalid-argument", "botId is required");
    }

    try {
      const bot = await getBotDoc(userId, botId);
      if (!bot) {
        throw new HttpsError("not-found", "Bot not found");
      }

      const { appName, machineId } = bot;
      const token = flyApiToken.value();

      // Get machine status from Fly.io
      const machine = await flyRequest(
        `/apps/${appName}/machines/${machineId}`,
        {},
        token
      );

      const status =
        machine.state === "started"
          ? "running"
          : machine.state === "stopped"
          ? "stopped"
          : machine.state === "starting"
          ? "provisioning"
          : "pending";

      // Update Firestore if status changed
      if (status !== bot.status) {
        await updateBotDoc(userId, botId, { status });
      }

      return {
        status,
        state: machine.state,
        region: machine.region,
        createdAt: machine.created_at,
        updatedAt: machine.updated_at,
        events: machine.events?.slice(-5) || [], // Last 5 events
      };
    } catch (error) {
      logger.error("Error getting hosted bot status:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError("internal", "Failed to get hosted bot status");
    }
  }
);

/**
 * Get hosted bot logs
 * MVP: Returns CLI command to view logs
 */
export const getHostedBotLogs = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const userId = request.auth.uid;
  const { botId } = request.data;

  if (!botId) {
    throw new HttpsError("invalid-argument", "botId is required");
  }

  try {
    const bot = await getBotDoc(userId, botId);
    if (!bot) {
      throw new HttpsError("not-found", "Bot not found");
    }

    const { appName, machineId } = bot;

    return {
      message: "Log streaming is not yet implemented in the dashboard.",
      cliCommand: `flyctl logs -a ${appName}`,
      machineCommand: `flyctl machine logs ${machineId} -a ${appName}`,
    };
  } catch (error) {
    logger.error("Error getting hosted bot logs:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError("internal", "Failed to get hosted bot logs");
  }
});

/**
 * Restart hosted bot machine
 */
export const restartHostedBot = onCall(
  { secrets: [flyApiToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const { botId } = request.data;

    if (!botId) {
      throw new HttpsError("invalid-argument", "botId is required");
    }

    try {
      const bot = await getBotDoc(userId, botId);
      if (!bot) {
        throw new HttpsError("not-found", "Bot not found");
      }

      const { appName, machineId } = bot;
      const token = flyApiToken.value();

      logger.info(`Restarting machine ${machineId} for user ${userId}`);

      // Stop the machine
      await flyRequest(
        `/apps/${appName}/machines/${machineId}/stop`,
        { method: "POST" },
        token
      );

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Start the machine
      await flyRequest(
        `/apps/${appName}/machines/${machineId}/start`,
        { method: "POST" },
        token
      );

      // Update Firestore
      await updateBotDoc(userId, botId, {
        lastRestartedAt: new Date().toISOString(),
        status: "provisioning" as const,
        updatedAt: new Date().toISOString(),
      });

      logger.info(`Successfully restarted machine ${machineId}`);

      // Poll machine status in background and update bot status when running
      pollMachineStatusAndUpdateBot(
        userId,
        botId,
        appName,
        machineId,
        token
      ).catch((err) => {
        logger.error(`Failed to poll machine status for bot ${botId}:`, err);
      });

      return {
        success: true,
        message: "Bot is restarting",
      };
    } catch (error) {
      logger.error("Error restarting hosted bot:", error);

      // Update status to error if restart fails
      try {
        await updateBotDoc(userId, botId, {
          status: "error" as const,
          errorMessage: `Failed to restart: ${error instanceof Error ? error.message : "Unknown error"}`,
          updatedAt: new Date().toISOString(),
        });
      } catch (updateError) {
        logger.error("Failed to update bot status to error:", updateError);
      }

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to restart hosted bot: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
);

/**
 * Deploy new version to hosted bot
 */
export const deployHostedBot = onCall(
  { secrets: [flyApiToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const { version, botId } = request.data;

    if (!version) {
      throw new HttpsError("invalid-argument", "version is required");
    }

    if (!botId) {
      throw new HttpsError("invalid-argument", "botId is required");
    }

    try {
      const bot = await getBotDoc(userId, botId);
      if (!bot) {
        throw new HttpsError("not-found", "Bot not found");
      }

      const { appName, machineId } = bot;
      const token = flyApiToken.value();

      logger.info(`Deploying version ${version} for user ${userId}`);

      // Immediately update status to provisioning
      await updateBotDoc(userId, botId, {
        status: "provisioning" as const,
        updatedAt: new Date().toISOString(),
      });

      // Get current machine config
      const machine = await flyRequest(
        `/apps/${appName}/machines/${machineId}`,
        {},
        token
      );

      // Update machine with new image
      const updatedConfig = {
        ...machine.config,
        image: `${DEFAULT_IMAGE}:${version}`,
      };

      await flyRequest(
        `/apps/${appName}/machines/${machineId}`,
        {
          method: "POST",
          body: JSON.stringify({
            config: updatedConfig,
          }),
        },
        token
      );

      // Update Firestore with version info
      await updateBotDoc(userId, botId, {
        version,
        lastDeployedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      logger.info(`Successfully deployed version ${version}`);

      // Poll machine status in background and update bot status when running
      pollMachineStatusAndUpdateBot(
        userId,
        botId,
        appName,
        machineId,
        token
      ).catch((err) => {
        logger.error(`Failed to poll machine status for bot ${botId}:`, err);
      });

      return {
        success: true,
        version,
      };
    } catch (error) {
      logger.error("Error deploying hosted bot:", error);

      // Update status to error if deploy fails
      try {
        await updateBotDoc(userId, botId, {
          status: "error" as const,
          errorMessage: `Failed to deploy update: ${error instanceof Error ? error.message : "Unknown error"}`,
          updatedAt: new Date().toISOString(),
        });
      } catch (updateError) {
        logger.error("Failed to update bot status to error:", updateError);
      }

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to deploy update: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
);

/**
 * Deprovision (delete) hosted bot
 */
export const deprovisionHostedBot = onCall(
  { secrets: [flyApiToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const { botId } = request.data;

    if (!botId) {
      throw new HttpsError("invalid-argument", "botId is required");
    }

    try {
      const bot = await getBotDoc(userId, botId);
      if (!bot) {
        throw new HttpsError("not-found", "Bot not found");
      }

      const { appName, machineId, volumeId } = bot;
      const token = flyApiToken.value();

      logger.info(`Deprovisioning hosted bot for user ${userId}`, {
        appName,
        machineId,
        botId,
      });

      // Step 1: Stop and delete machine
      try {
        await flyRequest(
          `/apps/${appName}/machines/${machineId}`,
          { method: "DELETE", body: JSON.stringify({ force: true }) },
          token
        );
      } catch (error) {
        logger.warn(`Failed to delete machine ${machineId}:`, error);
      }

      // Step 2: Delete volume
      if (volumeId) {
        try {
          await flyRequest(
            `/apps/${appName}/volumes/${volumeId}`,
            { method: "DELETE" },
            token
          );
        } catch (error) {
          logger.warn(`Failed to delete volume ${volumeId}:`, error);
        }
      }

      // Step 3: Delete app
      try {
        await flyRequest(`/apps/${appName}`, { method: "DELETE" }, token);
      } catch (error) {
        logger.warn(`Failed to delete app ${appName}:`, error);
      }

      // Step 4: Remove from Firestore
      await deleteBotDoc(userId, botId);

      logger.info(`Successfully deprovisioned hosted bot for user ${userId}`);

      return {
        success: true,
        message: "Hosted bot deleted successfully",
      };
    } catch (error) {
      logger.error("Error deprovisioning hosted bot:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to delete hosted bot: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
);
