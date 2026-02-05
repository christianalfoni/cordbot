// Context Interface - Defines all application capabilities
import type {
  User,
  UserData,
  GuildStatus,
  GuildLogs,
  Subscription,
  BotValidationResult,
  GmailAuthResult,
  DiscordOAuthParams,
  SubscriptionCheckoutResult,
  Unsubscribe,
  AuthStateListener,
  UserDataListener,
  GuildsListener,
  SubscriptionListener,
  Logger,
} from './types';

export interface AppContext {
  // ============ Authentication ============

  /**
   * Sign in with Discord OAuth
   * @returns The authenticated user
   */
  signInWithDiscord(): Promise<User>;

  /**
   * Sign out the current user
   */
  signOut(): Promise<void>;

  /**
   * Watch authentication state changes
   * @param listener Callback fired when auth state changes
   * @returns Unsubscribe function
   */
  watchAuthState(listener: AuthStateListener): Unsubscribe;

  /**
   * Get the current authenticated user (synchronous)
   * @returns Current user or null
   */
  getCurrentUser(): User | null;

  // ============ User Data ============

  /**
   * Get user data from Firestore (one-time fetch)
   * @param userId The user's Firebase UID
   * @returns User data or null
   */
  getUserData(userId: string): Promise<UserData | null>;

  /**
   * Watch user data changes in real-time
   * @param userId The user's Firebase UID
   * @param listener Callback fired when user data changes
   * @returns Unsubscribe function
   */
  watchUserData(userId: string, listener: UserDataListener): Unsubscribe;

  /**
   * Update user data
   * @param userId The user's Firebase UID
   * @param data Partial user data to update
   */
  updateUserData(userId: string, data: Partial<UserData>): Promise<void>;

  // ============ Guilds ============

  /**
   * Watch user's guilds in real-time
   * @param userId The user's Firebase UID
   * @param listener Callback fired when guilds change
   * @returns Unsubscribe function
   */
  watchUserGuilds(userId: string, listener: GuildsListener): Unsubscribe;

  /**
   * Get guild status from Fly.io
   * @param guildId The guild ID
   * @returns Guild status information
   */
  getGuildStatus(guildId: string): Promise<GuildStatus>;

  /**
   * Get guild logs from Fly.io
   * @param guildId The guild ID
   * @returns Guild logs
   */
  getGuildLogs(guildId: string): Promise<GuildLogs>;

  /**
   * Restart a guild's bot instance
   * @param guildId The guild ID
   */
  restartGuild(guildId: string): Promise<void>;

  /**
   * Deploy an update to a guild's bot
   * @param guildId The guild ID
   * @param version The version to deploy
   */
  deployGuildUpdate(guildId: string, version: string): Promise<void>;

  /**
   * Deprovision a guild's bot instance
   * @param guildId The guild ID
   */
  deprovisionGuild(guildId: string): Promise<void>;

  /**
   * Trigger provisioning for a paid tier guild
   * @param guildId The guild ID
   */
  triggerPaidTierProvisioning(guildId: string): Promise<void>;

  // ============ Subscriptions ============

  /**
   * Get a subscription (one-time fetch)
   * @param subscriptionId The subscription ID
   * @returns Subscription data or null
   */
  getSubscription(subscriptionId: string): Promise<Subscription | null>;

  /**
   * Watch subscription changes in real-time
   * @param subscriptionId The subscription ID
   * @param listener Callback fired when subscription changes
   * @returns Unsubscribe function
   */
  watchSubscription(subscriptionId: string, listener: SubscriptionListener): Unsubscribe;

  /**
   * Create a guild subscription and get Stripe checkout URL
   * @param guildId The guild ID
   * @param tier The subscription tier
   * @param userId The user's Firebase UID
   * @param successUrl URL to redirect on success
   * @param cancelUrl URL to redirect on cancel
   * @returns Checkout session with URL
   */
  createGuildSubscription(
    guildId: string,
    tier: 'starter' | 'pro',
    userId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<SubscriptionCheckoutResult>;

  /**
   * Create a Stripe billing portal session
   * @param userId The user's Firebase UID
   * @param returnUrl URL to return to after managing billing
   * @returns Portal session URL
   */
  createBillingPortal(userId: string, returnUrl: string): Promise<{ url: string }>;

  // ============ OAuth ============

  /**
   * Process Discord OAuth callback
   * @param params OAuth parameters from callback
   */
  processDiscordOAuth(params: DiscordOAuthParams): Promise<void>;

  /**
   * Initiate Gmail OAuth flow (redirects user)
   * @param userId The user's Firebase UID
   * @param botId The bot ID to associate with
   */
  initiateGmailOAuth(userId: string, botId: string): void;

  /**
   * Exchange Gmail OAuth code for tokens
   * @param code The OAuth code
   * @param userId The user's Firebase UID
   * @param botId The bot ID
   * @param redirectUri The redirect URI used in OAuth
   * @returns Result with success status and email
   */
  exchangeGmailToken(
    code: string,
    userId: string,
    botId: string,
    redirectUri: string
  ): Promise<GmailAuthResult>;

  /**
   * Disconnect Gmail from a bot
   * @param userId The user's Firebase UID
   * @param botId The bot ID
   */
  disconnectGmail(userId: string, botId: string): Promise<void>;

  // ============ Bot Token Validation ============

  /**
   * Validate a Discord bot token
   * @param botToken The Discord bot token
   * @returns Validation result with bot info and guilds
   */
  validateBotToken(botToken: string): Promise<BotValidationResult>;

  /**
   * Save bot token to user document
   * @param userId The user's Firebase UID
   * @param botToken The Discord bot token
   */
  saveBotToken(userId: string, botToken: string): Promise<void>;

  /**
   * Save guild selection to user document
   * @param userId The user's Firebase UID
   * @param guildId The selected guild ID
   */
  saveGuildSelection(userId: string, guildId: string): Promise<void>;

  /**
   * Clear bot token and guild selection from user document
   * @param userId The user's Firebase UID
   */
  clearBotToken(userId: string): Promise<void>;

  // ============ Utilities ============

  /**
   * Logger for application logging
   */
  logger: Logger;

  /**
   * Get current time (useful for testing)
   * @returns Current date
   */
  getCurrentTime(): Date;

  /**
   * Generate OAuth state parameter
   * @param data Data to encode in state
   * @returns Base64 encoded state
   */
  generateOAuthState(data: Record<string, unknown>): string;

  /**
   * Parse OAuth state parameter
   * @param state Base64 encoded state
   * @returns Decoded data
   */
  parseOAuthState(state: string): Record<string, unknown>;

  /**
   * Open external URL (for OAuth redirects)
   * @param url URL to open
   */
  openExternalUrl(url: string): void;
}
