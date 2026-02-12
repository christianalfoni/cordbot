/**
 * File sharing interface
 *
 * Provides secure token-based file sharing capabilities for serving
 * workspace files via HTTP endpoints.
 */

/**
 * Token data for secure file access
 */
export interface FileShareToken {
  /** Unique token string */
  token: string;

  /** Absolute path to the file */
  filePath: string;

  /** Channel ID where the file was shared */
  channelId: string;

  /** When the token was created */
  createdAt: Date;

  /** Last time the file was accessed via this token */
  lastAccessedAt: Date;

  /** When the token expires */
  expiresAt: Date;
}

/**
 * Manager for creating and validating file share tokens
 */
export interface IFileShareManager {
  /**
   * Create a shareable token for a file
   * @returns token string
   */
  createShareToken(filePath: string, channelId: string): string;

  /**
   * Get file path from a token (validates and extends expiry)
   * @returns file path or null if token is invalid/expired
   */
  getFileFromToken(token: string): string | null;

  /**
   * Manually revoke a token
   */
  revokeToken(token: string): void;

  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens(): void;
}
