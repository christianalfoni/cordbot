/**
 * Tests for QueryLimitService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { QueryLimitService } from './query-limit-service.js';
import { MockFunctionContext } from '../context.mock.js';
import type { Guild, GuildDeployment } from '../types.js';

describe('QueryLimitService', () => {
  let ctx: MockFunctionContext;
  let service: QueryLimitService;

  beforeEach(() => {
    ctx = new MockFunctionContext();
    service = new QueryLimitService(ctx);
  });

  describe('checkQueryLimit', () => {
    it('should allow queries when guild is active and has queries remaining', async () => {
      // Arrange
      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'pro',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'pro',
        queriesTotal: 1000,
        queriesRemaining: 500,
        queriesUsed: 500,
        totalCost: 10.0,
        costThisPeriod: 10.0,
        queryTypes: {},
        costByType: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValue(guild);
      ctx.firestore.getGuildDeployment.mockResolvedValue(deployment);

      // Act
      const result = await service.checkQueryLimit({ guildId: 'guild-123' });

      // Assert
      expect(result).toEqual({
        canProceed: true,
        blocked: false,
        deploymentType: 'pro',
        queriesRemaining: 500,
        totalQueries: 1000,
      });

      expect(ctx.firestore.getGuild).toHaveBeenCalledWith('guild-123');
      expect(ctx.firestore.getGuildDeployment).toHaveBeenCalledWith('guild-123');
    });

    it('should block queries when guild is suspended', async () => {
      // Arrange
      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'suspended',
        suspendedReason: 'query_limit',
        userId: 'user-123',
        tier: 'free',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValue(guild);

      // Act
      const result = await service.checkQueryLimit({ guildId: 'guild-123' });

      // Assert
      expect(result).toEqual({
        canProceed: false,
        blocked: true,
        reason: 'query_limit',
      });

      expect(ctx.firestore.getGuild).toHaveBeenCalledWith('guild-123');
      expect(ctx.firestore.getGuildDeployment).not.toHaveBeenCalled();
    });

    it('should block queries when queries remaining is zero', async () => {
      // Arrange
      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'free',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'free',
        queriesTotal: 100,
        queriesRemaining: 0,
        queriesUsed: 100,
        totalCost: 2.0,
        costThisPeriod: 2.0,
        queryTypes: {},
        costByType: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValue(guild);
      ctx.firestore.getGuildDeployment.mockResolvedValue(deployment);

      // Act
      const result = await service.checkQueryLimit({ guildId: 'guild-123' });

      // Assert
      expect(result).toEqual({
        canProceed: false,
        blocked: true,
        reason: 'Query limit reached',
        deploymentType: 'free',
        queriesRemaining: 0,
        totalQueries: 100,
      });
    });

    it('should block when guild does not exist', async () => {
      // Arrange
      ctx.firestore.getGuild.mockResolvedValue(null);

      // Act
      const result = await service.checkQueryLimit({ guildId: 'guild-123' });

      // Assert
      expect(result).toEqual({
        canProceed: false,
        blocked: true,
        reason: 'Guild not found',
      });
    });

    it('should block when deployment does not exist', async () => {
      // Arrange
      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'free',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValue(guild);
      ctx.firestore.getGuildDeployment.mockResolvedValue(null);

      // Act
      const result = await service.checkQueryLimit({ guildId: 'guild-123' });

      // Assert
      expect(result).toEqual({
        canProceed: false,
        blocked: true,
        reason: 'Deployment data not found',
      });
    });
  });

  describe('trackQueryLimit', () => {
    it('should track message_query and reduce query count', async () => {
      // Arrange
      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'pro',
        queriesTotal: 1000,
        queriesRemaining: 500,
        queriesUsed: 500,
        totalCost: 10.0,
        costThisPeriod: 10.0,
        queryTypes: { message_query: 100 },
        costByType: { message_query: 5.0 },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'pro',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // Mock transaction
      ctx.firestore.runTransaction.mockImplementation(async (callback: any) => {
        const transaction = {
          getGuildDeployment: vi.fn().mockResolvedValue(deployment),
          updateGuildDeployment: vi.fn().mockResolvedValue(undefined),
          getGuild: vi.fn().mockResolvedValue(guild),
          updateGuild: vi.fn().mockResolvedValue(undefined),
        };
        return callback(transaction);
      });

      // Act
      const result = await service.trackQueryLimit({
        guildId: 'guild-123',
        type: 'message_query',
        cost: 0.05,
        success: true,
      });

      // Assert
      expect(result).toEqual({
        limitReached: false,
        blocked: false,
        queriesRemaining: 499,
        deploymentType: 'pro',
        shouldDeprovision: false,
      });

      // Verify transaction was called
      expect(ctx.firestore.runTransaction).toHaveBeenCalled();

      // Verify deployment was updated with correct values
      const transactionCallback = ctx.firestore.runTransaction.mock.calls[0][0];
      const mockTransaction = {
        getGuildDeployment: vi.fn().mockResolvedValue(deployment),
        updateGuildDeployment: vi.fn(),
        getGuild: vi.fn().mockResolvedValue(guild),
        updateGuild: vi.fn(),
      };

      await transactionCallback(mockTransaction);

      expect(mockTransaction.updateGuildDeployment).toHaveBeenCalledWith(
        'guild-123',
        expect.objectContaining({
          queriesRemaining: 499, // Reduced by 1
          queriesUsed: 501, // Increased by 1
          totalCost: 10.05,
          costThisPeriod: 10.05,
          queryTypes: { message_query: 101 },
          costByType: { message_query: 5.05 },
          lastQueryAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      );
    });

    it('should track scheduled_query and reduce query count', async () => {
      // Arrange
      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'starter',
        queriesTotal: 500,
        queriesRemaining: 250,
        queriesUsed: 250,
        totalCost: 5.0,
        costThisPeriod: 5.0,
        queryTypes: { scheduled_query: 50 },
        costByType: { scheduled_query: 2.5 },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'starter',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.runTransaction.mockImplementation(async (callback: any) => {
        const transaction = {
          getGuildDeployment: vi.fn().mockResolvedValue(deployment),
          updateGuildDeployment: vi.fn().mockResolvedValue(undefined),
          getGuild: vi.fn().mockResolvedValue(guild),
          updateGuild: vi.fn().mockResolvedValue(undefined),
        };
        return callback(transaction);
      });

      // Act
      const result = await service.trackQueryLimit({
        guildId: 'guild-123',
        type: 'scheduled_query',
        cost: 0.08,
        success: true,
      });

      // Assert
      expect(result).toEqual({
        limitReached: false,
        blocked: false,
        queriesRemaining: 249,
        deploymentType: 'starter',
        shouldDeprovision: false,
      });

      // Verify deployment update
      const transactionCallback = ctx.firestore.runTransaction.mock.calls[0][0];
      const mockTransaction = {
        getGuildDeployment: vi.fn().mockResolvedValue(deployment),
        updateGuildDeployment: vi.fn(),
        getGuild: vi.fn().mockResolvedValue(guild),
        updateGuild: vi.fn(),
      };

      await transactionCallback(mockTransaction);

      expect(mockTransaction.updateGuildDeployment).toHaveBeenCalledWith(
        'guild-123',
        expect.objectContaining({
          queriesRemaining: 249, // Reduced by 1
          queriesUsed: 251, // Increased by 1
          queryTypes: { scheduled_query: 51 },
          costByType: { scheduled_query: 2.58 },
        })
      );
    });

    it('should track summarize_query WITHOUT reducing query count', async () => {
      // Arrange
      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'pro',
        queriesTotal: 1000,
        queriesRemaining: 500,
        queriesUsed: 500,
        totalCost: 10.0,
        costThisPeriod: 10.0,
        queryTypes: { message_query: 100 },
        costByType: { message_query: 5.0 },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'pro',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.runTransaction.mockImplementation(async (callback: any) => {
        const transaction = {
          getGuildDeployment: vi.fn().mockResolvedValue(deployment),
          updateGuildDeployment: vi.fn().mockResolvedValue(undefined),
          getGuild: vi.fn().mockResolvedValue(guild),
          updateGuild: vi.fn().mockResolvedValue(undefined),
        };
        return callback(transaction);
      });

      // Act
      const result = await service.trackQueryLimit({
        guildId: 'guild-123',
        type: 'summarize_query',
        cost: 0.02,
        success: true,
      });

      // Assert
      expect(result).toEqual({
        limitReached: false,
        blocked: false,
        queriesRemaining: 500, // NOT REDUCED
        deploymentType: 'pro',
        shouldDeprovision: false,
      });

      // Verify deployment update
      const transactionCallback = ctx.firestore.runTransaction.mock.calls[0][0];
      const mockTransaction = {
        getGuildDeployment: vi.fn().mockResolvedValue(deployment),
        updateGuildDeployment: vi.fn(),
        getGuild: vi.fn().mockResolvedValue(guild),
        updateGuild: vi.fn(),
      };

      await transactionCallback(mockTransaction);

      expect(mockTransaction.updateGuildDeployment).toHaveBeenCalledWith(
        'guild-123',
        expect.objectContaining({
          queriesRemaining: 500, // NOT REDUCED - stays at 500
          queriesUsed: 500, // NOT INCREASED - stays at 500
          totalCost: 10.02, // Cost IS tracked
          costThisPeriod: 10.02, // Cost IS tracked
          queryTypes: { message_query: 100, summarize_query: 1 }, // Counter IS tracked
          costByType: { message_query: 5.0, summarize_query: 0.02 }, // Cost by type IS tracked
          lastQueryAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      );
    });

    it('should suspend guild when limit reached', async () => {
      // Arrange
      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'free',
        queriesTotal: 100,
        queriesRemaining: 1, // Last query
        queriesUsed: 99,
        totalCost: 2.0,
        costThisPeriod: 2.0,
        queryTypes: {},
        costByType: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'free',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.runTransaction.mockImplementation(async (callback: any) => {
        const transaction = {
          getGuildDeployment: vi.fn().mockResolvedValue(deployment),
          updateGuildDeployment: vi.fn().mockResolvedValue(undefined),
          getGuild: vi.fn().mockResolvedValue(guild),
          updateGuild: vi.fn().mockResolvedValue(undefined),
        };
        return callback(transaction);
      });

      // Act
      const result = await service.trackQueryLimit({
        guildId: 'guild-123',
        type: 'message_query',
        cost: 0.05,
        success: true,
      });

      // Assert
      expect(result).toEqual({
        limitReached: true,
        blocked: true,
        queriesRemaining: 0,
        deploymentType: 'free',
        shouldDeprovision: true, // Free tier should be deprovisioned
      });

      // Verify guild was suspended
      const transactionCallback = ctx.firestore.runTransaction.mock.calls[0][0];
      const mockTransaction = {
        getGuildDeployment: vi.fn().mockResolvedValue(deployment),
        updateGuildDeployment: vi.fn(),
        getGuild: vi.fn().mockResolvedValue(guild),
        updateGuild: vi.fn(),
      };

      await transactionCallback(mockTransaction);

      expect(mockTransaction.updateGuild).toHaveBeenCalledWith(
        'guild-123',
        expect.objectContaining({
          status: 'suspended',
          suspendedReason: 'query_limit',
          suspendedAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      );
    });

    it('should mark for deprovisioning only for free tier', async () => {
      // Arrange - Pro tier
      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'pro',
        queriesTotal: 1000,
        queriesRemaining: 1,
        queriesUsed: 999,
        totalCost: 50.0,
        costThisPeriod: 50.0,
        queryTypes: {},
        costByType: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'pro',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.runTransaction.mockImplementation(async (callback: any) => {
        const transaction = {
          getGuildDeployment: vi.fn().mockResolvedValue(deployment),
          updateGuildDeployment: vi.fn().mockResolvedValue(undefined),
          getGuild: vi.fn().mockResolvedValue(guild),
          updateGuild: vi.fn().mockResolvedValue(undefined),
        };
        return callback(transaction);
      });

      // Act
      const result = await service.trackQueryLimit({
        guildId: 'guild-123',
        type: 'message_query',
        cost: 0.05,
        success: true,
      });

      // Assert
      expect(result).toEqual({
        limitReached: true,
        blocked: true,
        queriesRemaining: 0,
        deploymentType: 'pro',
        shouldDeprovision: false, // Pro tier should NOT be deprovisioned
      });
    });

    it('should set firstQueryAt if not already set', async () => {
      // Arrange
      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'free',
        queriesTotal: 100,
        queriesRemaining: 100,
        queriesUsed: 0,
        totalCost: 0,
        costThisPeriod: 0,
        queryTypes: {},
        costByType: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        // firstQueryAt not set
      };

      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'free',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.runTransaction.mockImplementation(async (callback: any) => {
        const transaction = {
          getGuildDeployment: vi.fn().mockResolvedValue(deployment),
          updateGuildDeployment: vi.fn().mockResolvedValue(undefined),
          getGuild: vi.fn().mockResolvedValue(guild),
          updateGuild: vi.fn().mockResolvedValue(undefined),
        };
        return callback(transaction);
      });

      // Act
      await service.trackQueryLimit({
        guildId: 'guild-123',
        type: 'message_query',
        cost: 0.05,
        success: true,
      });

      // Verify firstQueryAt was set
      const transactionCallback = ctx.firestore.runTransaction.mock.calls[0][0];
      const mockTransaction = {
        getGuildDeployment: vi.fn().mockResolvedValue(deployment),
        updateGuildDeployment: vi.fn(),
        getGuild: vi.fn().mockResolvedValue(guild),
        updateGuild: vi.fn(),
      };

      await transactionCallback(mockTransaction);

      expect(mockTransaction.updateGuildDeployment).toHaveBeenCalledWith(
        'guild-123',
        expect.objectContaining({
          firstQueryAt: '2024-01-01T00:00:00.000Z',
        })
      );
    });

    it('should throw error if deployment not found', async () => {
      // Arrange
      ctx.firestore.runTransaction.mockImplementation(async (callback: any) => {
        const transaction = {
          getGuildDeployment: vi.fn().mockResolvedValue(null),
        };
        return callback(transaction);
      });

      // Act & Assert
      await expect(
        service.trackQueryLimit({
          guildId: 'guild-123',
          type: 'message_query',
          cost: 0.05,
          success: true,
        })
      ).rejects.toThrow(HttpsError);
    });

    it('should handle undefined queryTypes and costByType fields', async () => {
      // Arrange - Deployment without queryTypes or costByType
      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'free',
        queriesTotal: 100,
        queriesRemaining: 100,
        queriesUsed: 0,
        totalCost: 0,
        costThisPeriod: 0,
        // queryTypes and costByType are undefined
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as any;

      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'free',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.runTransaction.mockImplementation(async (callback: any) => {
        const transaction = {
          getGuildDeployment: vi.fn().mockResolvedValue(deployment),
          updateGuildDeployment: vi.fn().mockResolvedValue(undefined),
          getGuild: vi.fn().mockResolvedValue(guild),
          updateGuild: vi.fn().mockResolvedValue(undefined),
        };
        return callback(transaction);
      });

      // Act
      await service.trackQueryLimit({
        guildId: 'guild-123',
        type: 'message_query',
        cost: 0.05,
        success: true,
      });

      // Verify it creates the fields from scratch
      const transactionCallback = ctx.firestore.runTransaction.mock.calls[0][0];
      const mockTransaction = {
        getGuildDeployment: vi.fn().mockResolvedValue(deployment),
        updateGuildDeployment: vi.fn(),
        getGuild: vi.fn().mockResolvedValue(guild),
        updateGuild: vi.fn(),
      };

      await transactionCallback(mockTransaction);

      expect(mockTransaction.updateGuildDeployment).toHaveBeenCalledWith(
        'guild-123',
        expect.objectContaining({
          queryTypes: { message_query: 1 }, // Created from scratch
          costByType: { message_query: 0.05 }, // Created from scratch
        })
      );
    });

    it('should handle multiple query types and costs correctly', async () => {
      // Arrange
      const deployment: GuildDeployment = {
        guildId: 'guild-123',
        deploymentType: 'business',
        queriesTotal: 5000,
        queriesRemaining: 2500,
        queriesUsed: 2500,
        totalCost: 100.0,
        costThisPeriod: 100.0,
        queryTypes: {
          message_query: 1000,
          scheduled_query: 200,
          summarize_query: 50,
        },
        costByType: {
          message_query: 50.0,
          scheduled_query: 40.0,
          summarize_query: 10.0,
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const guild: Guild = {
        guildId: 'guild-123',
        guildName: 'Test Guild',
        status: 'active',
        userId: 'user-123',
        tier: 'business',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.runTransaction.mockImplementation(async (callback: any) => {
        const transaction = {
          getGuildDeployment: vi.fn().mockResolvedValue(deployment),
          updateGuildDeployment: vi.fn().mockResolvedValue(undefined),
          getGuild: vi.fn().mockResolvedValue(guild),
          updateGuild: vi.fn().mockResolvedValue(undefined),
        };
        return callback(transaction);
      });

      // Act
      await service.trackQueryLimit({
        guildId: 'guild-123',
        type: 'summarize_query',
        cost: 0.03,
        success: true,
      });

      // Verify all query types are preserved and updated correctly
      const transactionCallback = ctx.firestore.runTransaction.mock.calls[0][0];
      const mockTransaction = {
        getGuildDeployment: vi.fn().mockResolvedValue(deployment),
        updateGuildDeployment: vi.fn(),
        getGuild: vi.fn().mockResolvedValue(guild),
        updateGuild: vi.fn(),
      };

      await transactionCallback(mockTransaction);

      expect(mockTransaction.updateGuildDeployment).toHaveBeenCalledWith(
        'guild-123',
        expect.objectContaining({
          queryTypes: {
            message_query: 1000, // Unchanged
            scheduled_query: 200, // Unchanged
            summarize_query: 51, // Incremented
          },
          costByType: {
            message_query: 50.0, // Unchanged
            scheduled_query: 40.0, // Unchanged
            summarize_query: 10.03, // Updated
          },
        })
      );
    });
  });
});
