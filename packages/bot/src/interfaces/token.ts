/**
 * OAuth token
 */
export interface Token {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
}

/**
 * Token category (e.g., 'gmail', 'calendar')
 */
export type TokenCategory = string;

/**
 * Token provider interface - handles OAuth token management
 */
export interface ITokenProvider {
  /**
   * Get a token for a category
   * @returns Token or null if not available
   */
  getToken(category: TokenCategory): Promise<Token | null>;

  /**
   * Refresh a token for a category
   * @returns True if refresh was successful
   */
  refreshToken(category: TokenCategory): Promise<boolean>;

  /**
   * Set a token for a category
   */
  setToken(category: TokenCategory, token: Token): Promise<void>;

  /**
   * Remove a token for a category
   */
  removeToken(category: TokenCategory): Promise<void>;

  /**
   * Check if a token exists for a category
   */
  hasToken(category: TokenCategory): Promise<boolean>;

  /**
   * Check if a token is expired
   */
  isTokenExpired(token: Token): boolean;
}
