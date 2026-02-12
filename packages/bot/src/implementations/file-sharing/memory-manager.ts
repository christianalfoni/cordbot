import { randomBytes } from 'crypto';
import type { IFileShareManager, FileShareToken } from '../../interfaces/file-sharing.js';

/**
 * In-memory file share manager
 *
 * Manages token-based file access with automatic expiration and cleanup.
 * Tokens expire after 1 hour but are extended on each access.
 */
export class MemoryFileShareManager implements IFileShareManager {
  private tokens: Map<string, FileShareToken> = new Map();
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    // Cleanup expired tokens every 15 minutes
    this.cleanupTimer = setInterval(() => this.cleanupExpiredTokens(), 15 * 60 * 1000);
  }

  createShareToken(filePath: string, channelId: string): string {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

    this.tokens.set(token, {
      token,
      filePath,
      channelId,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt,
    });

    return token;
  }

  getFileFromToken(token: string): string | null {
    const tokenData = this.tokens.get(token);

    if (!tokenData) {
      return null;
    }

    // Check if expired
    if (new Date() > tokenData.expiresAt) {
      this.tokens.delete(token);
      return null;
    }

    // Extend expiry on access
    tokenData.lastAccessedAt = new Date();
    tokenData.expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    return tokenData.filePath;
  }

  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  cleanupExpiredTokens(): void {
    const now = new Date();
    const expiredTokens: string[] = [];

    for (const [token, data] of this.tokens.entries()) {
      if (now > data.expiresAt) {
        expiredTokens.push(token);
      }
    }

    for (const token of expiredTokens) {
      this.tokens.delete(token);
    }

    if (expiredTokens.length > 0) {
      console.log(`🧹 Cleaned up ${expiredTokens.length} expired file share token(s)`);
    }
  }

  /**
   * Clean up resources when shutting down
   */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.tokens.clear();
  }
}
