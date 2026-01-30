import { fetchManifest, refreshToken as refreshTokenService } from './manifest.js';
import { ToolManifest } from './types.js';

/**
 * TokenManager handles OAuth token lifecycle:
 * - Provides fresh tokens to tools
 * - Automatically refreshes tokens on-demand when needed
 */
export class TokenManager {
  private manifest: ToolManifest | null = null;
  private categoryRefreshLocks = new Map<string, Promise<boolean>>();

  constructor(
    private botToken: string,
    private serviceUrl: string,
    initialManifest: ToolManifest | null = null
  ) {
    this.manifest = initialManifest;
  }


  /**
   * Refresh a specific token category (e.g., 'gmail')
   * Uses refresh token to get new access token from service
   */
  async refreshToken(category: string): Promise<boolean> {
    // Check if refresh is already in progress for this category
    const existingRefresh = this.categoryRefreshLocks.get(category);
    if (existingRefresh) {
      console.log(`⏳ Token refresh for ${category} already in progress, waiting...`);
      return await existingRefresh;
    }

    // Create new refresh promise
    const refreshPromise = this._doRefreshToken(category);
    this.categoryRefreshLocks.set(category, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      // Remove lock when done
      this.categoryRefreshLocks.delete(category);
    }
  }

  private async _doRefreshToken(category: string): Promise<boolean> {
    try {
      console.log(`🔄 Refreshing ${category} token...`);
      const freshToken = await refreshTokenService(this.botToken, this.serviceUrl, category);

      if (!freshToken) {
        console.error(`❌ Failed to refresh ${category} token`);
        return false;
      }

      // Update the token in the manifest
      if (this.manifest) {
        (this.manifest.tokens as any)[category] = freshToken;
        console.log(`✅ ${category} token refreshed, expires at ${new Date(freshToken.expiresAt).toISOString()}`);
      }

      return true;
    } catch (error) {
      console.error(`❌ Token refresh failed for ${category}:`, error);
      return false;
    }
  }


  /**
   * Get a valid token for a category
   * Automatically refreshes if token is expired or expiring soon
   */
  async getToken(category: string): Promise<{ accessToken: string; expiresAt: number } | null> {
    console.log(`🔍 Getting token for ${category}...`);

    if (!this.manifest) {
      console.error(`❌ No manifest available for ${category}`);
      return null;
    }

    const token = (this.manifest.tokens as any)[category];

    if (!token) {
      console.error(`❌ No ${category} token in manifest`);
      return null;
    }

    // Check if token is expired or about to expire (within 2 minutes)
    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;
    const tenMinutes = 10 * 60 * 1000;

    console.log(`🔍 Token info: expiresAt=${token.expiresAt}, now=${now}, expiresAt date=${new Date(token.expiresAt).toISOString()}`);
    const expiresIn = token.expiresAt - now;
    console.log(`🔍 Token expires in ${Math.round(expiresIn / 1000)}s (${Math.round(expiresIn / 60000)} minutes)`);

    // If expired or expiring very soon (< 2 minutes), refresh immediately and wait
    if (expiresIn < twoMinutes) {
      console.log(`⚠️  ${category} token expired or expiring soon (${Math.round(expiresIn / 1000)}s), refreshing...`);
      const refreshed = await this.refreshToken(category);
      if (!refreshed) {
        console.error(`❌ Failed to refresh ${category} token`);
        return null;
      }
      return (this.manifest!.tokens as any)[category] || null;
    }

    // If expiring in 2-10 minutes, refresh in background but return current token
    if (expiresIn < tenMinutes) {
      console.log(`⚠️  ${category} token expiring in ${Math.round(expiresIn / 60000)} minutes, refreshing in background...`);
      this.refreshToken(category).catch(err => {
        console.error(`Background token refresh failed for ${category}:`, err);
      });
    }

    return token;
  }

  /**
   * Get the current manifest
   */
  getManifest(): ToolManifest | null {
    return this.manifest;
  }

  /**
   * Update the manifest (useful for initial setup)
   */
  setManifest(manifest: ToolManifest): void {
    this.manifest = manifest;
  }
}
