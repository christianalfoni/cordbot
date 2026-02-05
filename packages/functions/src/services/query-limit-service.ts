/**
 * Query Limit Service
 *
 * Handles query limit checking, tracking, and enforcement for guild deployments.
 * Automatically suspends guilds when limits are reached and deprovisions free tier.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext } from '../context.js';

export class QueryLimitService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Check if a guild can proceed with a query
   */
  async checkQueryLimit(params: { guildId: string }): Promise<{
    canProceed: boolean;
    blocked: boolean;
    reason?: string;
    deploymentType?: string;
    queriesRemaining?: number;
    totalQueries?: number;
  }> {
    const { guildId } = params;

    // Get guild and deployment data
    const guild = await this.ctx.firestore.getGuild(guildId);
    if (!guild) {
      return {
        canProceed: false,
        blocked: true,
        reason: 'Guild not found',
      };
    }

    // Check guild status
    if (guild.status === 'suspended') {
      return {
        canProceed: false,
        blocked: true,
        reason: guild.suspendedReason || 'Guild is suspended',
      };
    }

    if (guild.status !== 'active') {
      return {
        canProceed: false,
        blocked: true,
        reason: `Guild status is ${guild.status}`,
      };
    }

    // Get deployment data
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (!deployment) {
      return {
        canProceed: false,
        blocked: true,
        reason: 'Deployment data not found',
      };
    }

    // Check if queries remaining
    if (deployment.queriesRemaining <= 0) {
      return {
        canProceed: false,
        blocked: true,
        reason: 'Query limit reached',
        deploymentType: deployment.deploymentType,
        queriesRemaining: 0,
        totalQueries: deployment.queriesTotal,
      };
    }

    return {
      canProceed: true,
      blocked: false,
      deploymentType: deployment.deploymentType,
      queriesRemaining: deployment.queriesRemaining,
      totalQueries: deployment.queriesTotal,
    };
  }

  /**
   * Track query usage and update limits
   */
  async trackQueryLimit(params: {
    guildId: string;
    type: string;
    cost: number;
    success: boolean;
    memoryTokens?: number;
  }): Promise<{
    limitReached: boolean;
    blocked: boolean;
    queriesRemaining: number;
    deploymentType: string;
    shouldDeprovision: boolean;
  }> {
    const { guildId, type, cost, memoryTokens } = params;

    // Use transaction to atomically update deployment
    const result = await this.ctx.firestore.runTransaction(async (transaction) => {
      const deployment = await transaction.getGuildDeployment(guildId);
      if (!deployment) {
        throw new HttpsError('not-found', 'Deployment data not found');
      }

      const now = this.ctx.getCurrentTime().toISOString();

      // Check if this is a non-deducting query (like summarize_query)
      const isNonDeducting = type === 'summarize_query';

      // Calculate new values
      const queriesRemaining = isNonDeducting
        ? deployment.queriesRemaining // Don't reduce for summarization
        : Math.max(0, deployment.queriesRemaining - 1);
      const queriesUsed = isNonDeducting
        ? deployment.queriesUsed // Don't increment for summarization
        : deployment.queriesUsed + 1;
      const totalCost = deployment.totalCost + cost;
      const costThisPeriod = deployment.costThisPeriod + cost;

      // Update query type counters
      const queryTypes: Record<string, number> = { ...(deployment.queryTypes || {}) };
      queryTypes[type] = (queryTypes[type] || 0) + 1;

      // Update cost by type
      const costByType: Record<string, number> = { ...(deployment.costByType || {}) };
      costByType[type] = (costByType[type] || 0) + cost;

      // Prepare update data
      const updateData: any = {
        queriesRemaining,
        queriesUsed,
        totalCost,
        costThisPeriod,
        queryTypes,
        costByType,
        lastQueryAt: now,
        updatedAt: now,
      };

      // Add memory tokens if provided
      if (memoryTokens !== undefined) {
        updateData.lastQueryMemoryTokens = memoryTokens;
      }

      // Set firstQueryAt if not set
      if (!deployment.firstQueryAt) {
        updateData.firstQueryAt = now;
      }

      // Update deployment
      await transaction.updateGuildDeployment(guildId, updateData);

      // Check if limit reached
      const limitReached = queriesRemaining === 0;

      // If limit reached, suspend the guild
      if (limitReached) {
        const guild = await transaction.getGuild(guildId);
        if (guild && guild.status === 'active') {
          await transaction.updateGuild(guildId, {
            status: 'suspended',
            suspendedReason: 'query_limit',
            suspendedAt: now,
            updatedAt: now,
          });
        }
      }

      return {
        limitReached,
        blocked: limitReached,
        queriesRemaining,
        deploymentType: deployment.deploymentType,
        shouldDeprovision: limitReached && deployment.deploymentType === 'free',
      };
    });

    // Trigger deprovisioning if needed (outside transaction)
    if (result.shouldDeprovision) {
      this.ctx.logger.info(`Query limit reached for free tier guild ${guildId}, triggering deprovisioning`);

      // Trigger deprovisioning asynchronously (best effort)
      this.deprovisionFreeGuild(guildId).catch((error) => {
        this.ctx.logger.error(`Failed to deprovision free guild ${guildId}:`, error);
      });

      // Send notification
      this.sendDeprovisionNotification(guildId).catch((error) => {
        this.ctx.logger.error(`Failed to send deprovision notification for ${guildId}:`, error);
      });
    }

    // Log query tracking with memory tokens
    this.ctx.logger.info(
      `Query tracked: ${type} (cost: $${cost.toFixed(4)}, memory: ${memoryTokens !== undefined ? `${memoryTokens} tokens` : 'N/A'})`
    );

    return result;
  }

  /**
   * Deprovision a free tier guild (delete Fly.io resources)
   */
  private async deprovisionFreeGuild(guildId: string): Promise<void> {
    const deployment = await this.ctx.firestore.getGuildDeployment(guildId);
    if (!deployment) {
      this.ctx.logger.warn(`Cannot deprovision guild ${guildId}: deployment not found`);
      return;
    }

    try {
      const flyApiToken = this.ctx.secrets.getSecret('FLY_API_TOKEN');

      // Delete Fly.io app
      const response = await this.ctx.http.fetch(
        `https://api.machines.dev/v1/apps/${deployment.appName}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${flyApiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.ctx.logger.error(`Failed to delete Fly.io app ${deployment.appName}:`, errorText);
        return;
      }

      this.ctx.logger.info(`Successfully deprovisioned Fly.io app ${deployment.appName} for guild ${guildId}`);

      // Update guild status to deleted
      await this.ctx.firestore.updateGuild(guildId, {
        status: 'deleted',
        updatedAt: this.ctx.getCurrentTime().toISOString(),
      });
    } catch (error) {
      this.ctx.logger.error(`Error deprovisioning guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Send notification about deprovisioning (placeholder)
   */
  private async sendDeprovisionNotification(guildId: string): Promise<void> {
    // TODO: Implement notification logic (email, Discord DM, etc.)
    this.ctx.logger.info(`Deprovision notification sent for guild ${guildId}`);
  }
}
