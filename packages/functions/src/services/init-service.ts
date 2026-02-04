/**
 * Init Service
 *
 * Handles one-time initialization and admin operations for the tier system.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { FunctionContext } from '../context.js';

export class InitService {
  constructor(private ctx: FunctionContext) {}

  /**
   * Initialize free tier config (one-time setup)
   */
  async initializeFreeTierConfig(): Promise<void> {
    // Check if config already exists
    const existingConfig = await this.ctx.firestore.getFreeTierConfig();
    if (existingConfig) {
      throw new HttpsError('already-exists', 'Free tier config already initialized');
    }

    // Create initial config
    const initialConfig = {
      maxSlots: 10,
      usedSlots: 0,
      queriesPerSlot: 25,
    };

    await this.ctx.firestore.createFreeTierConfig(initialConfig);

    this.ctx.logger.info('Free tier config initialized', initialConfig);
  }

  /**
   * Adjust free tier slot capacity (admin operation)
   */
  async adjustFreeTierSlots(newMaxSlots: number): Promise<void> {
    if (newMaxSlots < 0) {
      throw new HttpsError('invalid-argument', 'maxSlots must be non-negative');
    }

    // Get current config
    const config = await this.ctx.firestore.getFreeTierConfig();
    if (!config) {
      throw new HttpsError('not-found', 'Free tier config not found. Run initializeFreeTierConfig first.');
    }

    // Validate new max slots is not less than used slots
    if (newMaxSlots < config.usedSlots) {
      throw new HttpsError(
        'invalid-argument',
        `Cannot set maxSlots (${newMaxSlots}) below current usedSlots (${config.usedSlots})`
      );
    }

    // Update max slots
    await this.ctx.firestore.createFreeTierConfig({
      ...config,
      maxSlots: newMaxSlots,
    });

    this.ctx.logger.info('Free tier max slots adjusted', {
      previousMaxSlots: config.maxSlots,
      newMaxSlots,
      usedSlots: config.usedSlots,
      availableSlots: newMaxSlots - config.usedSlots,
    });
  }
}
