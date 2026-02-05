/**
 * Guild Upgrade Service
 *
 * Handles upgrading guilds from free tier to paid tiers.
 * Updates query limits, unsuspends guilds, and sets billing periods.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext } from '../context.js';

// Tier configurations
const TIER_CONFIGS = {
  starter: {
    queriesTotal: 500,
    monthlyQueries: 500,
  },
  pro: {
    queriesTotal: 1200,
    monthlyQueries: 1200,
  },
};

export class GuildUpgradeService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Upgrade a guild to a paid tier
   */
  async upgradeGuild(params: {
    userId: string;
    guildId: string;
    targetTier: 'starter' | 'pro';
  }): Promise<{ success: true }> {
    const { userId, guildId, targetTier } = params;

    // Validate target tier
    if (!TIER_CONFIGS[targetTier]) {
      throw new HttpsError('invalid-argument', 'Invalid target tier');
    }

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

    // Get tier config
    const tierConfig = TIER_CONFIGS[targetTier];
    const now = this.ctx.getCurrentTime();
    const periodStart = now.toISOString();

    // Calculate period end (30 days from now)
    const periodEndDate = new Date(now);
    periodEndDate.setDate(periodEndDate.getDate() + 30);
    const periodEnd = periodEndDate.toISOString();

    // Update guild status to active (unsuspend if needed) and set billing period
    const guildUpdate: any = {
      status: 'active',
      tier: targetTier,
      periodStart,
      periodEnd,
      updatedAt: periodStart,
    };

    // Clear suspension fields if suspended
    if (guild.status === 'suspended') {
      guildUpdate.suspendedReason = null;
      guildUpdate.suspendedAt = null;
    }

    await this.ctx.firestore.updateGuild(guildId, guildUpdate);

    // Update deployment with new tier config
    await this.ctx.firestore.updateGuildDeployment(guildId, {
      deploymentType: targetTier,
      queriesTotal: tierConfig.queriesTotal,
      queriesRemaining: tierConfig.queriesTotal,
      queriesUsed: 0,
      costThisPeriod: 0,
      updatedAt: periodStart,
    });

    this.ctx.logger.info(`Guild ${guildId} upgraded to ${targetTier} tier`, {
      previousTier: deployment.deploymentType,
      newTier: targetTier,
      queriesTotal: tierConfig.queriesTotal,
    });

    return { success: true };
  }
}
