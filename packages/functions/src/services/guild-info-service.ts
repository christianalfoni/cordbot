/**
 * Guild Info Service
 *
 * Provides user-facing guild information, joining data from guilds and guildDeployments.
 * Verifies user ownership before returning data.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext } from '../context.js';

export class GuildInfoService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Get deployment info for a specific guild
   */
  async getGuildDeploymentInfo(params: { userId: string; guildId: string }): Promise<{
    guildId: string;
    guildName: string;
    status: string;
    deploymentType: string;
    queriesRemaining: number;
    queriesTotal: number;
    queriesUsed: number;
    createdAt: string;
    lastQueryAt: string;
    suspendedReason?: string;
    suspendedAt?: string;
    periodStart: string;
    periodEnd: string | null;
    memoryContextSize: number;
    lastDeployedAt: string;
  }> {
    const { userId, guildId } = params;

    // Get guild data
    const guild = await this.ctx.firestore.getGuild(guildId);
    if (!guild) {
      throw new HttpsError('not-found', 'Guild not found');
    }

    // Verify ownership
    if (guild.userId !== userId) {
      throw new HttpsError('permission-denied', 'You do not have access to this guild');
    }

    // Get deployment data
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (!deployment) {
      throw new HttpsError('not-found', 'Deployment data not found');
    }

    return {
      guildId,
      guildName: guild.guildName,
      status: guild.status,
      deploymentType: deployment.deploymentType,
      queriesRemaining: Math.max(0, deployment.queriesTotal - deployment.queriesUsed),
      queriesTotal: deployment.queriesTotal,
      queriesUsed: deployment.queriesUsed,
      createdAt: guild.createdAt,
      lastQueryAt: deployment.lastQueryAt,
      suspendedReason: guild.suspendedReason,
      suspendedAt: guild.suspendedAt,
      periodStart: guild.periodStart,
      periodEnd: guild.periodEnd,
      memoryContextSize: guild.memoryContextSize,
      lastDeployedAt: guild.lastDeployedAt,
    };
  }

  /**
   * List all guilds for a user
   */
  async listUserGuilds(params: { userId: string }): Promise<{
    guilds: Array<{
      guildId: string;
      guildName: string;
      guildIcon: string | null;
      status: string;
      deploymentType: string;
      queriesRemaining: number;
      queriesTotal: number;
      queriesUsed: number;
      createdAt: string;
      lastQueryAt: string;
      suspendedReason?: string;
    }>;
  }> {
    const { userId } = params;

    // Query all guilds for this user
    const guilds = await this.ctx.firestore.queryGuildsByUser(userId);

    // Fetch deployment data for each guild
    const guildInfos = await Promise.all(
      guilds.map(async ({ id: guildId, data: guild }) => {
        // Get deployment data
        const deployment = await this.ctx.firestore.getGuildDeployment(guildId);

        // If no deployment data, skip this guild
        if (!deployment) {
          this.ctx.logger.warn(`No deployment data found for guild ${guildId}`);
          return null;
        }

        return {
          guildId,
          guildName: guild.guildName,
          guildIcon: guild.guildIcon,
          status: guild.status,
          deploymentType: deployment.deploymentType,
          queriesRemaining: Math.max(0, deployment.queriesTotal - deployment.queriesUsed),
          queriesTotal: deployment.queriesTotal,
          queriesUsed: deployment.queriesUsed,
          createdAt: guild.createdAt,
          lastQueryAt: deployment.lastQueryAt,
          suspendedReason: guild.suspendedReason,
        };
      })
    );

    // Filter out nulls
    const validGuildInfos = guildInfos.filter((info) => info !== null) as Array<{
      guildId: string;
      guildName: string;
      guildIcon: string | null;
      status: string;
      deploymentType: string;
      queriesRemaining: number;
      queriesTotal: number;
      queriesUsed: number;
      createdAt: string;
      lastQueryAt: string;
      suspendedReason?: string;
    }>;

    return { guilds: validGuildInfos };
  }
}
