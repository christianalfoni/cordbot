/**
 * Tests for BotManifestService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BotManifestService } from './bot-manifest-service.js';
import { MockFunctionContext } from '../context.mock.js';
import type { Bot } from '../context.js';

describe('BotManifestService', () => {
  let ctx: MockFunctionContext;
  let service: BotManifestService;

  beforeEach(() => {
    ctx = new MockFunctionContext();
    service = new BotManifestService(ctx);
  });

  describe('getBotManifest', () => {
    it('should generate manifest for bot with OAuth connections', async () => {
      // Arrange
      const mockBot: Bot = {
        botName: 'Test Bot',
        mode: 'personal',
        status: 'active',
        discordBotToken: 'test-token',
        discordGuildId: 'guild123',
        memoryContextSize: 15000,
        oauthConnections: {
          gmail: {
            accessToken: 'gmail-access-token',
            refreshToken: 'gmail-refresh-token',
            expiresAt: Date.now() + 3600000,
            email: 'test@gmail.com',
            scope: 'https://www.googleapis.com/auth/gmail.send',
            connectedAt: '2024-01-01T00:00:00Z',
          },
        },
        toolsConfig: {
          gmail: ['send_email', 'list_messages'],
          calendar: ['create_event'],
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.queryBotByToken.mockResolvedValueOnce({
        userId: 'user123',
        botId: 'bot456',
        data: mockBot,
      });

      // Act
      const result = await service.getBotManifest({ botToken: 'test-token' });

      // Assert
      expect(result).toEqual({
        userId: 'user123',
        botId: 'bot456',
        toolsConfig: {
          gmail: ['send_email', 'list_messages'],
          calendar: ['create_event'],
        },
        tokens: {
          gmail: {
            accessToken: 'gmail-access-token',
            expiresAt: expect.any(Number),
          },
        },
        memoryContextSize: 15000,
        generatedAt: '2024-01-01T00:00:00.000Z',
      });

      // Verify Firestore query
      expect(ctx.firestore.queryBotByToken).toHaveBeenCalledWith('test-token');

      // Verify logging
      expect(ctx.logger.info).toHaveBeenCalledWith(
        'Manifest generated for bot bot456 (user user123): 3 tools configured'
      );
    });

    it('should generate manifest for bot without OAuth connections', async () => {
      // Arrange
      const mockBot: Bot = {
        botName: 'Test Bot',
        mode: 'personal',
        status: 'active',
        discordBotToken: 'test-token',
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

      // Act
      const result = await service.getBotManifest({ botToken: 'test-token' });

      // Assert
      expect(result).toEqual({
        userId: 'user123',
        botId: 'bot456',
        toolsConfig: {},
        tokens: {},
        memoryContextSize: 10000,
        generatedAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should return error for invalid bot token', async () => {
      // Arrange
      ctx.firestore.queryBotByToken.mockResolvedValueOnce(null);

      // Act
      const result = await service.getBotManifest({ botToken: 'invalid-token' });

      // Assert
      expect(result).toEqual({
        error: 'Invalid bot token',
      });

      // Verify warning was logged
      expect(ctx.logger.warn).toHaveBeenCalledWith('No bot found with provided auth token');
    });

    it('should use default memory context size if not set', async () => {
      // Arrange
      const mockBot: Bot = {
        botName: 'Test Bot',
        mode: 'personal',
        status: 'active',
        discordBotToken: 'test-token',
        discordGuildId: 'guild123',
        memoryContextSize: 0, // Not set
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

      // Act
      const result = await service.getBotManifest({ botToken: 'test-token' });

      // Assert
      expect(result).toMatchObject({
        memoryContextSize: 10000, // Default value
      });
    });

    it('should only include tokens for connected OAuth services', async () => {
      // Arrange
      const mockBot: Bot = {
        botName: 'Test Bot',
        mode: 'personal',
        status: 'active',
        discordBotToken: 'test-token',
        discordGuildId: 'guild123',
        memoryContextSize: 10000,
        oauthConnections: {
          gmail: {
            accessToken: 'gmail-access-token',
            refreshToken: 'gmail-refresh-token',
            expiresAt: Date.now() + 3600000,
            email: 'test@gmail.com',
            scope: 'https://www.googleapis.com/auth/gmail.send',
            connectedAt: '2024-01-01T00:00:00Z',
          },
        },
        toolsConfig: {
          gmail: ['send_email'],
          calendar: ['create_event'], // Has tools but no OAuth
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.firestore.queryBotByToken.mockResolvedValueOnce({
        userId: 'user123',
        botId: 'bot456',
        data: mockBot,
      });

      // Act
      const result = await service.getBotManifest({ botToken: 'test-token' });

      // Assert
      expect(result).toMatchObject({
        tokens: {
          gmail: expect.any(Object),
          // calendar should NOT be in tokens since there's no OAuth connection
        },
      });
      expect(result).not.toHaveProperty('tokens.calendar');
    });
  });
});
