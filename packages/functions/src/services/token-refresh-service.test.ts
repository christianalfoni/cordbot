/**
 * Tests for TokenRefreshService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { TokenRefreshService } from './token-refresh-service.js';
import { MockFunctionContext, createMockResponse } from '../context.mock.js';
import type { Bot } from '../context.js';

describe('TokenRefreshService', () => {
  let ctx: MockFunctionContext;
  let service: TokenRefreshService;

  beforeEach(() => {
    ctx = new MockFunctionContext();
    service = new TokenRefreshService(ctx);

    // Set up default secrets
    ctx.secrets.setSecret('GOOGLE_CLIENT_ID', 'test-client-id');
    ctx.secrets.setSecret('GOOGLE_CLIENT_SECRET', 'test-client-secret');
  });

  describe('refreshToken', () => {
    it('should refresh Gmail token successfully', async () => {
      // Arrange
      const mockBot: Bot = {
        botName: 'Test Bot',
        mode: 'personal',
        status: 'active',
        discordBotToken: 'test-discord-token',
        discordGuildId: 'guild123',
        memoryContextSize: 10000,
        oauthConnections: {
          gmail: {
            accessToken: 'old-access-token',
            refreshToken: 'refresh-token-123',
            expiresAt: Date.now() - 1000, // Expired
            email: 'test@gmail.com',
            scope: 'https://www.googleapis.com/auth/gmail.send',
            connectedAt: '2024-01-01T00:00:00Z',
          },
        },
        toolsConfig: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.queryBotByToken.mockResolvedValueOnce({
        userId: 'user123',
        botId: 'bot456',
        data: mockBot,
      });

      // Mock HTTP response for token refresh
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            access_token: 'new-access-token',
            expires_in: 3600,
          },
        })
      );

      // Act
      const result = await service.refreshToken({
        botToken: 'test-discord-token',
        category: 'gmail',
      });

      // Assert
      expect(result).toEqual({
        accessToken: 'new-access-token',
        expiresAt: expect.any(Number),
      });

      // Verify token is not expired
      expect(result.expiresAt).toBeGreaterThan(Date.now());

      // Verify HTTP call
      expect(ctx.http.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      // Verify request body
      const fetchCall = ctx.http.fetch.mock.calls[0];
      const body = fetchCall[1]?.body as URLSearchParams;
      expect(body.get('refresh_token')).toBe('refresh-token-123');
      expect(body.get('client_id')).toBe('test-client-id');
      expect(body.get('client_secret')).toBe('test-client-secret');
      expect(body.get('grant_type')).toBe('refresh_token');

      // Verify Firestore update
      expect(ctx.firestore.updateBot).toHaveBeenCalledWith('user123', 'bot456', {
        oauthConnections: {
          gmail: {
            accessToken: 'new-access-token',
            refreshToken: 'refresh-token-123',
            expiresAt: expect.any(Number),
            email: 'test@gmail.com',
            scope: 'https://www.googleapis.com/auth/gmail.send',
            connectedAt: '2024-01-01T00:00:00Z',
          },
        },
      });

      // Verify logging
      expect(ctx.logger.info).toHaveBeenCalledWith('Refreshing Gmail token for bot bot456 (user user123)');
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Gmail token refreshed for bot bot456'));
    });

    it('should throw error for invalid bot token', async () => {
      // Arrange
      ctx.firestore.queryBotByToken.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(
        service.refreshToken({
          botToken: 'invalid-token',
          category: 'gmail',
        })
      ).rejects.toThrow(HttpsError);

      // Verify warning was logged
      expect(ctx.logger.warn).toHaveBeenCalledWith('No bot found with provided Discord bot token');
    });

    it('should throw error if Gmail is not connected', async () => {
      // Arrange
      const mockBot: Bot = {
        botName: 'Test Bot',
        mode: 'personal',
        status: 'active',
        discordBotToken: 'test-discord-token',
        discordGuildId: 'guild123',
        memoryContextSize: 10000,
        oauthConnections: {}, // No Gmail connection
        toolsConfig: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.queryBotByToken.mockResolvedValueOnce({
        userId: 'user123',
        botId: 'bot456',
        data: mockBot,
      });

      // Act & Assert
      await expect(
        service.refreshToken({
          botToken: 'test-discord-token',
          category: 'gmail',
        })
      ).rejects.toThrow('Gmail not connected for this bot');
    });

    it('should throw error if no refresh token available', async () => {
      // Arrange
      const mockBot: Bot = {
        botName: 'Test Bot',
        mode: 'personal',
        status: 'active',
        discordBotToken: 'test-discord-token',
        discordGuildId: 'guild123',
        memoryContextSize: 10000,
        oauthConnections: {
          gmail: {
            accessToken: 'access-token',
            refreshToken: '', // No refresh token
            expiresAt: Date.now() - 1000,
            email: 'test@gmail.com',
            scope: 'https://www.googleapis.com/auth/gmail.send',
            connectedAt: '2024-01-01T00:00:00Z',
          },
        },
        toolsConfig: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.queryBotByToken.mockResolvedValueOnce({
        userId: 'user123',
        botId: 'bot456',
        data: mockBot,
      });

      // Act & Assert
      await expect(
        service.refreshToken({
          botToken: 'test-discord-token',
          category: 'gmail',
        })
      ).rejects.toThrow('No refresh token available for Gmail');
    });

    it('should handle token refresh failure', async () => {
      // Arrange
      const mockBot: Bot = {
        botName: 'Test Bot',
        mode: 'personal',
        status: 'active',
        discordBotToken: 'test-discord-token',
        discordGuildId: 'guild123',
        memoryContextSize: 10000,
        oauthConnections: {
          gmail: {
            accessToken: 'old-access-token',
            refreshToken: 'invalid-refresh-token',
            expiresAt: Date.now() - 1000,
            email: 'test@gmail.com',
            scope: 'https://www.googleapis.com/auth/gmail.send',
            connectedAt: '2024-01-01T00:00:00Z',
          },
        },
        toolsConfig: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.queryBotByToken.mockResolvedValueOnce({
        userId: 'user123',
        botId: 'bot456',
        data: mockBot,
      });

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked',
          },
        })
      );

      // Act & Assert
      await expect(
        service.refreshToken({
          botToken: 'test-discord-token',
          category: 'gmail',
        })
      ).rejects.toThrow(HttpsError);

      // Verify error was logged
      expect(ctx.logger.error).toHaveBeenCalledWith(
        'Failed to refresh Gmail token:',
        expect.objectContaining({
          status: 400,
          botId: 'bot456',
          userId: 'user123',
        })
      );

      // Verify Firestore was NOT updated
      expect(ctx.firestore.updateBot).not.toHaveBeenCalled();
    });

    it('should throw error for unknown token category', async () => {
      // Arrange
      const mockBot: Bot = {
        botName: 'Test Bot',
        mode: 'personal',
        status: 'active',
        discordBotToken: 'test-discord-token',
        discordGuildId: 'guild123',
        memoryContextSize: 10000,
        oauthConnections: {},
        toolsConfig: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.queryBotByToken.mockResolvedValueOnce({
        userId: 'user123',
        botId: 'bot456',
        data: mockBot,
      });

      // Act & Assert
      await expect(
        service.refreshToken({
          botToken: 'test-discord-token',
          category: 'unknown-category',
        })
      ).rejects.toThrow('Unknown token category: unknown-category');
    });
  });
});
