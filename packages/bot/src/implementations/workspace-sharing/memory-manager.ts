import { randomBytes } from 'crypto';
import type {
  IWorkspaceShareManager,
  WorkspaceShareToken,
} from '../../interfaces/workspace-sharing.js';

/**
 * In-memory workspace share manager
 *
 * Manages token-based workspace access with automatic expiration and cleanup.
 * Tokens expire after 1 hour but are extended on each access.
 * Also tracks connected SSE clients per token.
 */
export class MemoryWorkspaceShareManager implements IWorkspaceShareManager {
  private tokens: Map<string, WorkspaceShareToken> = new Map();
  private clients: Map<string, Set<string>> = new Map(); // token -> Set<clientId>
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    // Cleanup expired tokens every 15 minutes
    this.cleanupTimer = setInterval(() => this.cleanupExpiredTokens(), 15 * 60 * 1000);
  }

  createWorkspaceToken(workspaceRoot: string, channelId: string): string {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

    this.tokens.set(token, {
      token,
      workspaceRoot,
      channelId,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt,
    });

    // Initialize empty client set for this token
    this.clients.set(token, new Set());

    return token;
  }

  getWorkspaceFromToken(token: string): string | null {
    const tokenData = this.tokens.get(token);

    if (!tokenData) {
      return null;
    }

    // Check if expired
    if (new Date() > tokenData.expiresAt) {
      this.tokens.delete(token);
      this.clients.delete(token);
      return null;
    }

    // Extend expiry on access (sliding window)
    tokenData.lastAccessedAt = new Date();
    tokenData.expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    return tokenData.workspaceRoot;
  }

  registerClient(token: string, clientId: string): void {
    const clientSet = this.clients.get(token);

    if (!clientSet) {
      // Token doesn't exist or expired
      return;
    }

    clientSet.add(clientId);
  }

  unregisterClient(token: string, clientId: string): void {
    const clientSet = this.clients.get(token);

    if (!clientSet) {
      return;
    }

    clientSet.delete(clientId);
  }

  getConnectedClients(token: string): string[] {
    const clientSet = this.clients.get(token);

    if (!clientSet) {
      return [];
    }

    return Array.from(clientSet);
  }

  revokeToken(token: string): void {
    this.tokens.delete(token);
    this.clients.delete(token);
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
      this.clients.delete(token);
    }

    if (expiredTokens.length > 0) {
      console.log(`🧹 Cleaned up ${expiredTokens.length} expired workspace token(s)`);
    }
  }

  /**
   * Clean up resources when shutting down
   */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.tokens.clear();
    this.clients.clear();
  }
}
