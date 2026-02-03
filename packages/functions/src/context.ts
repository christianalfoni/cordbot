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

  // User operations
  getUser(userId: string): Promise<User | null>;
  updateUser(userId: string, data: Partial<User>): Promise<void>;
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
  status: 'pending' | 'provisioning' | 'active' | 'error';
  installedBy: string;
  userId?: string;
  permissions: string;
  memoryContextSize: number;
  appName?: string;
  machineId?: string;
  volumeId?: string;
  region?: string;
  provisionedAt?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  errorMessage?: string;
}

export interface User {
  hostingBetaRequested?: boolean;
  hostingBetaRequestedAt?: string;
  hostingBetaApproved?: boolean;
}
