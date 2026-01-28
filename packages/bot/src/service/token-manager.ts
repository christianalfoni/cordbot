import { fetchManifest } from './manifest.js';
import { ToolManifest } from './types.js';

/**
 * TokenManager handles OAuth token lifecycle:
 * - Provides fresh tokens to tools
 * - Automatically refreshes tokens before expiry
 * - Runs background refresh loop
 */
export class TokenManager {
  private manifest: ToolManifest | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRefreshing = false;

  constructor(
    private botToken: string,
    private serviceUrl: string,
    initialManifest: ToolManifest | null = null
  ) {
    this.manifest = initialManifest;
  }

  /**
   * Start background token refresh
   * Checks every 5 minutes and refreshes tokens expiring in <10 minutes
   */
  startBackgroundRefresh(): void {
    if (this.refreshInterval) return;

    // Check every 5 minutes
    const checkInterval = 5 * 60 * 1000;

    this.refreshInterval = setInterval(async () => {
      await this.refreshIfNeeded();
    }, checkInterval);

    console.log('🔄 Token refresh background task started');
  }

  /**
   * Stop background token refresh
   */
  stopBackgroundRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('⏸️  Token refresh background task stopped');
    }
  }

  /**
   * Check if any tokens need refresh and refresh if needed
   */
  private async refreshIfNeeded(): Promise<void> {
    if (this.isRefreshing || !this.manifest) return;

    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    let needsRefresh = false;

    // Check if any tokens expire in the next 10 minutes
    for (const [category, token] of Object.entries(this.manifest.tokens)) {
      if (token && token.expiresAt) {
        const timeUntilExpiry = token.expiresAt - now;
        if (timeUntilExpiry < tenMinutes) {
          console.log(`⚠️  ${category} token expires in ${Math.round(timeUntilExpiry / 1000 / 60)} minutes`);
          needsRefresh = true;
          break;
        }
      }
    }

    if (needsRefresh) {
      await this.refreshTokens();
    }
  }

  /**
   * Force refresh all tokens from service
   */
  async refreshTokens(): Promise<boolean> {
    if (this.isRefreshing) {
      console.log('⏳ Token refresh already in progress...');
      return false;
    }

    this.isRefreshing = true;

    try {
      console.log('🔄 Refreshing tokens from service...');
      const newManifest = await fetchManifest(this.botToken, this.serviceUrl);

      if (!newManifest) {
        console.error('❌ Failed to refresh tokens - service unavailable');
        this.isRefreshing = false;
        return false;
      }

      this.manifest = newManifest;
      console.log('✅ Tokens refreshed successfully');
      this.isRefreshing = false;
      return true;
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      this.isRefreshing = false;
      return false;
    }
  }

  /**
   * Get a valid token for a category
   * Automatically refreshes if token is expired or missing
   */
  async getToken(category: string): Promise<{ accessToken: string; expiresAt: number } | null> {
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
    const isExpired = token.expiresAt <= now;
    const isExpiringSoon = token.expiresAt - now < twoMinutes;

    if (isExpired) {
      console.log(`⚠️  ${category} token expired, refreshing...`);
      const refreshed = await this.refreshTokens();
      if (!refreshed) {
        return null;
      }
      return (this.manifest!.tokens as any)[category] || null;
    }

    if (isExpiringSoon) {
      console.log(`⚠️  ${category} token expiring soon, refreshing...`);
      // Refresh in background, but return current token
      this.refreshTokens().catch(err => {
        console.error('Background token refresh failed:', err);
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
