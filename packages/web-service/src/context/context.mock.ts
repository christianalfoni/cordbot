// Mock Context for Testing
import { vi } from 'vitest';
import type { AppContext } from './context';
import type {
  User,
  UserData,
  GuildStatus,
  GuildLogs,
  Subscription,
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

type MockFn<T extends (...args: any[]) => any> = ReturnType<typeof vi.fn<T>>;

export class MockContext implements AppContext {
  // Auth
  signInWithDiscord: MockFn<() => Promise<User>> = vi.fn();
  signOut: MockFn<() => Promise<void>> = vi.fn();
  watchAuthState: MockFn<(listener: AuthStateListener) => Unsubscribe> = vi.fn();
  getCurrentUser: MockFn<() => User | null> = vi.fn();

  // User Data
  getUserData: MockFn<(userId: string) => Promise<UserData | null>> = vi.fn();
  watchUserData: MockFn<(userId: string, listener: UserDataListener) => Unsubscribe> = vi.fn();
  updateUserData: MockFn<(userId: string, data: Partial<UserData>) => Promise<void>> = vi.fn();

  // Guilds
  watchUserGuilds: MockFn<(userId: string, listener: GuildsListener) => Unsubscribe> = vi.fn();
  getGuildStatus: MockFn<(guildId: string) => Promise<GuildStatus>> = vi.fn();
  getGuildLogs: MockFn<(guildId: string) => Promise<GuildLogs>> = vi.fn();
  restartGuild: MockFn<(guildId: string) => Promise<void>> = vi.fn();
  deployGuildUpdate: MockFn<(guildId: string, version: string) => Promise<void>> = vi.fn();
  deprovisionGuild: MockFn<(guildId: string) => Promise<void>> = vi.fn();
  triggerPaidTierProvisioning: MockFn<(guildId: string) => Promise<void>> = vi.fn();

  // Subscriptions
  getSubscription: MockFn<(subscriptionId: string) => Promise<Subscription | null>> = vi.fn();
  watchSubscription: MockFn<(subscriptionId: string, listener: SubscriptionListener) => Unsubscribe> = vi.fn();
  createGuildSubscription: MockFn<
    (guildId: string, tier: 'starter' | 'pro', userId: string, successUrl: string, cancelUrl: string) => Promise<SubscriptionCheckoutResult>
  > = vi.fn();
  createBillingPortal: MockFn<(userId: string, returnUrl: string) => Promise<{ url: string }>> = vi.fn();

  // OAuth
  processDiscordOAuth: MockFn<(params: DiscordOAuthParams) => Promise<void>> = vi.fn();
  initiateGmailOAuth: MockFn<(userId: string, botId: string) => void> = vi.fn();
  exchangeGmailToken: MockFn<(code: string, userId: string, botId: string, redirectUri: string) => Promise<GmailAuthResult>> = vi.fn();
  disconnectGmail: MockFn<(userId: string, botId: string) => Promise<void>> = vi.fn();

  // Utilities
  logger: Logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  getCurrentTime: MockFn<() => Date> = vi.fn(() => new Date('2024-01-01T00:00:00Z'));
  generateOAuthState: MockFn<(data: Record<string, unknown>) => string> = vi.fn(
    (data: Record<string, unknown>) => btoa(JSON.stringify(data))
  );
  parseOAuthState: MockFn<(state: string) => Record<string, unknown>> = vi.fn(
    (state: string) => JSON.parse(atob(state))
  );
  openExternalUrl: MockFn<(url: string) => void> = vi.fn();

  constructor() {
    // Setup default return values for watch functions
    this.watchAuthState.mockReturnValue(() => {});
    this.watchUserData.mockReturnValue(() => {});
    this.watchUserGuilds.mockReturnValue(() => {});
    this.watchSubscription.mockReturnValue(() => {});

    // Setup default return values for async functions
    this.getCurrentUser.mockReturnValue(null);
  }

  /**
   * Reset all mocks
   */
  reset(): void {
    Object.values(this).forEach((value) => {
      if (typeof value === 'function' && 'mockReset' in value) {
        (value as ReturnType<typeof vi.fn>).mockReset();
      } else if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach((nestedValue) => {
          if (
            typeof nestedValue === 'function' &&
            'mockReset' in nestedValue
          ) {
            (nestedValue as ReturnType<typeof vi.fn>).mockReset();
          }
        });
      }
    });

    // Re-setup defaults after reset
    this.watchAuthState.mockReturnValue(() => {});
    this.watchUserData.mockReturnValue(() => {});
    this.watchUserGuilds.mockReturnValue(() => {});
    this.watchSubscription.mockReturnValue(() => {});
    this.getCurrentUser.mockReturnValue(null);
    this.getCurrentTime.mockReturnValue(new Date('2024-01-01T00:00:00Z'));
    this.generateOAuthState.mockImplementation(
      (data: Record<string, unknown>) => btoa(JSON.stringify(data))
    );
    this.parseOAuthState.mockImplementation((state: string) => JSON.parse(atob(state)));
  }
}
