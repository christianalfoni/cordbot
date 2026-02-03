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
}

export class GuildProvisioningService {
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
   * Provision a guild on Fly.io with shared Discord bot token and Anthropic API key
   */
  async provisionGuild(params: { guildId: string }): Promise<{ appName: string; machineId: string }> {
    const { guildId } = params;

    // Check if guild document exists
    const guildData = await this.ctx.firestore.getGuild(guildId);
    if (!guildData) {
      throw new Error('Guild not found');
    }

    // Check if already provisioned
    if (guildData.status === 'active' && guildData.appName) {
      throw new Error('Guild is already provisioned');
    }

    // Generate Fly.io app name: cordbot-guild-{first12ofguildid}
    const guildPrefix = guildId.substring(0, 12).toLowerCase().replace(/[^a-z0-9]/g, '');
    const appName = `cordbot-guild-${guildPrefix}`;

    this.ctx.logger.info(`Provisioning guild ${guildId}`, {
      guildName: guildData.guildName,
      appName,
    });

    // Update status to provisioning
    await this.ctx.firestore.updateGuild(guildId, {
      status: 'provisioning',
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    });

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
        memory_mb: 1024,
      },
      env: {
        DISCORD_BOT_TOKEN: this.ctx.secrets.getSecret('SHARED_DISCORD_BOT_TOKEN'),
        DISCORD_GUILD_ID: guildId,
        ANTHROPIC_API_KEY: this.ctx.secrets.getSecret('SHARED_ANTHROPIC_API_KEY'),
        BOT_MODE: 'shared',
        BOT_ID: guildId,
        MEMORY_CONTEXT_SIZE: (guildData.memoryContextSize || 10000).toString(),
      },
      mounts: [
        {
          volume: volumeResponse.id,
          path: '/workspace',
        },
      ],
    };

    const machineResponse = await this.flyRequest(`/apps/${appName}/machines`, {
      method: 'POST',
      body: JSON.stringify({
        name: `${appName}-main`,
        config: machineConfig,
        region: 'sjc',
      }),
    });

    // Step 4: Update guild document with Fly.io details
    await this.ctx.firestore.updateGuild(guildId, {
      appName,
      machineId: machineResponse.id,
      volumeId: volumeResponse.id,
      region: 'sjc',
      status: 'provisioning',
      provisionedAt: this.ctx.getCurrentTime().toISOString(),
      updatedAt: this.ctx.getCurrentTime().toISOString(),
    });

    this.ctx.logger.info(`Successfully provisioned guild ${guildId}`, {
      appName,
      machineId: machineResponse.id,
    });

    // Poll machine status in background
    this.pollGuildMachineStatus(guildId, appName, machineResponse.id).catch((err) => {
      this.ctx.logger.error(`Failed to poll machine status for guild ${guildId}:`, err);
    });

    return {
      appName,
      machineId: machineResponse.id,
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
}
