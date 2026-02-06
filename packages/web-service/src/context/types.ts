// Application types - No Firebase imports allowed

export interface User {
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface ToolCategory {
  id: string;
  name: string;
  description: string;
  authType: 'oauth2' | 'api_key' | 'none';
  connected: boolean;
  dependencies?: string[];
  tools: Array<{
    id: string;
    name: string;
    description: string;
    permissionLevel: 'read' | 'write';
    enabled: boolean;
  }>;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ToolsManifest {
  categories: ToolCategory[];
  tokens: {
    [categoryId: string]: OAuthToken;
  };
}

export interface GmailConnection {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  scope: string;
  connectedAt: string;
}

export interface UserData {
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  discordId?: string;
  discordUsername?: string;
  createdAt: string;
  lastLoginAt: string;
  memoryContextSize?: number;
  toolsManifest?: ToolsManifest;
  oauthConnections?: {
    gmail?: GmailConnection;
  };
  toolsConfig?: {
    [domain: string]: string[];
  };
  freeTierBotDeployed?: boolean;
  freeTierBotDeployedAt?: string;
  notifyFreeTier?: boolean;
}

export interface Guild {
  id: string;
  guildName: string;
  guildIcon: string | null;
  status: 'pending' | 'provisioning' | 'active' | 'error' | 'suspended' | 'deprovisioning' | 'deleted';
  tier?: 'free' | 'starter' | 'pro' | 'business';
  subscriptionId?: string | null;
  appName?: string;
  machineId?: string;
  volumeId?: string;
  region?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  provisionedAt?: string;
  memoryContextSize: number;
}

export interface GuildStatus {
  status: 'provisioning' | 'running' | 'stopped' | 'error';
  state: string;
  region: string;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    type: string;
    status: string;
    timestamp: number;
  }>;
}

export interface GuildLogs {
  message: string;
  cliCommand: string;
  machineCommand: string;
}

export interface Subscription {
  id: string;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';
  tier: 'starter' | 'pro';
}

export interface GmailAuthResult {
  success: boolean;
  email?: string;
  error?: string;
}

export interface DiscordOAuthParams {
  code: string;
  guildId: string;
  permissions: string;
  redirectUri: string;
  tier: 'free' | 'starter' | 'pro' | 'business';
}

export interface SubscriptionCheckoutResult {
  url: string;
}

// Listener types
export type Unsubscribe = () => void;
export type AuthStateListener = (user: User | null) => void;
export type UserDataListener = (userData: UserData | null) => void;
export type GuildsListener = (guilds: Guild[]) => void;
export type SubscriptionListener = (subscription: Subscription | null) => void;

// Logger interface
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}
