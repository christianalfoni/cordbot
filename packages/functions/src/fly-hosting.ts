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
 * Generate a unique app name for a user
 * Format: cordbot-{first8ofuid}-{timestamp}
 * Apps allow dashes and up to 63 chars
 */
function generateAppName(userId: string): string {
  const userPrefix = userId.substring(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
  const timestamp = Date.now().toString(36);
  return `cordbot-${userPrefix}-${timestamp}`;
}

/**
 * Generate a volume name from user ID
 * Format: cb_{first6ofuid}_{timestamp}
 * Volumes only allow underscores/alphanumeric and max 30 chars
 */
function generateVolumeName(userId: string): string {
  const userPrefix = userId.substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '');
  const timestamp = Date.now().toString(36);
  return `cb_${userPrefix}_${timestamp}`;
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
 * Provision a new hosted bot for a user
 */
export const provisionHostedBot = onCall(
  { secrets: [flyApiToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;
    const {
      anthropicApiKey,
      region = "sjc",
      version = DEFAULT_VERSION,
    } = request.data;

    if (!anthropicApiKey) {
      throw new HttpsError("invalid-argument", "anthropicApiKey is required");
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

      if (userData.hostedBot) {
        throw new HttpsError("already-exists", "User already has a hosted bot");
      }

      const token = flyApiToken.value();
      const appName = generateAppName(userId);
      const volumeName = generateVolumeName(userId);

      logger.info(`Provisioning hosted bot for user ${userId}`, {
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

      // Step 3: Get bot token and guild ID from user data
      const botToken = userData.botToken;
      const guildId = userData.guildId;

      if (!botToken) {
        throw new HttpsError(
          "failed-precondition",
          "User does not have a Discord bot token configured"
        );
      }

      if (!guildId) {
        throw new HttpsError(
          "failed-precondition",
          "User does not have a Discord guild ID configured"
        );
      }

      // Step 4: Create machine with configuration
      logger.info(`Creating machine in region ${region}`);
      const machineConfig: FlyMachineConfig = {
        image: `${DEFAULT_IMAGE}:${version}`,
        guest: {
          cpu_kind: "shared",
          cpus: 1,
          memory_mb: 1024,
        },
        env: {
          DISCORD_BOT_TOKEN: botToken,
          DISCORD_GUILD_ID: guildId,
          ANTHROPIC_API_KEY: anthropicApiKey,
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

      // Step 5: Update Firestore with hosted bot info
      const hostedBot = {
        appName,
        machineId: machineResponse.id,
        volumeId: volumeResponse.id,
        region,
        status: "provisioning" as const,
        version,
        provisionedAt: new Date().toISOString(),
      };

      await db.collection("users").doc(userId).update({
        hostedBot,
      });

      logger.info(`Successfully provisioned hosted bot for user ${userId}`, {
        appName,
        machineId: machineResponse.id,
      });

      return {
        success: true,
        hostedBot,
      };
    } catch (error) {
      logger.error("Error provisioning hosted bot:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to provision hosted bot: ${
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

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.hostedBot) {
        throw new HttpsError("not-found", "User does not have a hosted bot");
      }

      const { appName, machineId } = userData.hostedBot;
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
      if (status !== userData.hostedBot.status) {
        await db.collection("users").doc(userId).update({
          "hostedBot.status": status,
        });
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

  try {
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.hostedBot) {
      throw new HttpsError("not-found", "User does not have a hosted bot");
    }

    const { appName, machineId } = userData.hostedBot;

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

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.hostedBot) {
        throw new HttpsError("not-found", "User does not have a hosted bot");
      }

      const { appName, machineId } = userData.hostedBot;
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
      await db.collection("users").doc(userId).update({
        "hostedBot.lastRestartedAt": new Date().toISOString(),
        "hostedBot.status": "provisioning",
      });

      logger.info(`Successfully restarted machine ${machineId}`);

      return {
        success: true,
        message: "Bot is restarting",
      };
    } catch (error) {
      logger.error("Error restarting hosted bot:", error);

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
    const { version } = request.data;

    if (!version) {
      throw new HttpsError("invalid-argument", "version is required");
    }

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.hostedBot) {
        throw new HttpsError("not-found", "User does not have a hosted bot");
      }

      const { appName, machineId } = userData.hostedBot;
      const token = flyApiToken.value();

      logger.info(`Deploying version ${version} for user ${userId}`);

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

      // Update Firestore
      await db.collection("users").doc(userId).update({
        "hostedBot.version": version,
        "hostedBot.lastDeployedAt": new Date().toISOString(),
      });

      logger.info(`Successfully deployed version ${version}`);

      return {
        success: true,
        version,
      };
    } catch (error) {
      logger.error("Error deploying hosted bot:", error);

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
 * Redeploy hosted bot by deleting and recreating the machine
 * Keeps the app and volume, only replaces the machine with latest image
 */
export const redeployHostedBot = onCall(
  { secrets: [flyApiToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const userId = request.auth.uid;

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.hostedBot) {
        throw new HttpsError("not-found", "User does not have a hosted bot");
      }

      const { appName, machineId, volumeId, region, version } = userData.hostedBot;
      const token = flyApiToken.value();

      logger.info(`Redeploying hosted bot for user ${userId}`, {
        appName,
        oldMachineId: machineId,
      });

      // Step 1: Get bot token and guild ID from user data
      const botToken = userData.botToken;
      const guildId = userData.guildId;

      if (!botToken || !guildId) {
        throw new HttpsError(
          "failed-precondition",
          "User does not have bot token or guild ID configured"
        );
      }

      // Step 2: Get Anthropic API key from current machine config
      let anthropicApiKey = "";
      try {
        const machine = await flyRequest(
          `/apps/${appName}/machines/${machineId}`,
          {},
          token
        );
        anthropicApiKey = machine.config?.env?.ANTHROPIC_API_KEY || "";
      } catch (error) {
        logger.warn(`Could not fetch old machine config: ${error}`);
      }

      if (!anthropicApiKey) {
        throw new HttpsError(
          "failed-precondition",
          "Could not retrieve Anthropic API key from existing machine"
        );
      }

      // Step 3: Force delete the old machine
      logger.info(`Force deleting machine ${machineId}`);
      try {
        await flyRequest(
          `/apps/${appName}/machines/${machineId}`,
          {
            method: "DELETE",
            body: JSON.stringify({ force: true }),
          },
          token
        );
      } catch (error) {
        logger.warn(`Failed to delete old machine: ${error}`);
        // Continue anyway - machine might already be gone
      }

      // Step 4: Create new machine with same config
      logger.info(`Creating new machine in region ${region}`);
      const machineConfig: FlyMachineConfig = {
        image: `${DEFAULT_IMAGE}:${version || DEFAULT_VERSION}`,
        guest: {
          cpu_kind: "shared",
          cpus: 1,
          memory_mb: 1024,
        },
        env: {
          DISCORD_BOT_TOKEN: botToken,
          DISCORD_GUILD_ID: guildId,
          ANTHROPIC_API_KEY: anthropicApiKey,
        },
        mounts: [
          {
            volume: volumeId,
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

      // Step 5: Update Firestore with new machine info
      await db.collection("users").doc(userId).update({
        "hostedBot.machineId": machineResponse.id,
        "hostedBot.status": "provisioning",
        "hostedBot.lastDeployedAt": new Date().toISOString(),
      });

      logger.info(`Successfully redeployed hosted bot for user ${userId}`, {
        appName,
        newMachineId: machineResponse.id,
      });

      return {
        success: true,
        machineId: machineResponse.id,
        message: "Bot redeployed successfully",
      };
    } catch (error) {
      logger.error("Error redeploying hosted bot:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Failed to redeploy hosted bot: ${
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

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData?.hostedBot) {
        throw new HttpsError("not-found", "User does not have a hosted bot");
      }

      const { appName, machineId, volumeId } = userData.hostedBot;
      const token = flyApiToken.value();

      logger.info(`Deprovisioning hosted bot for user ${userId}`, {
        appName,
        machineId,
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
      await db.collection("users").doc(userId).update({
        hostedBot: null,
      });

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
