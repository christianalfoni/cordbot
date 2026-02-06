/**
 * Tests for DiscordOAuthService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { DiscordOAuthService } from './discord-oauth-service.js';
import { MockFunctionContext, createMockResponse } from '../context.mock.js';

describe('DiscordOAuthService', () => {
  let ctx: MockFunctionContext;
  let service: DiscordOAuthService;

  beforeEach(() => {
    ctx = new MockFunctionContext();
    service = new DiscordOAuthService(ctx);

    // Set up default secrets
    ctx.secrets.setSecret('DISCORD_CLIENT_ID', 'test-client-id');
    ctx.secrets.setSecret('DISCORD_CLIENT_SECRET', 'test-client-secret');
    ctx.secrets.setSecret('SHARED_DISCORD_BOT_TOKEN', 'test-bot-token');
  });

  describe('processDiscordOAuth', () => {
    it('should process Discord OAuth successfully', async () => {
      // Arrange
      const params = {
        code: 'oauth-code-123',
        guildId: 'guild-456',
        permissions: '8',
        redirectUri: 'https://example.com/callback',
        firebaseUserId: 'firebase-user-123',
      };

      // Mock token exchange
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            access_token: 'discord-access-token',
            token_type: 'Bearer',
            expires_in: 604800,
          },
        })
      );

      // Mock guild fetch
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            id: 'guild-456',
            name: 'Test Server',
            icon: 'icon-hash-123',
          },
        })
      );

      // Mock user fetch
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            id: 'discord-user-789',
            username: 'testuser',
          },
        })
      );

      // Act
      const result = await service.processDiscordOAuth(params);

      // Assert
      expect(result).toEqual({
        success: true,
        guildId: 'guild-456',
        guildName: 'Test Server',
        guildIcon: 'icon-hash-123',
      });

      // Verify HTTP calls
      expect(ctx.http.fetch).toHaveBeenCalledTimes(2);

      // Verify token exchange call
      expect(ctx.http.fetch).toHaveBeenNthCalledWith(
        1,
        'https://discord.com/api/v10/oauth2/token',
        expect.objectContaining({
          method: 'POST',
        })
      );

      // Verify guild fetch uses bot token
      expect(ctx.http.fetch).toHaveBeenNthCalledWith(
        2,
        'https://discord.com/api/v10/guilds/guild-456',
        expect.objectContaining({
          headers: {
            Authorization: 'Bot test-bot-token',
          },
        })
      );

      // Verify guild was created in Firestore
      expect(ctx.firestore.createGuild).toHaveBeenCalledWith('guild-456', {
        guildName: 'Test Server',
        guildIcon: 'icon-hash-123',
        status: 'pending',
        userId: 'firebase-user-123',
        tier: 'free',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        memoryContextSize: 5000,
        memoryRetentionMonths: 1,
        periodStart: '2024-01-01T00:00:00.000Z',
        periodEnd: null,
        lastDeployedAt: '2024-01-01T00:00:00.000Z',
      });

      // Verify logging
      expect(ctx.logger.info).toHaveBeenCalledWith('Processing Discord OAuth', { guildId: 'guild-456' });
      expect(ctx.logger.info).toHaveBeenCalledWith('Guild document created successfully', {
        guildId: 'guild-456',
        guildName: 'Test Server',
      });
    });

    it('should handle token exchange failure', async () => {
      // Arrange
      const params = {
        code: 'invalid-code',
        guildId: 'guild-456',
        permissions: '8',
        redirectUri: 'https://example.com/callback',
        firebaseUserId: 'firebase-user-123',
      };

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          data: {
            error: 'invalid_grant',
          },
        })
      );

      // Act & Assert
      await expect(service.processDiscordOAuth(params)).rejects.toThrow(HttpsError);

      // Verify error was logged
      expect(ctx.logger.error).toHaveBeenCalledWith('Failed to exchange OAuth code:', expect.any(Object));

      // Verify guild was NOT created
      expect(ctx.firestore.createGuild).not.toHaveBeenCalled();
    });

    it('should handle guild fetch failure', async () => {
      // Arrange
      const params = {
        code: 'oauth-code-123',
        guildId: 'guild-456',
        permissions: '8',
        redirectUri: 'https://example.com/callback',
        firebaseUserId: 'firebase-user-123',
      };

      // Mock successful token exchange
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            access_token: 'discord-access-token',
          },
        })
      );

      // Mock failed guild fetch
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 403,
          data: {
            message: 'Missing Access',
          },
        })
      );

      // Act & Assert
      await expect(service.processDiscordOAuth(params)).rejects.toThrow(HttpsError);

      // Verify error was logged
      expect(ctx.logger.error).toHaveBeenCalledWith(
        'Failed to fetch guild details',
        expect.objectContaining({
          status: 403,
          guildId: 'guild-456',
        })
      );

      // Verify guild was NOT created
      expect(ctx.firestore.createGuild).not.toHaveBeenCalled();
    });

    it('should handle missing guild icon gracefully', async () => {
      // Arrange
      const params = {
        code: 'oauth-code-123',
        guildId: 'guild-456',
        permissions: '8',
        redirectUri: 'https://example.com/callback',
        firebaseUserId: 'firebase-user-123',
      };

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: { access_token: 'discord-access-token' },
        })
      );

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            id: 'guild-456',
            name: 'Test Server',
            icon: null, // No icon
          },
        })
      );

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: { id: 'discord-user-789' },
        })
      );

      // Act
      const result = await service.processDiscordOAuth(params);

      // Assert
      expect(result).toMatchObject({
        guildIcon: null,
      });

      expect(ctx.firestore.createGuild).toHaveBeenCalledWith(
        'guild-456',
        expect.objectContaining({
          guildIcon: null,
        })
      );
    });

    it('should use firebaseUserId from params', async () => {
      // Arrange
      const params = {
        code: 'oauth-code-123',
        guildId: 'guild-456',
        permissions: '8',
        redirectUri: 'https://example.com/callback',
        firebaseUserId: 'firebase-user-123',
      };

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: { access_token: 'discord-access-token' },
        })
      );

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            id: 'guild-456',
            name: 'Test Server',
            icon: 'icon-hash',
          },
        })
      );

      // Act
      const result = await service.processDiscordOAuth(params);

      // Assert - should succeed with firebaseUserId from params
      expect(result).toBeTruthy();

      expect(ctx.firestore.createGuild).toHaveBeenCalledWith(
        'guild-456',
        expect.objectContaining({
          userId: 'firebase-user-123',
        })
      );
    });

    it('should use correct credentials for token exchange', async () => {
      // Arrange
      const params = {
        code: 'oauth-code-123',
        guildId: 'guild-456',
        permissions: '8',
        redirectUri: 'https://example.com/callback',
        firebaseUserId: 'firebase-user-123',
      };

      ctx.http.fetch.mockResolvedValue(
        createMockResponse({
          ok: true,
          data: { id: 'test', access_token: 'token' },
        })
      );

      // Act
      await service.processDiscordOAuth(params);

      // Assert
      const tokenExchangeCall = ctx.http.fetch.mock.calls[0];
      const body = tokenExchangeCall[1]?.body as URLSearchParams;

      expect(body.get('client_id')).toBe('test-client-id');
      expect(body.get('client_secret')).toBe('test-client-secret');
      expect(body.get('code')).toBe('oauth-code-123');
      expect(body.get('redirect_uri')).toBe('https://example.com/callback');
      expect(body.get('grant_type')).toBe('authorization_code');
    });
  });

});
