/**
 * Guild Provisioning Service - Provision guilds on Fly.io with shared credentials
 *
 * Pure business logic for guild provisioning operations.
 * No direct Firebase or external API imports.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext } from '../context.js';

// Fly.io configuration
const FLY_API_BASE = 'https://api.machines.dev/v1';
const FLY_ORG = 'cordbot';
const DEFAULT_IMAGE = 'registry-1.docker.io/christianalfoni/cordbot-agent';
const DEFAULT_VERSION = 'latest';

interface FlyMachineConfig {
  image: string;
  env?: Record<string, string>;
  guest?: {
    cpu_kind: string;
    cpus: number;
    memory_mb: number;
  };
  mounts?: Array<{
    volume: string;
    path: string;
  }>;
  init?: {
    cwd?: string;
  };
}

export class GuildProvisioningService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Verify that a user owns a guild and return the guild data
   */
  private async verifyGuildOwnership(userId: string, guildId: string) {
    const guild = await this.ctx.firestore.getGuild(guildId);
    if (!guild) {
      throw new HttpsError('not-found', 'Guild not found');
    }

    if (guild.userId !== userId) {
      throw new HttpsError('permission-denied', 'You do not own this guild');
    }

    return guild;
  }

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
   * Provision a free tier guild (checks slots, reserves slot, creates deployment)
   */
  async provisionFreeTierGuild(params: { userId: string; guildId: string }): Promise<{
    appName: string;
    machineId: string;
  }> {
    const { guildId } = params;

    // CRITICAL: Update status to 'provisioning' FIRST to prevent duplicate provisioning
    // if the trigger fires multiple times
    await this.ctx.firestore.updateGuild(guildId, {
      status: 'provisioning',
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    });
    this.ctx.logger.info(`Set guild ${guildId} status to provisioning`);

    // Check if guild deployment already exists
    const existingDeployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (existingDeployment) {
      throw new HttpsError('already-exists', 'Guild is already provisioned');
    }

    // Get free tier config
    const freeTierConfig = await this.ctx.firestore.getFreeTierConfig();
    if (!freeTierConfig) {
      throw new HttpsError('failed-precondition', 'Free tier not configured');
    }

    // Check if slots available
    if (freeTierConfig.usedSlots >= freeTierConfig.maxSlots) {
      throw new HttpsError('resource-exhausted', 'No free tier slots available');
    }

    // Reserve slot
    await this.ctx.firestore.incrementFreeTierSlots(1);
    this.ctx.logger.info(`Reserved free tier slot for guild ${guildId}`, {
      usedSlots: freeTierConfig.usedSlots + 1,
      maxSlots: freeTierConfig.maxSlots,
    });

    try {
      // Provision the guild (this now creates the deployment doc for all tiers)
      // Status already updated above, so skip redundant update
      const provisionResult = await this.provisionGuild({ guildId, skipStatusUpdate: true });
      return provisionResult;
    } catch (error) {
      // If provisioning fails, decrement the slot (best effort)
      this.ctx.logger.error(`Failed to provision free tier guild ${guildId}, attempting to release slot`, error);
      try {
        await this.ctx.firestore.incrementFreeTierSlots(-1);
      } catch (decrementError) {
        this.ctx.logger.error(`Failed to decrement slot after failed provisioning:`, decrementError);
      }
      throw error;
    }
  }

  /**
   * Provision a guild on Fly.io with shared Discord bot token and Anthropic API key
   */
  async provisionGuild(params: { guildId: string; skipStatusUpdate?: boolean }): Promise<{
    appName: string;
    machineId: string;
    volumeId: string;
    region: string;
  }> {
    const { guildId, skipStatusUpdate = false } = params;

    // Check if guild document exists
    const guildData = await this.ctx.firestore.getGuild(guildId);
    if (!guildData) {
      throw new Error('Guild not found');
    }

    // Check if already provisioned
    if (guildData.status === 'active') {
      throw new Error('Guild is already provisioned');
    }

    // For paid tiers, verify subscription is active before provisioning
    if (guildData.tier && guildData.tier !== 'free') {
      if (!guildData.subscriptionId) {
        this.ctx.logger.error(`Paid tier guild ${guildId} has no subscription ID`, {
          tier: guildData.tier,
        });
        throw new Error('Paid tier guild must have an active subscription');
      }

      const subscription = await this.ctx.firestore.getSubscription(guildData.subscriptionId);
      if (!subscription || subscription.status !== 'active') {
        this.ctx.logger.error(`Paid tier guild ${guildId} subscription not active`, {
          subscriptionId: guildData.subscriptionId,
          subscriptionStatus: subscription?.status,
        });
        throw new Error('Subscription must be active to provision guild');
      }

      this.ctx.logger.info(`Verified active subscription for paid tier guild ${guildId}`, {
        subscriptionId: guildData.subscriptionId,
        tier: guildData.tier,
      });
    }

    // Generate Fly.io app name: cordbot-guild-{first12ofguildid}
    const guildPrefix = guildId.substring(0, 12).toLowerCase().replace(/[^a-z0-9]/g, '');
    const appName = `cordbot-guild-${guildPrefix}`;

    this.ctx.logger.info(`Provisioning guild ${guildId}`, {
      guildName: guildData.guildName,
      appName,
    });

    // Update status to provisioning and set lastDeployedAt (unless already done by caller)
    if (!skipStatusUpdate) {
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'provisioning',
        lastDeployedAt: this.ctx.getCurrentTime().toISOString(),
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });
    }

    // Step 1: Create Fly.io app
    this.ctx.logger.info(`Creating Fly.io app: ${appName}`);
    await this.flyRequest('/apps', {
      method: 'POST',
      body: JSON.stringify({
        app_name: appName,
        org_slug: FLY_ORG,
      }),
    });

    // Step 2: Create volume
    const volumeName = `cordbot_vol_${guildId.substring(0, 8)}`;
    this.ctx.logger.info(`Creating volume: ${volumeName}`);
    const volumeResponse = await this.flyRequest(`/apps/${appName}/volumes`, {
      method: 'POST',
      body: JSON.stringify({
        name: volumeName,
        region: 'sjc',
        size_gb: 1,
      }),
    });

    // Step 3: Create machine with shared credentials
    this.ctx.logger.info(`Creating machine for guild ${guildId}`);
    const machineConfig: FlyMachineConfig = {
      image: `${DEFAULT_IMAGE}:${DEFAULT_VERSION}`,
      guest: {
        cpu_kind: 'shared',
        cpus: 1,
        memory_mb: 2048,
      },
      env: {
        HOME: '/workspace',
        DISCORD_BOT_TOKEN: this.ctx.secrets.getSecret('SHARED_DISCORD_BOT_TOKEN'),
        DISCORD_GUILD_ID: guildId,
        ANTHROPIC_API_KEY: this.ctx.secrets.getSecret('SHARED_ANTHROPIC_API_KEY'),
        BOT_ID: guildId,
        MEMORY_CONTEXT_SIZE: String(guildData.memoryContextSize),
        SERVICE_URL: 'https://us-central1-claudebot-34c42.cloudfunctions.net',
      },
      mounts: [
        {
          volume: volumeResponse.id,
          path: '/workspace',
        },
      ],
      init: {
        cwd: '/workspace',
      },
    };

    const machineResponse = await this.flyRequest(`/apps/${appName}/machines`, {
      method: 'POST',
      body: JSON.stringify({
        name: `${appName}-main`,
        config: machineConfig,
        region: 'sjc',
      }),
    });

    // Step 4: Fly.io resources created successfully
    this.ctx.logger.info(`Successfully provisioned Fly.io resources for guild ${guildId}`, {
      appName,
      machineId: machineResponse.id,
      volumeId: volumeResponse.id,
    });

    // Step 5: Create guild deployment document (for all tiers)
    this.ctx.logger.info(`ABOUT TO CREATE DEPLOYMENT DOC for guild ${guildId}`);
    const tier = guildData.tier || 'free';
    this.ctx.logger.info(`Guild tier is: ${tier}`);
    const deploymentType = tier as 'free' | 'starter' | 'pro' | 'business';

    // Determine query limits based on tier
    let queriesTotal: number;
    if (tier === 'free') {
      const freeTierConfig = await this.ctx.firestore.getFreeTierConfig();
      queriesTotal = freeTierConfig?.queriesPerSlot || 25;
    } else if (tier === 'starter') {
      queriesTotal = 500;
    } else if (tier === 'pro') {
      queriesTotal = 1200;
    } else {
      queriesTotal = 3000; // business
    }

    const now = this.ctx.getCurrentTime().toISOString();
    await this.ctx.firestore.createGuildDeployment(guildId, {
      guildId,
      deploymentType,
      queriesTotal,
      queriesRemaining: queriesTotal,
      queriesUsed: 0,
      totalCost: 0,
      costThisPeriod: 0,
      queryTypes: { discord_message: 0, scheduled_task: 0 },
      costByType: { discord_message: 0, scheduled_task: 0 },
      lastQueryAt: now,
      createdAt: now,
      updatedAt: now,
      // Fly.io infrastructure details
      appName,
      machineId: machineResponse.id,
      volumeId: volumeResponse.id,
      region: 'sjc',
    });

    this.ctx.logger.info(`Created guild deployment document for ${tier} tier guild ${guildId}`);

    // Poll machine status in background
    this.pollGuildMachineStatus(guildId, appName, machineResponse.id).catch((err) => {
      this.ctx.logger.error(`Failed to poll machine status for guild ${guildId}:`, err);
    });

    return {
      appName,
      machineId: machineResponse.id,
      volumeId: volumeResponse.id,
      region: 'sjc',
    };
  }

  /**
   * Poll Fly.io machine status for a guild and update status when ready
   */
  private async pollGuildMachineStatus(guildId: string, appName: string, machineId: string): Promise<void> {
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

        this.ctx.logger.info(`Guild ${guildId} machine status: ${machine.state}`, {
          attempt: attempt + 1,
        });

        if (machine.state === 'started') {
          await this.ctx.firestore.updateGuild(guildId, {
            status: 'active',
            updatedAt: this.ctx.getCurrentTime().toISOString(),
          });

          this.ctx.logger.info(`Guild ${guildId} is now active`);
          return;
        }

        if (machine.state === 'stopped' || machine.state === 'failed') {
          this.ctx.logger.error(`Guild ${guildId} machine in error state: ${machine.state}`);
          await this.ctx.firestore.updateGuild(guildId, {
            status: 'error',
            errorMessage: `Machine failed to start (state: ${machine.state})`,
            updatedAt: this.ctx.getCurrentTime().toISOString(),
          });
          return;
        }
      } catch (error) {
        this.ctx.logger.error(`Error polling machine status for guild ${guildId} (attempt ${attempt + 1}):`, error);
      }
    }

    // Timeout
    this.ctx.logger.error(`Guild ${guildId} did not start within timeout`);
    await this.ctx.firestore.updateGuild(guildId, {
      status: 'error',
      errorMessage: 'Machine did not start within 5 minutes',
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    });
  }

  /**
   * Deprovision (delete) a guild deployment
   */
  async deprovisionGuild(params: { userId: string; guildId: string }): Promise<{ success: true; message: string }> {
    const { userId, guildId } = params;

    // Verify ownership
    const guild = await this.verifyGuildOwnership(userId, guildId);

    // Check if already deprovisioning
    if (guild.status === 'deprovisioning') {
      throw new HttpsError('failed-precondition', 'Guild is already being deprovisioned');
    }

    // Set status to deprovisioning immediately
    await this.ctx.firestore.updateGuild(guildId, {
      status: 'deprovisioning',
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    });

    // Cancel subscription if this is a paid tier with an active subscription
    if (guild.subscriptionId) {
      this.ctx.logger.info(`Canceling subscription for guild ${guildId}`, {
        subscriptionId: guild.subscriptionId,
      });

      try {
        // Cancel immediately (not at period end) since we're deleting the bot
        await this.ctx.stripe.cancelSubscriptionImmediately(guild.subscriptionId);
        this.ctx.logger.info(`Successfully canceled subscription ${guild.subscriptionId}`);
      } catch (error) {
        this.ctx.logger.error(`Failed to cancel subscription ${guild.subscriptionId}:`, error);
        // Don't throw - continue with guild deletion even if subscription cancellation fails
      }
    }

    // Get deployment info (contains Fly.io details)
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);

    if (deployment) {
      const { appName } = deployment;

      this.ctx.logger.info(`Deprovisioning guild ${guildId}`, {
        appName,
        deploymentType: deployment.deploymentType,
      });

      // Delete Fly.io app (this automatically removes machine, volume, and all resources)
      try {
        await this.flyRequest(`/apps/${appName}`, {
          method: 'DELETE',
        });
        this.ctx.logger.info(`Successfully deleted Fly.io app ${appName} and all its resources`);
      } catch (error) {
        this.ctx.logger.error(`Failed to delete Fly.io app ${appName}:`, error);
        // Don't throw - still delete the Firestore documents even if Fly.io fails
      }

      // Delete guild deployment document from Firestore
      await this.ctx.firestore.deleteGuildDeployment(guildId);
      this.ctx.logger.info(`Deleted guild deployment document for guild ${guildId}`);
    } else {
      this.ctx.logger.warn(`No deployment found for guild ${guildId}`);
    }

    // Delete guild document from Firestore (this will remove it from the UI)
    await this.ctx.firestore.deleteGuild(guildId);

    this.ctx.logger.info(`Successfully deprovisioned and deleted guild ${guildId}`);

    // Note: We do NOT decrement free tier slots - they only increment
    // This is by design to track total signups over time

    return {
      success: true,
      message: 'Guild successfully deleted',
    };
  }

  /**
   * Restart a guild's machine
   */
  async restartGuild(params: { userId: string; guildId: string }): Promise<{ success: true; message: string }> {
    const { userId, guildId } = params;

    // Verify ownership
    await this.verifyGuildOwnership(userId, guildId);

    // Get deployment info
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (!deployment) {
      throw new HttpsError('not-found', 'Guild deployment not found');
    }

    const { appName, machineId } = deployment;

    this.ctx.logger.info(`Restarting guild ${guildId}`, { appName, machineId });

    try {
      // Set status to provisioning
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'provisioning',
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });

      // Restart machine
      await this.flyRequest(`/apps/${appName}/machines/${machineId}/restart`, {
        method: 'POST',
      });

      // Set status back to active
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'active',
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });

      this.ctx.logger.info(`Successfully restarted guild ${guildId}`);

      return {
        success: true,
        message: 'Guild restarted successfully',
      };
    } catch (error) {
      // Set status to error if restart fails
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'error',
        errorMessage: `Failed to restart guild: ${error instanceof Error ? error.message : 'Unknown error'}`,
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Repair a guild's machine by restoring environment variables
   * Useful for fixing machines that lost their env vars during updates
   */
  async repairGuild(params: { userId: string; guildId: string }): Promise<{ success: true; message: string }> {
    const { userId, guildId } = params;

    // Verify ownership
    await this.verifyGuildOwnership(userId, guildId);

    // Get guild data
    const guildData = await this.ctx.firestore.getGuild(guildId);
    if (!guildData) {
      throw new HttpsError('not-found', 'Guild not found');
    }

    // Get deployment info
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (!deployment) {
      throw new HttpsError('not-found', 'Guild deployment not found');
    }

    const { appName, machineId } = deployment;

    this.ctx.logger.info(`Repairing guild ${guildId}`, { appName, machineId });

    try {
      // Set status to provisioning
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'provisioning',
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });

      // Get current machine config
      const currentMachine = await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {
        method: 'GET',
      });

      // Ensure mounts are present - if missing, add volume mount
      const mounts = currentMachine.config?.mounts || [];
      if (mounts.length === 0 && deployment.volumeId) {
        this.ctx.logger.info(`Adding missing volume mount for guild ${guildId}`, {
          volumeId: deployment.volumeId,
        });
        mounts.push({
          volume: deployment.volumeId,
          path: '/workspace',
        });
      }

      // Restore environment variables and ensure mounts
      await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {
        method: 'POST',
        body: JSON.stringify({
          config: {
            ...currentMachine.config,
            env: {
              HOME: '/workspace',
              DISCORD_BOT_TOKEN: this.ctx.secrets.getSecret('SHARED_DISCORD_BOT_TOKEN'),
              DISCORD_GUILD_ID: guildId,
              ANTHROPIC_API_KEY: this.ctx.secrets.getSecret('SHARED_ANTHROPIC_API_KEY'),
              BOT_ID: guildId,
              MEMORY_CONTEXT_SIZE: String(guildData.memoryContextSize),
              SERVICE_URL: 'https://us-central1-claudebot-34c42.cloudfunctions.net',
            },
            mounts,
            init: {
              cwd: '/workspace',
            },
          },
        }),
      });

      // Restart the machine to apply changes
      await this.flyRequest(`/apps/${appName}/machines/${machineId}/restart`, {
        method: 'POST',
      });

      // Set status back to active
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'active',
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });

      this.ctx.logger.info(`Successfully repaired guild ${guildId}`);

      return {
        success: true,
        message: 'Guild repaired and restarted successfully',
      };
    } catch (error) {
      // Set status to error if repair fails
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'error',
        errorMessage: `Failed to repair guild: ${error instanceof Error ? error.message : 'Unknown error'}`,
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Deploy an update to a guild's machine
   */
  async deployGuildUpdate(params: {
    userId: string;
    guildId: string;
    version: string;
  }): Promise<{ success: true; version: string }> {
    const { userId, guildId, version } = params;

    // Verify ownership
    await this.verifyGuildOwnership(userId, guildId);

    // Get deployment info
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (!deployment) {
      throw new HttpsError('not-found', 'Guild deployment not found');
    }

    const { appName, machineId } = deployment;

    this.ctx.logger.info(`Deploying update to guild ${guildId}`, {
      appName,
      machineId,
      version,
    });

    try {
      // Set status to provisioning
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'provisioning',
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });

      // Get guild data for memory context size
      const guildData = await this.ctx.firestore.getGuild(guildId);
      if (!guildData) {
        throw new HttpsError('not-found', 'Guild not found');
      }

      // Get current machine config to preserve non-env settings (mounts, guest config, etc)
      const currentMachine = await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {
        method: 'GET',
      });

      this.ctx.logger.info('Current machine config', {
        hasMounts: !!currentMachine.config?.mounts,
        mountsCount: currentMachine.config?.mounts?.length || 0,
      });

      // Ensure mounts are present - if missing, add volume mount
      const mounts = currentMachine.config?.mounts || [];
      if (mounts.length === 0 && deployment.volumeId) {
        this.ctx.logger.info(`Adding missing volume mount during update for guild ${guildId}`, {
          volumeId: deployment.volumeId,
        });
        mounts.push({
          volume: deployment.volumeId,
          path: '/workspace',
        });
      }

      // Update machine with new image, ensure env vars are set, and update guest config
      const updateConfig = {
        ...currentMachine.config,
        image: `${DEFAULT_IMAGE}:${version}`,
        guest: {
          cpu_kind: 'shared',
          cpus: 1,
          memory_mb: 2048,
        },
        env: {
          HOME: '/workspace',
          DISCORD_BOT_TOKEN: this.ctx.secrets.getSecret('SHARED_DISCORD_BOT_TOKEN'),
          DISCORD_GUILD_ID: guildId,
          ANTHROPIC_API_KEY: this.ctx.secrets.getSecret('SHARED_ANTHROPIC_API_KEY'),
          BOT_ID: guildId,
          MEMORY_CONTEXT_SIZE: String(guildData.memoryContextSize),
          SERVICE_URL: 'https://us-central1-claudebot-34c42.cloudfunctions.net',
        },
        mounts,
        init: {
          cwd: '/workspace',
        },
      };

      this.ctx.logger.info('Update config', {
        hasMounts: !!updateConfig.mounts,
        mountsCount: updateConfig.mounts?.length || 0,
      });

      await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {
        method: 'POST',
        body: JSON.stringify({
          config: updateConfig,
        }),
      });

      // Set status back to active
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'active',
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });

      this.ctx.logger.info(`Successfully deployed update to guild ${guildId}`);

      return {
        success: true,
        version,
      };
    } catch (error) {
      // Set status to error if update fails
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'error',
        errorMessage: `Failed to deploy update: ${error instanceof Error ? error.message : 'Unknown error'}`,
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Get guild machine status
   */
  async getGuildStatus(params: { userId: string; guildId: string }): Promise<{
    status: string;
    state: string;
    region: string;
    createdAt: string;
    updatedAt: string;
  }> {
    const { userId, guildId } = params;

    // Verify ownership
    await this.verifyGuildOwnership(userId, guildId);

    // Get deployment info
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (!deployment) {
      throw new HttpsError('not-found', 'Guild deployment not found');
    }

    const { appName, machineId } = deployment;

    // Get machine status from Fly.io
    const machine = await this.flyRequest(`/apps/${appName}/machines/${machineId}`, {
      method: 'GET',
    });

    return {
      status: machine.state === 'started' ? 'running' : machine.state,
      state: machine.state,
      region: machine.region,
      createdAt: machine.created_at,
      updatedAt: machine.updated_at,
    };
  }

  /**
   * Get guild machine logs
   */
  async getGuildLogs(params: { userId: string; guildId: string }): Promise<{ logs: string }> {
    const { userId, guildId } = params;

    // Verify ownership
    await this.verifyGuildOwnership(userId, guildId);

    // Get deployment info
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (!deployment) {
      throw new HttpsError('not-found', 'Guild deployment not found');
    }

    const { appName, machineId } = deployment;

    // Note: Fly.io API doesn't have a direct logs endpoint for machines
    // You would typically use `flyctl logs` CLI command
    // For now, return a placeholder
    this.ctx.logger.info(`Fetching logs for guild ${guildId}`, { appName, machineId });

    return {
      logs: `Use 'flyctl logs -a ${appName}' to view logs`,
    };
  }
}
