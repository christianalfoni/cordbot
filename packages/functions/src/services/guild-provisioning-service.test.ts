/**
 * Tests for GuildProvisioningService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GuildProvisioningService } from './guild-provisioning-service.js';
import { MockFunctionContext, createMockResponse } from '../context.mock.js';
import type { Guild } from '../context.js';

describe('GuildProvisioningService', () => {
  let ctx: MockFunctionContext;
  let service: GuildProvisioningService;

  beforeEach(() => {
    ctx = new MockFunctionContext();
    service = new GuildProvisioningService(ctx);

    // Set up default secrets
    ctx.secrets.setSecret('FLY_API_TOKEN', 'test-fly-token');
    ctx.secrets.setSecret('SHARED_DISCORD_BOT_TOKEN', 'test-bot-token');
    ctx.secrets.setSecret('SHARED_ANTHROPIC_API_KEY', 'test-api-key');
  });

  describe('provisionGuild', () => {
    it('should provision guild successfully', async () => {
      // Arrange
      const mockGuild: Guild = {
        guildName: 'Test Guild',
        guildIcon: 'icon-hash',
        status: 'pending',
        userId: 'firebase-user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memoryContextSize: 10000,
        memoryRetentionMonths: 6,
        periodStart: '2024-01-01T00:00:00Z',
        periodEnd: null,
        lastDeployedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValueOnce(mockGuild);

      // Mock Fly.io API calls
      // 1. Create app
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: { id: 'app-id', name: 'cordbot-guild-123456789012' },
        })
      );

      // 2. Create volume
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: { id: 'vol_123', name: 'cordbot_vol_12345678' },
        })
      );

      // 3. Create machine
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            id: 'machine_abc123',
            state: 'starting',
            region: 'sjc',
          },
        })
      );

      // Mock machine status polling (simulate immediate start)
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            id: 'machine_abc123',
            state: 'started',
          },
        })
      );

      // Act
      const result = await service.provisionGuild({ guildId: 'guild-123' });

      // Assert
      expect(result).toEqual({
        appName: expect.stringContaining('cordbot-guild-'),
        machineId: 'machine_abc123',
        volumeId: 'vol_123',
        region: 'sjc',
      });

      // Verify Firestore calls
      expect(ctx.firestore.getGuild).toHaveBeenCalledWith('guild-123');

      // Verify guild status was updated to provisioning
      expect(ctx.firestore.updateGuild).toHaveBeenCalledWith('guild-123', {
        status: 'provisioning',
        lastDeployedAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });

      // Verify guild status was updated to provisioning (deployment details are no longer stored in Guild)
      expect(ctx.firestore.updateGuild).toHaveBeenCalledWith(
        'guild-123',
        {
          status: 'provisioning',
          lastDeployedAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        }
      );

      // Verify logging
      expect(ctx.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Provisioning guild'),
        expect.objectContaining({
          guildName: 'Test Guild',
        })
      );
    });

    it('should throw error if guild not found', async () => {
      // Arrange
      ctx.firestore.getGuild.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.provisionGuild({ guildId: 'nonexistent-guild' })).rejects.toThrow(
        'Guild not found'
      );

      // Verify no Fly.io API calls were made
      expect(ctx.http.fetch).not.toHaveBeenCalled();
    });

    it('should throw error if guild is already provisioned', async () => {
      // Arrange
      const mockGuild: Guild = {
        guildName: 'Test Guild',
        guildIcon: 'icon-hash',
        status: 'active', // Already active
        userId: 'firebase-user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memoryContextSize: 10000,
        memoryRetentionMonths: 6,
        periodStart: '2024-01-01T00:00:00Z',
        periodEnd: null,
        lastDeployedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValueOnce(mockGuild);

      // Act & Assert
      await expect(service.provisionGuild({ guildId: 'guild-123' })).rejects.toThrow(
        'Guild is already provisioned'
      );

      // Verify no Fly.io API calls were made
      expect(ctx.http.fetch).not.toHaveBeenCalled();
    });

    it('should handle Fly.io app creation failure', async () => {
      // Arrange
      const mockGuild: Guild = {
        guildName: 'Test Guild',
        guildIcon: 'icon-hash',
        status: 'pending',
        userId: 'firebase-user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memoryContextSize: 10000,
        memoryRetentionMonths: 6,
        periodStart: '2024-01-01T00:00:00Z',
        periodEnd: null,
        lastDeployedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValueOnce(mockGuild);

      // Mock failed app creation
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          data: { error: 'App name already exists' },
        })
      );

      // Act & Assert
      await expect(service.provisionGuild({ guildId: 'guild-123' })).rejects.toThrow();

      // Verify status was updated to provisioning before failure
      expect(ctx.firestore.updateGuild).toHaveBeenCalledWith('guild-123', {
        status: 'provisioning',
        lastDeployedAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should use correct Fly.io API authentication', async () => {
      // Arrange
      const mockGuild: Guild = {
        guildName: 'Test Guild',
        guildIcon: null,
        status: 'pending',
        userId: 'firebase-user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memoryContextSize: 10000,
        memoryRetentionMonths: 6,
        periodStart: '2024-01-01T00:00:00Z',
        periodEnd: null,
        lastDeployedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValueOnce(mockGuild);

      ctx.http.fetch.mockResolvedValue(
        createMockResponse({
          ok: true,
          data: { id: 'test' },
        })
      );

      // Act
      await service.provisionGuild({ guildId: 'guild-123' });

      // Assert - verify all Fly.io API calls include proper auth header
      const flyCalls = ctx.http.fetch.mock.calls.filter((call) =>
        call[0].includes('api.machines.dev')
      );

      flyCalls.forEach((call) => {
        const headers = call[1]?.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer test-fly-token');
      });
    });

    it('should create machine with correct environment variables', async () => {
      // Arrange
      const mockGuild: Guild = {
        guildName: 'Test Guild',
        guildIcon: null,
        status: 'pending',
        userId: 'firebase-user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memoryContextSize: 10000,
        memoryRetentionMonths: 6,
        periodStart: '2024-01-01T00:00:00Z',
        periodEnd: null,
        lastDeployedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValueOnce(mockGuild);

      ctx.http.fetch.mockResolvedValue(
        createMockResponse({
          ok: true,
          data: { id: 'test' },
        })
      );

      // Act
      await service.provisionGuild({ guildId: 'guild-123' });

      // Assert - find the machine creation call
      const machineCreateCall = ctx.http.fetch.mock.calls.find((call) =>
        call[0].includes('/machines') && call[1]?.method === 'POST'
      );

      expect(machineCreateCall).toBeDefined();

      const body = JSON.parse(machineCreateCall![1]!.body as string);
      expect(body.config.env).toEqual({
        DISCORD_BOT_TOKEN: 'test-bot-token',
        DISCORD_GUILD_ID: 'guild-123',
        ANTHROPIC_API_KEY: 'test-api-key',
        BOT_MODE: 'shared',
        BOT_ID: 'guild-123',
        MEMORY_CONTEXT_SIZE: '10000',
        SERVICE_URL: 'https://us-central1-claudebot-34c42.cloudfunctions.net',
      });
    });

    it('should use default memory context size if not set', async () => {
      // Arrange
      const mockGuild: Guild = {
        guildName: 'Test Guild',
        guildIcon: null,
        status: 'pending',
        userId: 'firebase-user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memoryContextSize: 10000,
        memoryRetentionMonths: 6,
        periodStart: '2024-01-01T00:00:00Z',
        periodEnd: null,
        lastDeployedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.getGuild.mockResolvedValueOnce(mockGuild);

      ctx.http.fetch.mockResolvedValue(
        createMockResponse({
          ok: true,
          data: { id: 'test' },
        })
      );

      // Act
      await service.provisionGuild({ guildId: 'guild-123' });

      // Assert
      const machineCreateCall = ctx.http.fetch.mock.calls.find((call) =>
        call[0].includes('/machines') && call[1]?.method === 'POST'
      );

      const body = JSON.parse(machineCreateCall![1]!.body as string);
      expect(body.config.env.MEMORY_CONTEXT_SIZE).toBe('10000'); // Default
    });
  });
});
