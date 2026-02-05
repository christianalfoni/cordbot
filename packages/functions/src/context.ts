/**
 * Function Context Interface Pattern
 *
 * This file defines all interfaces for external dependencies used by Firebase Functions.
 * Business logic receives these interfaces, never direct Firebase/external API imports.
 */

/**
 * Main context interface containing all capabilities Firebase Functions need
 */
export interface FunctionContext {
  firestore: IFirestore;
  http: IHttpClient;
  secrets: ISecretsManager;
  logger: ILogger;
  stripe: IStripe;
  getCurrentTime(): Date;
}

/**
 * Firestore operations interface
 */
export interface IFirestore {
  // Bot operations
  getBot(userId: string, botId: string): Promise<Bot | null>;
  updateBot(userId: string, botId: string, data: Partial<Bot>): Promise<void>;
  queryBotByToken(token: string): Promise<{ userId: string; botId: string; data: Bot } | null>;
  deleteBot(userId: string, botId: string): Promise<void>;
  createBot(userId: string, botId: string, data: Bot): Promise<void>;
  queryBots(userId: string): Promise<Array<{ id: string; data: Bot }>>;

  // Guild operations
  getGuild(guildId: string): Promise<Guild | null>;
  createGuild(guildId: string, data: Guild): Promise<void>;
  updateGuild(guildId: string, data: Partial<Guild>): Promise<void>;
  deleteGuild(guildId: string): Promise<void>;

  // Guild deployment operations
  getGuildDeployment(guildId: string): Promise<GuildDeployment | null>;
  createGuildDeployment(guildId: string, data: GuildDeployment): Promise<void>;
  updateGuildDeployment(guildId: string, data: Partial<GuildDeployment>): Promise<void>;
  deleteGuildDeployment(guildId: string): Promise<void>;

  // Free tier config operations
  getFreeTierConfig(): Promise<FreeTierConfig | null>;
  createFreeTierConfig(data: FreeTierConfig): Promise<void>;
  incrementFreeTierSlots(amount: number): Promise<void>;

  // Query operations
  queryGuildsByUser(userId: string): Promise<Array<{ id: string; data: Guild }>>;

  // Transaction support
  runTransaction<T>(updateFunction: (transaction: FirestoreTransaction) => Promise<T>): Promise<T>;

  // User operations
  getUser(userId: string): Promise<User | null>;
  updateUser(userId: string, data: Partial<User>): Promise<void>;

  // Subscription operations
  createSubscription(id: string, data: Subscription): Promise<void>;
  updateSubscription(id: string, data: Partial<Subscription>): Promise<void>;
  getSubscription(id: string): Promise<Subscription | null>;
  getSubscriptionByGuild(guildId: string): Promise<{ id: string; data: Subscription } | null>;

  // Payment operations
  createPayment(subscriptionId: string, paymentId: string, data: Payment): Promise<void>;
  queryPayments(subscriptionId: string): Promise<Array<{ id: string; data: Payment }>>;
}

/**
 * HTTP client interface for external API calls
 */
export interface IHttpClient {
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

/**
 * Secrets management interface
 */
export interface ISecretsManager {
  getSecret(name: string): string;
}

/**
 * Logging interface
 */
export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Stripe operations interface
 */
export interface IStripe {
  cancelSubscriptionImmediately(subscriptionId: string): Promise<void>;
}

// Type definitions

export interface Bot {
  botName: string;
  botDiscordUsername?: string;
  mode: 'personal' | 'shared';
  status: 'pending' | 'provisioning' | 'active' | 'error' | 'stopped';
  discordBotToken: string;
  discordGuildId: string;
  memoryContextSize: number;
  oauthConnections: {
    gmail?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
      email: string;
      scope: string;
      connectedAt: string;
    };
  };
  toolsConfig: Record<string, string[]>;
  appName?: string;
  machineId?: string;
  volumeId?: string;
  region?: string;
  version?: string;
  provisionedAt?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  errorMessage?: string;
  lastRestartedAt?: string;
  lastDeployedAt?: string;
}

export interface Guild {
  guildName: string;
  guildIcon: string | null;
  status: 'pending' | 'provisioning' | 'active' | 'error' | 'suspended' | 'deprovisioning' | 'deleted';
  userId: string;       // Firebase Auth UID
  tier?: 'free' | 'starter' | 'pro' | 'business';  // Selected tier (used during provisioning)
  subscriptionId?: string | null;  // Links to subscriptions/{subscriptionId}
  createdAt: string;
  updatedAt: string;
  error?: string;
  errorMessage?: string;
  suspendedReason?: string;
  suspendedAt?: string;
  // Bot configuration
  memoryContextSize: number;
  // Billing period
  periodStart: string;
  periodEnd: string | null;
  // Deployment tracking
  lastDeployedAt: string;
}

export interface User {
  hostingBetaRequested?: boolean;
  hostingBetaRequestedAt?: string;
  hostingBetaApproved?: boolean;
  stripeCustomerId?: string;
  freeTierBotDeployed?: boolean;      // Flag to track if user has deployed a free tier bot
  freeTierBotDeployedAt?: string;     // Timestamp of when free tier bot was deployed
}

export interface GuildDeployment {
  guildId: string;
  deploymentType: 'free' | 'starter' | 'pro' | 'business';
  queriesTotal: number;
  queriesRemaining: number;
  queriesUsed: number;
  totalCost: number;
  costThisPeriod: number;
  queryTypes: Record<string, number>;
  costByType: Record<string, number>;
  lastQueryAt: string;
  firstQueryAt?: string;
  createdAt: string;
  updatedAt: string;
  // Fly.io infrastructure details
  appName: string;
  machineId: string;
  volumeId: string;
  region: string;
  // Denormalized subscription data (copied from subscription document)
  subscriptionId?: string | null;
  subscriptionStatus?: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | null;
  subscriptionPeriodEnd?: string | null;
}

export interface FreeTierConfig {
  maxSlots: number;
  usedSlots: number;
  queriesPerSlot: number;
}

export interface Subscription {
  id: string;                          // Stripe subscription ID (document ID)
  userId: string;                      // Firebase Auth UID
  customerId: string;                  // Stripe customer ID
  guildId: string;                     // Discord guild ID (from Stripe metadata)
  tier: 'starter' | 'pro';
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  priceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;                          // Payment document ID
  invoiceId: string;                   // Stripe invoice ID
  amountPaid: number;                  // Amount in cents
  currency: string;                    // e.g., "usd"
  status: 'succeeded' | 'failed';
  periodStart: string;
  periodEnd: string;
  paidAt: string;
  createdAt: string;
}

export interface FirestoreTransaction {
  getGuild(guildId: string): Promise<Guild | null>;
  getGuildDeployment(guildId: string): Promise<GuildDeployment | null>;
  updateGuild(guildId: string, data: Partial<Guild>): Promise<void>;
  updateGuildDeployment(guildId: string, data: Partial<GuildDeployment>): Promise<void>;
}
