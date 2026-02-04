/**
 * Query Limit Manager
 *
 * Manages query limit state and enforcement for bot deployments.
 * Calls Firebase Functions to check and track query usage.
 */

interface QueryLimitState {
  deploymentType: 'free' | 'starter' | 'pro' | 'business';
  isBlocked: boolean;
  queriesRemaining: number;
  queriesTotal: number;
}

export class QueryLimitManager {
  private state: QueryLimitState | null = null;
  private guildId: string;
  private serviceUrl: string;

  constructor(guildId: string, serviceUrl: string) {
    this.guildId = guildId;
    this.serviceUrl = serviceUrl;
  }

  /**
   * Initialize the query limit manager by fetching current state
   */
  async initialize(): Promise<void> {
    const result = await this.callFunction('checkQueryLimit', { guildId: this.guildId });

    this.state = {
      deploymentType: result.deploymentType || 'free',
      isBlocked: result.blocked || false,
      queriesRemaining: result.queriesRemaining || 0,
      queriesTotal: result.totalQueries || 0,
    };
  }

  /**
   * Check if the bot can proceed with a query
   * If blocked, checks Firebase to see if user has upgraded
   */
  async canProceedWithQuery(): Promise<boolean> {
    if (!this.state) {
      await this.initialize();
    }

    // If not blocked, can proceed
    if (!this.state!.isBlocked) {
      return true;
    }

    // If blocked, check Firebase (user may have upgraded)
    const result = await this.callFunction('checkQueryLimit', { guildId: this.guildId });

    // Update local state
    this.state!.isBlocked = result.blocked || false;
    this.state!.queriesRemaining = result.queriesRemaining || 0;

    return result.canProceed;
  }

  /**
   * Track query usage after a query has been executed
   */
  async trackQuery(type: string, cost: number, success: boolean): Promise<void> {
    try {
      const result = await this.callFunction('trackQueryLimit', {
        guildId: this.guildId,
        type,
        cost,
        success,
      });

      // Update local state
      if (this.state) {
        this.state.queriesRemaining = result.queriesRemaining;
        if (result.limitReached) {
          this.state.isBlocked = true;
        }
      }
    } catch (error) {
      console.error('Error tracking query:', error);
      // Don't throw - tracking is best effort
    }
  }

  /**
   * Call a Firebase Function
   */
  private async callFunction<T = any>(functionName: string, data: any): Promise<T> {
    const response = await fetch(`${this.serviceUrl}/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Function call failed: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    return result.result as T;
  }
}
