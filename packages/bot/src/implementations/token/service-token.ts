import type { ITokenProvider, Token, TokenCategory } from '../../interfaces/token.js';
import { TokenManager } from '../../service/token-manager.js';

/**
 * Service-based token provider implementation
 * Wraps the existing TokenManager
 */
export class ServiceTokenProvider implements ITokenProvider {
  constructor(private tokenManager: TokenManager) {}

  async getToken(category: TokenCategory): Promise<Token | null> {
    const token = await this.tokenManager.getToken(category);

    if (!token) {
      return null;
    }

    return {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    };
  }

  async refreshToken(category: TokenCategory): Promise<boolean> {
    return await this.tokenManager.refreshToken(category);
  }

  async setToken(category: TokenCategory, token: Token): Promise<void> {
    // Update the manifest with the new token
    const manifest = this.tokenManager.getManifest();
    if (manifest) {
      (manifest.tokens as any)[category] = {
        accessToken: token.accessToken,
        expiresAt: token.expiresAt,
        refreshToken: token.refreshToken,
      };
    }
  }

  async removeToken(category: TokenCategory): Promise<void> {
    // Remove token from manifest
    const manifest = this.tokenManager.getManifest();
    if (manifest) {
      delete (manifest.tokens as any)[category];
    }
  }

  async hasToken(category: TokenCategory): Promise<boolean> {
    const token = await this.tokenManager.getToken(category);
    return token !== null;
  }

  isTokenExpired(token: Token): boolean {
    if (!token.expiresAt) {
      return false; // No expiry means it doesn't expire
    }
    return Date.now() >= token.expiresAt;
  }
}
