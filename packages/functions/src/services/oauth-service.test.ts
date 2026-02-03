/**
 * Tests for OAuthService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { OAuthService } from './oauth-service.js';
import { MockFunctionContext, createMockResponse } from '../context.mock.js';

describe('OAuthService', () => {
  let ctx: MockFunctionContext;
  let service: OAuthService;

  beforeEach(() => {
    ctx = new MockFunctionContext();
    service = new OAuthService(ctx);

    // Set up default secrets
    ctx.secrets.setSecret('GOOGLE_CLIENT_ID', 'test-client-id');
    ctx.secrets.setSecret('GOOGLE_CLIENT_SECRET', 'test-client-secret');
  });

  describe('exchangeGmailToken', () => {
    it('should exchange Gmail token successfully', async () => {
      // Arrange
      const params = {
        code: 'test-code',
        userId: 'user123',
        botId: 'bot456',
        redirectUri: 'https://example.com/callback',
      };

      // Mock OAuth token response
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/gmail.send',
          },
        })
      );

      // Mock user info response
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            email: 'test@gmail.com',
          },
        })
      );

      // Act
      const result = await service.exchangeGmailToken(params);

      // Assert
      expect(result).toEqual({
        success: true,
        email: 'test@gmail.com',
      });

      // Verify HTTP calls
      expect(ctx.http.fetch).toHaveBeenCalledTimes(2);
      expect(ctx.http.fetch).toHaveBeenNthCalledWith(
        1,
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      expect(ctx.http.fetch).toHaveBeenNthCalledWith(
        2,
        'https://www.googleapis.com/oauth2/v2/userinfo',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-access-token' },
        })
      );

      // Verify Firestore update
      expect(ctx.firestore.updateBot).toHaveBeenCalledWith('user123', 'bot456', {
        oauthConnections: {
          gmail: {
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            expiresAt: expect.any(Number),
            email: 'test@gmail.com',
            scope: 'https://www.googleapis.com/auth/gmail.send',
            connectedAt: '2024-01-01T00:00:00.000Z',
          },
        },
      });

      // Verify logging
      expect(ctx.logger.info).toHaveBeenCalledWith(
        'Attempting token exchange',
        expect.objectContaining({
          redirectUri: 'https://example.com/callback',
          hasCode: true,
        })
      );

      expect(ctx.logger.info).toHaveBeenCalledWith(
        'Gmail connected for bot bot456 (user user123): test@gmail.com'
      );
    });

    it('should handle OAuth token exchange failure', async () => {
      // Arrange
      const params = {
        code: 'invalid-code',
        userId: 'user123',
        botId: 'bot456',
        redirectUri: 'https://example.com/callback',
      };

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Invalid authorization code',
          },
        })
      );

      // Act & Assert
      await expect(service.exchangeGmailToken(params)).rejects.toThrow(HttpsError);

      // Verify error was logged
      expect(ctx.logger.error).toHaveBeenCalledWith('Failed to exchange OAuth code:', expect.any(Object));

      // Verify Firestore was NOT updated
      expect(ctx.firestore.updateBot).not.toHaveBeenCalled();
    });

    it('should handle user info fetch failure', async () => {
      // Arrange
      const params = {
        code: 'test-code',
        userId: 'user123',
        botId: 'bot456',
        redirectUri: 'https://example.com/callback',
      };

      // Mock successful token exchange
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/gmail.send',
          },
        })
      );

      // Mock failed user info fetch
      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 401,
        })
      );

      // Act & Assert
      await expect(service.exchangeGmailToken(params)).rejects.toThrow(
        'Failed to fetch user info from Google'
      );

      // Verify Firestore was NOT updated
      expect(ctx.firestore.updateBot).not.toHaveBeenCalled();
    });

    it('should use correct client credentials from secrets', async () => {
      // Arrange
      const params = {
        code: 'test-code',
        userId: 'user123',
        botId: 'bot456',
        redirectUri: 'https://example.com/callback',
      };

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/gmail.send',
          },
        })
      );

      ctx.http.fetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: { email: 'test@gmail.com' },
        })
      );

      // Act
      await service.exchangeGmailToken(params);

      // Assert - verify the URLSearchParams body includes credentials
      const fetchCall = ctx.http.fetch.mock.calls[0];
      const body = fetchCall[1]?.body as URLSearchParams;

      expect(body.get('client_id')).toBe('test-client-id');
      expect(body.get('client_secret')).toBe('test-client-secret');
      expect(body.get('code')).toBe('test-code');
      expect(body.get('redirect_uri')).toBe('https://example.com/callback');
      expect(body.get('grant_type')).toBe('authorization_code');
    });
  });
});
