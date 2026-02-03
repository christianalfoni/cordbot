/**
 * Fly.io Hosting Service - Manage Fly.io deployments for bots
 *
 * Pure business logic for Fly.io operations.
 * No direct Firebase or external API imports.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext, Bot } from '../context.js';

// Fly.io configuration
const FLY_API_BASE = 'https://api.machines.dev/v1';
const FLY_ORG = 'cordbot';
const DEFAULT_IMAGE = 'registry-1.docker.io/christianalfoni/cordbot-agent';
const DEFAULT_VERSION = 'latest';

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

export class FlyHostingService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Helper to make authenticated requests to Fly.io API
   */
  private async flyRequest(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${FLY_API_BASE}${path}`;
    const token = this.ctx.secrets.getSecret('FLY_API_TOKEN');

    const response = await this.ctx.http.fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const responseText = await response.text();
    let data;

    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (e) {
      this.ctx.logger.error('Failed to parse Fly.io response:', responseText);
      throw new Error('Invalid response from Fly.io API');
    }

    if (!response.ok) {
      this.ctx.logger.error('Fly.io API error:', {
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
   */
  private generateAppName(userId: string, botId: string): string {
    const userPrefix = userId.substring(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
    const botPrefix = botId.substring(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `cordbot-${userPrefix}-${botPrefix}`;
  }

  /**
   * Generate a volume name from user ID and bot ID
   */
  private generateVolumeName(userId: string, botId: string): string {
    const userPrefix = userId.substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '');
    const botPrefix = botId.substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `cb_${userPrefix}_${botPrefix}`;
  }

  /**
   * Apply for hosting beta access
   */
  async applyForHostingBeta(params: { userId: string }): Promise<{ success: true; message: string }> {
    const { userId } = params;

    await this.ctx.firestore.updateUser(userId, {
      hostingBetaRequested: true,
      hostingBetaRequestedAt: this.ctx.getCurrentTime().toISOString(),
    });

    this.ctx.logger.info(`User ${userId} applied for hosting beta`);

    return {
      success: true,
      message: "Beta access requested. You'll be notified when approved.",
    };
  }

  /**
   * Create or provision a hosted bot
   */
  async createHostedBot(params: {
    userId: string;
    botId?: string;
    botName?: string;
    mode?: 'personal' | 'shared';
    discordBotToken?: string;
    discordGuildId?: string;
    anthropicApiKey: string;
    memoryContextSize?: number;
    region?: string;
    version?: string;
  }): Promise<{ success: true; botId: string; bot: any }> {
    const {
      userId,
      botId: existingBotId,
      botName,
      mode,
      discordBotToken: providedDiscordBotToken,
      discordGuildId: providedDiscordGuildId,
      anthropicApiKey,
      memoryContextSize = 10000,
      region = 'sjc',
      version = DEFAULT_VERSION,
    } = params;

    // Validate memory context size
    if (memoryContextSize < 1000 || memoryContextSize > 100000) {
      throw new HttpsError('invalid-argument', 'memoryContextSize must be between 1000 and 100000');
    }

    // Check if user is approved for beta
    const userData = await this.ctx.firestore.getUser(userId);

    if (!userData?.hostingBetaApproved) {
      throw new HttpsError('permission-denied', 'User is not approved for hosting beta');
    }

    let botId: string;
    let finalBotName: string;
    let finalMode: 'personal' | 'shared';
    let discordBotToken: string;
    let discordGuildId: string;

    if (existingBotId) {
      // Update existing bot
      const existingBot = await this.ctx.firestore.getBot(userId, existingBotId);
      if (!existingBot) {
        throw new HttpsError('not-found', 'Bot not found');
      }

      botId = existingBotId;
      finalBotName = existingBot.botName;
      finalMode = existingBot.mode;
      discordBotToken = providedDiscordBotToken || existingBot.discordBotToken;
      discordGuildId = providedDiscordGuildId || existingBot.discordGuildId;

      if (!discordBotToken || !discordGuildId) {
        throw new HttpsError(
          'invalid-argument',
          'Bot is missing Discord credentials. Please complete bot setup first.'
        );
      }
    } else {
      // Create new bot
      if (!botName || !mode) {
        throw new HttpsError('invalid-argument', 'botName and mode are required for new bots');
      }

      if (!providedDiscordBotToken || !providedDiscordGuildId || !anthropicApiKey) {
        throw new HttpsError(
          'invalid-argument',
          'discordBotToken, discordGuildId, and anthropicApiKey are required for new bots'
        );
      }

      if (mode !== 'personal' && mode !== 'shared') {
        throw new HttpsError('invalid-argument', 'mode must be "personal" or "shared"');
      }

      // Check bot limit
      const bots = await this.ctx.firestore.queryBots(userId);
      if (bots.length >= 10) {
        throw new HttpsError('resource-exhausted', 'Maximum of 10 bots per user reached');
      }

      botId = crypto.randomUUID();
      finalBotName = botName;
      finalMode = mode;
      discordBotToken = providedDiscordBotToken;
      discordGuildId = providedDiscordGuildId;
    }

    // Validate anthropicApiKey is provided
    if (!anthropicApiKey) {
      throw new HttpsError('invalid-argument', 'anthropicApiKey is required');
    }

    // Validate Discord token and fetch bot username
    this.ctx.logger.info(`Validating Discord token for bot ${botId}`);
    const botInfo = await this.validateDiscordToken(discordBotToken);

    const appName = this.generateAppName(userId, botId);
    const volumeName = this.generateVolumeName(userId, botId);

    this.ctx.logger.info(`Provisioning hosted bot for user ${userId}`, {
      botId,
      botName: finalBotName,
      mode: finalMode,
      appName,
      region,
      version,
    });

    // Create Fly.io resources
    await this.createFlyApp(appName);
    const volumeResponse = await this.createFlyVolume(appName, volumeName, region);
    const machineResponse = await this.createFlyMachine(appName, {
      volumeId: volumeResponse.id,
      region,
      version,
      discordBotToken,
      discordGuildId,
      anthropicApiKey,
      botMode: finalMode,
      botId,
      botUsername: botInfo.username,
      memoryContextSize,
    });

    // Update Firestore with provisioning info
    const botUpdate: Partial<Bot> = {
      botName: finalBotName,
      botDiscordUsername: botInfo.username,
      mode: finalMode,
      appName,
      machineId: machineResponse.id,
      volumeId: volumeResponse.id,
      region,
      status: 'provisioning',
      version,
      provisionedAt: this.ctx.getCurrentTime().toISOString(),
      discordBotToken,
      discordGuildId,
      memoryContextSize,
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    };

    if (!existingBotId) {
      await this.ctx.firestore.createBot(userId, botId, {
        ...botUpdate,
        oauthConnections: {},
        toolsConfig: {},
        createdAt: this.ctx.getCurrentTime().toISOString(),
      } as Bot);
    } else {
      await this.ctx.firestore.updateBot(userId, botId, botUpdate);
    }

    this.ctx.logger.info(`Successfully provisioned hosted bot for user ${userId}`, {
      botId,
      appName,
      machineId: machineResponse.id,
    });

    // Start polling machine status
    this.pollMachineStatusAndUpdateBot(userId, botId, appName, machineResponse.id).catch((err) => {
      this.ctx.logger.error(`Failed to poll machine status for bot ${botId}:`, err);
    });

    return {
      success: true,
      botId,
      bot: { id: botId, ...botUpdate },
    };
  }

  /**
   * Validate Discord token and fetch bot info
   */
  private async validateDiscordToken(token: string): Promise<{ username: string }> {
    const response = await this.ctx.http.fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!response.ok) {
      throw new HttpsError('invalid-argument', 'Invalid Discord bot token. Please check and try again.');
    }

    const botInfo = await response.json();
    this.ctx.logger.info(`Bot username: ${botInfo.username}`);
    return botInfo;
  }

  /**
   * Create Fly.io app
   */
  private async createFlyApp(appName: string): Promise<void> {
    this.ctx.logger.info(`Creating Fly.io app: ${appName}`);
    await this.flyRequest('/apps', {
      method: 'POST',
      body: JSON.stringify({
        app_name: appName,
        org_slug: FLY_ORG,
      }),
    });
  }

  /**
   * Create Fly.io volume
   */
  private async createFlyVolume(appName: string, volumeName: string, region: string): Promise<{ id: string }> {
    this.ctx.logger.info(`Creating volume: ${volumeName}`);
    return await this.flyRequest(`/apps/${appName}/volumes`, {
      method: 'POST',
      body: JSON.stringify({
        name: volumeName,
        region,
        size_gb: 1,
      }),
    });
  }

  /**
   * Create Fly.io machine
   */
  private async createFlyMachine(
    appName: string,
    config: {
      volumeId: string;
      region: string;
      version: string;
      discordBotToken: string;
      discordGuildId: string;
      anthropicApiKey: string;
      botMode: string;
      botId: string;
      botUsername: string;
      memoryContextSize: number;
    }
  ): Promise<{ id: string }> {
    this.ctx.logger.info(`Creating machine in region ${config.region}`);

    const machineConfig: FlyMachineConfig = {
      image: `${DEFAULT_IMAGE}:${config.version}`,
      guest: {
        cpu_kind: 'shared',
        cpus: 1,
        memory_mb: 1024,
      },
      env: {
        DISCORD_BOT_TOKEN: config.discordBotToken,
        DISCORD_GUILD_ID: config.discordGuildId,
        ANTHROPIC_API_KEY: config.anthropicApiKey,
        BOT_MODE: config.botMode,
        BOT_ID: config.botId,
        DISCORD_BOT_USERNAME: config.botUsername,
        MEMORY_CONTEXT_SIZE: config.memoryContextSize.toString(),
      },
      mounts: [
        {
          volume: config.volumeId,
          path: '/workspace',
        },
      ],
    };

    return await this.flyRequest(`/apps/${appName}/machines`, {
      method: 'POST',
      body: JSON.stringify({
        name: `${appName}-main`,
        config: machineConfig,
        region: config.region,
      }),
    });
  }

  /**
   * Poll machine status and update bot status
   */
  private async pollMachineStatusAndUpdateBot(
    userId: string,
    botId: string,
    appName: string,
    machineId: string
  ): Promise<void> {
    const maxAttempts = 60;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        const machine = await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {
          method: 'GET',
        });

        this.ctx.logger.info(`Machine ${machineId} status: ${machine.state}`, {
          attempt: attempt + 1,
          botId,
        });

        if (machine.state === 'started') {
          await this.ctx.firestore.updateBot(userId, botId, {
            status: 'active',
            updatedAt: this.ctx.getCurrentTime().toISOString(),
          });
          this.ctx.logger.info(`Bot/Guild ${botId} status updated to active`);
          return;
        }

        if (machine.state === 'stopped' || machine.state === 'failed') {
          this.ctx.logger.error(`Machine ${machineId} in error state: ${machine.state}`);
          await this.ctx.firestore.updateBot(userId, botId, {
            status: 'error',
            error: `Machine failed to start (state: ${machine.state})`,
            updatedAt: this.ctx.getCurrentTime().toISOString(),
          });
          return;
        }
      } catch (error) {
        this.ctx.logger.error(`Error polling machine status (attempt ${attempt + 1}):`, error);
      }
    }

    // Timeout
    this.ctx.logger.error(`Bot ${botId} did not start within timeout (5 minutes)`);
    await this.ctx.firestore.updateBot(userId, botId, {
      status: 'error',
      errorMessage: 'Machine did not start within 5 minutes. Check logs for details.',
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    });
  }

  /**
   * Get hosted bot status from Fly.io
   */
  async getHostedBotStatus(params: {
    userId: string;
    botId: string;
  }): Promise<{
    status: string;
    state: string;
    region: string;
    createdAt: string;
    updatedAt: string;
    events: any[];
  }> {
    const { userId, botId } = params;

    const bot = await this.ctx.firestore.getBot(userId, botId);
    if (!bot) {
      throw new HttpsError('not-found', 'Bot not found');
    }

    const { appName, machineId } = bot;

    if (!appName || !machineId) {
      throw new HttpsError('invalid-argument', 'Bot is not provisioned');
    }

    const machine = await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {});

    const status =
      machine.state === 'started'
        ? 'running'
        : machine.state === 'stopped'
        ? 'stopped'
        : machine.state === 'starting'
        ? 'provisioning'
        : 'pending';

    // Update Firestore if status changed
    if (status !== bot.status) {
      await this.ctx.firestore.updateBot(userId, botId, { status: status as any });
    }

    return {
      status,
      state: machine.state,
      region: machine.region,
      createdAt: machine.created_at,
      updatedAt: machine.updated_at,
      events: machine.events?.slice(-5) || [],
    };
  }

  /**
   * Get hosted bot logs
   */
  async getHostedBotLogs(params: {
    userId: string;
    botId: string;
  }): Promise<{ message: string; cliCommand: string; machineCommand: string }> {
    const { userId, botId } = params;

    const bot = await this.ctx.firestore.getBot(userId, botId);
    if (!bot) {
      throw new HttpsError('not-found', 'Bot not found');
    }

    const { appName, machineId } = bot;

    if (!appName || !machineId) {
      throw new HttpsError('invalid-argument', 'Bot is not provisioned');
    }

    return {
      message: 'Log streaming is not yet implemented in the dashboard.',
      cliCommand: `flyctl logs -a ${appName}`,
      machineCommand: `flyctl machine logs ${machineId} -a ${appName}`,
    };
  }

  /**
   * Restart hosted bot machine
   */
  async restartHostedBot(params: { userId: string; botId: string }): Promise<{ success: true; message: string }> {
    const { userId, botId } = params;

    const bot = await this.ctx.firestore.getBot(userId, botId);
    if (!bot) {
      throw new HttpsError('not-found', 'Bot not found');
    }

    const { appName, machineId } = bot;

    if (!appName || !machineId) {
      throw new HttpsError('invalid-argument', 'Bot is not provisioned');
    }

    this.ctx.logger.info(`Restarting machine ${machineId} for user ${userId}`);

    // Stop the machine
    await this.flyRequest(`/apps/${appName}/machines/${machineId}/stop`, { method: 'POST' });

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Start the machine
    await this.flyRequest(`/apps/${appName}/machines/${machineId}/start`, { method: 'POST' });

    // Update Firestore
    await this.ctx.firestore.updateBot(userId, botId, {
      lastRestartedAt: this.ctx.getCurrentTime().toISOString(),
      status: 'provisioning',
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    });

    this.ctx.logger.info(`Successfully restarted machine ${machineId}`);

    // Poll machine status in background
    this.pollMachineStatusAndUpdateBot(userId, botId, appName, machineId).catch((err) => {
      this.ctx.logger.error(`Failed to poll machine status for bot ${botId}:`, err);
    });

    return {
      success: true,
      message: 'Bot is restarting',
    };
  }

  /**
   * Deploy new version to hosted bot
   */
  async deployHostedBot(params: {
    userId: string;
    botId: string;
    version: string;
  }): Promise<{ success: true; version: string }> {
    const { userId, botId, version } = params;

    const bot = await this.ctx.firestore.getBot(userId, botId);
    if (!bot) {
      throw new HttpsError('not-found', 'Bot not found');
    }

    const { appName, machineId } = bot;

    if (!appName || !machineId) {
      throw new HttpsError('invalid-argument', 'Bot is not provisioned');
    }

    this.ctx.logger.info(`Deploying version ${version} for user ${userId}`);

    // Update status to provisioning
    await this.ctx.firestore.updateBot(userId, botId, {
      status: 'provisioning',
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    });

    // Get current machine config
    const machine = await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {});

    // Update machine with new image
    const updatedConfig = {
      ...machine.config,
      image: `${DEFAULT_IMAGE}:${version}`,
    };

    await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {
      method: 'POST',
      body: JSON.stringify({
        config: updatedConfig,
      }),
    });

    // Update Firestore with version info
    await this.ctx.firestore.updateBot(userId, botId, {
      version,
      lastDeployedAt: this.ctx.getCurrentTime().toISOString(),
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    });

    this.ctx.logger.info(`Successfully deployed version ${version}`);

    // Poll machine status in background
    this.pollMachineStatusAndUpdateBot(userId, botId, appName, machineId).catch((err) => {
      this.ctx.logger.error(`Failed to poll machine status for bot ${botId}:`, err);
    });

    return {
      success: true,
      version,
    };
  }

  /**
   * Deprovision (delete) hosted bot
   */
  async deprovisionHostedBot(params: { userId: string; botId: string }): Promise<{ success: true; message: string }> {
    const { userId, botId } = params;

    const bot = await this.ctx.firestore.getBot(userId, botId);
    if (!bot) {
      throw new HttpsError('not-found', 'Bot not found');
    }

    const { appName, machineId, volumeId } = bot;

    if (!appName || !machineId) {
      throw new HttpsError('invalid-argument', 'Bot is not provisioned');
    }

    this.ctx.logger.info(`Deprovisioning hosted bot for user ${userId}`, {
      appName,
      machineId,
      botId,
    });

    // Delete machine
    try {
      await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {
        method: 'DELETE',
        body: JSON.stringify({ force: true }),
      });
    } catch (error) {
      this.ctx.logger.warn(`Failed to delete machine ${machineId}:`, error);
    }

    // Delete volume
    if (volumeId) {
      try {
        await this.flyRequest(`/apps/${appName}/volumes/${volumeId}`, { method: 'DELETE' });
      } catch (error) {
        this.ctx.logger.warn(`Failed to delete volume ${volumeId}:`, error);
      }
    }

    // Delete app
    try {
      await this.flyRequest(`/apps/${appName}`, { method: 'DELETE' });
    } catch (error) {
      this.ctx.logger.warn(`Failed to delete app ${appName}:`, error);
    }

    // Remove from Firestore
    await this.ctx.firestore.deleteBot(userId, botId);

    this.ctx.logger.info(`Successfully deprovisioned hosted bot for user ${userId}`);

    return {
      success: true,
      message: 'Hosted bot deleted successfully',
    };
  }
}
