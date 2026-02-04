/**
 * Tests for QueryLimitManager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QueryLimitManager } from './query-limit-manager.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('QueryLimitManager', () => {
  let manager: QueryLimitManager;
  const guildId = 'guild-123';
  const serviceUrl = 'https://test-service.example.com';

  beforeEach(() => {
    manager = new QueryLimitManager(guildId, serviceUrl);
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should fetch and store initial state', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: true,
            blocked: false,
            deploymentType: 'pro',
            queriesRemaining: 500,
            totalQueries: 1000,
          },
        }),
      });

      // Act
      await manager.initialize();

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-service.example.com/checkQueryLimit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { guildId: 'guild-123' } }),
        }
      );
    });

    it('should throw error if API call fails', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      // Act & Assert
      await expect(manager.initialize()).rejects.toThrow(
        'Function call failed: Internal Server Error - Server error'
      );
    });
  });

  describe('canProceedWithQuery', () => {
    it('should return true when not blocked', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: true,
            blocked: false,
            deploymentType: 'pro',
            queriesRemaining: 500,
            totalQueries: 1000,
          },
        }),
      });

      // Act
      const result = await manager.canProceedWithQuery();

      // Assert
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return false when blocked', async () => {
      // Arrange - First initialize
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: true,
            blocked: false,
            deploymentType: 'free',
            queriesRemaining: 100,
            totalQueries: 100,
          },
        }),
      });

      await manager.initialize();

      // Now block it
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: false,
            blocked: true,
            deploymentType: 'free',
            queriesRemaining: 0,
            totalQueries: 100,
          },
        }),
      });

      // Manually set state to blocked to trigger Firebase check
      (manager as any).state = {
        deploymentType: 'free',
        isBlocked: true,
        queriesRemaining: 0,
        queriesTotal: 100,
      };

      // Act
      const result = await manager.canProceedWithQuery();

      // Assert
      expect(result).toBe(false);
    });

    it('should check Firebase if locally blocked (user may have upgraded)', async () => {
      // Arrange - First call: initialize (blocked)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: false,
            blocked: true,
            deploymentType: 'free',
            queriesRemaining: 0,
            totalQueries: 100,
          },
        }),
      });

      await manager.initialize();

      // Second call: check again (now unblocked - user upgraded)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: true,
            blocked: false,
            deploymentType: 'pro',
            queriesRemaining: 500,
            totalQueries: 1000,
          },
        }),
      });

      // Act
      const result = await manager.canProceedWithQuery();

      // Assert
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initialize + check
    });

    it('should not check Firebase if locally unblocked', async () => {
      // Arrange - Initialize as unblocked
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: true,
            blocked: false,
            deploymentType: 'pro',
            queriesRemaining: 500,
            totalQueries: 1000,
          },
        }),
      });

      await manager.initialize();
      mockFetch.mockClear();

      // Act
      const result = await manager.canProceedWithQuery();

      // Assert
      expect(result).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled(); // No additional API call
    });
  });

  describe('trackQuery', () => {
    it('should track message_query successfully', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            limitReached: false,
            blocked: false,
            queriesRemaining: 499,
            deploymentType: 'pro',
          },
        }),
      });

      // Act
      await manager.trackQuery('message_query', 0.05, true);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-service.example.com/trackQueryLimit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: {
              guildId: 'guild-123',
              type: 'message_query',
              cost: 0.05,
              success: true,
            },
          }),
        }
      );
    });

    it('should track scheduled_query successfully', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            limitReached: false,
            blocked: false,
            queriesRemaining: 249,
            deploymentType: 'starter',
          },
        }),
      });

      // Act
      await manager.trackQuery('scheduled_query', 0.08, true);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-service.example.com/trackQueryLimit',
        expect.objectContaining({
          body: JSON.stringify({
            data: {
              guildId: 'guild-123',
              type: 'scheduled_query',
              cost: 0.08,
              success: true,
            },
          }),
        })
      );
    });

    it('should track summarize_query successfully', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            limitReached: false,
            blocked: false,
            queriesRemaining: 500, // Should NOT be reduced
            deploymentType: 'pro',
          },
        }),
      });

      // Act
      await manager.trackQuery('summarize_query', 0.02, true);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-service.example.com/trackQueryLimit',
        expect.objectContaining({
          body: JSON.stringify({
            data: {
              guildId: 'guild-123',
              type: 'summarize_query',
              cost: 0.02,
              success: true,
            },
          }),
        })
      );
    });

    it('should track failed queries', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            limitReached: false,
            blocked: false,
            queriesRemaining: 499,
            deploymentType: 'pro',
          },
        }),
      });

      // Act
      await manager.trackQuery('message_query', 0.05, false);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-service.example.com/trackQueryLimit',
        expect.objectContaining({
          body: JSON.stringify({
            data: {
              guildId: 'guild-123',
              type: 'message_query',
              cost: 0.05,
              success: false,
            },
          }),
        })
      );
    });

    it('should update local state when limit reached', async () => {
      // Arrange - Initialize as unblocked
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: true,
            blocked: false,
            deploymentType: 'free',
            queriesRemaining: 1,
            totalQueries: 100,
          },
        }),
      });

      await manager.initialize();

      // Track query that reaches limit
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            limitReached: true,
            blocked: true,
            queriesRemaining: 0,
            deploymentType: 'free',
          },
        }),
      });

      // Act
      await manager.trackQuery('message_query', 0.05, true);

      // Check that next query check returns false
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: false,
            blocked: true,
            deploymentType: 'free',
            queriesRemaining: 0,
          },
        }),
      });

      const canProceed = await manager.canProceedWithQuery();

      // Assert
      expect(canProceed).toBe(false);
    });

    it('should not throw error if tracking fails (best effort)', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      // Act & Assert - Should not throw
      await expect(
        manager.trackQuery('message_query', 0.05, true)
      ).resolves.toBeUndefined();

      // Error should be logged (but not thrown)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle network errors gracefully', async () => {
      // Arrange
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Act & Assert - Should not throw
      await expect(
        manager.trackQuery('message_query', 0.05, true)
      ).resolves.toBeUndefined();
    });
  });

  describe('state management', () => {
    it('should preserve state across multiple operations', async () => {
      // Arrange - Initialize
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: true,
            blocked: false,
            deploymentType: 'pro',
            queriesRemaining: 500,
            totalQueries: 1000,
          },
        }),
      });

      await manager.initialize();

      // Track a query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            limitReached: false,
            blocked: false,
            queriesRemaining: 499,
            deploymentType: 'pro',
          },
        }),
      });

      await manager.trackQuery('message_query', 0.05, true);

      mockFetch.mockClear();

      // Act - Check if can proceed (should use cached state)
      const canProceed = await manager.canProceedWithQuery();

      // Assert - No new API call needed (state is cached and not blocked)
      expect(canProceed).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should auto-initialize if not initialized', async () => {
      // Arrange
      const freshManager = new QueryLimitManager(guildId, serviceUrl);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: true,
            blocked: false,
            deploymentType: 'pro',
            queriesRemaining: 500,
            totalQueries: 1000,
          },
        }),
      });

      // Act - Call canProceedWithQuery without explicit initialize
      const result = await freshManager.canProceedWithQuery();

      // Assert - Should auto-initialize
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-service.example.com/checkQueryLimit',
        expect.any(Object)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle zero cost queries', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            limitReached: false,
            blocked: false,
            queriesRemaining: 499,
            deploymentType: 'pro',
          },
        }),
      });

      // Act
      await manager.trackQuery('message_query', 0, true);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-service.example.com/trackQueryLimit',
        expect.objectContaining({
          body: JSON.stringify({
            data: {
              guildId: 'guild-123',
              type: 'message_query',
              cost: 0,
              success: true,
            },
          }),
        })
      );
    });

    it('should handle high cost queries', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            limitReached: false,
            blocked: false,
            queriesRemaining: 499,
            deploymentType: 'pro',
          },
        }),
      });

      // Act
      await manager.trackQuery('message_query', 5.99, true);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-service.example.com/trackQueryLimit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: {
              guildId: 'guild-123',
              type: 'message_query',
              cost: 5.99,
              success: true,
            },
          }),
        }
      );
    });

    it('should handle undefined queries remaining', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            canProceed: true,
            blocked: false,
            deploymentType: 'pro',
            // queriesRemaining not provided
          },
        }),
      });

      // Act & Assert - Should not throw
      await expect(manager.initialize()).resolves.toBeUndefined();
    });
  });
});
