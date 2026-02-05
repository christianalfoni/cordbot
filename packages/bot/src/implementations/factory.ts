import { Client, GatewayIntentBits } from 'discord.js';
import type { IBotContext, BotContextConfig } from '../interfaces/core.js';
import type { IPermissionManager } from '../interfaces/permission.js';
import { DiscordJsAdapter } from './discord/adapter.js';
import { ClaudeSDKQueryExecutor } from './query/claude-sdk.js';
import { FileSystemSessionStore } from './storage/filesystem-session.js';
import { FileSystemMemoryStore } from './storage/filesystem-memory.js';
import { NodeCronScheduler } from './scheduler/node-cron.js';
import { DiscordPermissionManager } from './permission/discord-permission.js';
import { ServiceTokenProvider } from './token/service-token.js';
import { ConsoleLogger } from './logger.js';
import { NodeFileStore } from './file/node-fs.js';
import { TokenManager } from '../service/token-manager.js';
import path from 'path';
import os from 'os';

/**
 * Create a production bot context with all real implementations
 * Returns the context, Discord client, and permission manager for Discord tools
 */
export async function createProductionBotContext(config: BotContextConfig): Promise<{
  context: IBotContext;
  discordClient: Client;
  permissionManager: IPermissionManager;
}> {
  // Create Discord client
  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // Wait for client to be ready
  await new Promise<void>((resolve, reject) => {
    discordClient.once('clientReady', () => {
      console.log(`✅ Discord bot logged in as ${discordClient.user?.tag}`);
      resolve();
    });

    discordClient.once('error', (error) => {
      console.error('❌ Discord client error:', error);
      reject(error);
    });

    discordClient.login(config.discordToken).catch(reject);
  });

  // Create Discord adapter
  const discord = new DiscordJsAdapter(discordClient);

  // Create query executor
  const queryExecutor = new ClaudeSDKQueryExecutor();

  // Create session store
  const storageDir = path.join(os.homedir(), '.claude', 'storage');
  const sessionStore = new FileSystemSessionStore(storageDir);

  // Create memory store
  const memoryStore = new FileSystemMemoryStore();

  // Create scheduler
  const scheduler = new NodeCronScheduler();

  // Create permission manager
  const permissionManager = new DiscordPermissionManager();

  // Create token provider
  const serviceUrl = config.serviceUrl || process.env.SERVICE_URL || '';
  const tokenManager = new TokenManager(config.discordToken, serviceUrl, null);
  const tokenProvider = new ServiceTokenProvider(tokenManager);

  // Create logger
  const logger = new ConsoleLogger();

  // Create file store
  const fileStore = new NodeFileStore();

  const context: IBotContext = {
    guildId: config.guildId,
    discord,
    queryExecutor,
    sessionStore,
    memoryStore,
    scheduler,
    permissionManager,
    tokenProvider,
    logger,
    fileStore,
  };

  return {
    context,
    discordClient, // Return raw client for SessionManager to load Discord tools
    permissionManager, // Return permission manager for Discord tools
  };
}

/**
 * Type guard to check if a context is valid
 */
export function isValidBotContext(context: any): context is IBotContext {
  return (
    context &&
    typeof context === 'object' &&
    'guildId' in context &&
    'discord' in context &&
    'queryExecutor' in context &&
    'sessionStore' in context &&
    'memoryStore' in context &&
    'scheduler' in context &&
    'permissionManager' in context &&
    'tokenProvider' in context &&
    'logger' in context
  );
}
