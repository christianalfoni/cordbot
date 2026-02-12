import { Client, GatewayIntentBits } from 'discord.js';
import type { IBotContext, BotContextConfig } from '../interfaces/core.js';
import { DiscordJsAdapter } from './discord/adapter.js';
import { ClaudeSDKQueryExecutor } from './query/claude-sdk.js';
import { FileSystemSessionStore } from './storage/filesystem-session.js';
import { FileSystemMemoryStore } from './storage/filesystem-memory.js';
import { NodeCronScheduler } from './scheduler/node-cron.js';
import { ServiceTokenProvider } from './token/service-token.js';
import { ConsoleLogger } from './logger.js';
import { NodeFileStore } from './file/node-fs.js';
import { DocumentConverter } from './document/converter.js';
import { MemoryFileShareManager } from './file-sharing/memory-manager.js';
import { TokenManager } from '../service/token-manager.js';
import path from 'path';
import os from 'os';

/**
 * Create a production bot context with all real implementations
 * Returns the context and Discord client
 */
export async function createProductionBotContext(config: BotContextConfig): Promise<{
  context: IBotContext;
  discordClient: Client;
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

  // Get home directory from environment
  const homeDirectory = process.env.HOME || os.homedir();

  // Create Discord adapter
  const discord = new DiscordJsAdapter(discordClient);

  // Create query executor
  const queryExecutor = new ClaudeSDKQueryExecutor();

  // Create session store
  const storageDir = path.join(homeDirectory, '.claude', 'storage');
  const sessionStore = new FileSystemSessionStore(storageDir);

  // Create memory store
  const memoryStore = new FileSystemMemoryStore(homeDirectory);

  // Create scheduler
  const scheduler = new NodeCronScheduler();

  // Create token provider
  const serviceUrl = config.serviceUrl || process.env.SERVICE_URL || '';
  const tokenManager = new TokenManager(config.discordToken, serviceUrl, null);
  const tokenProvider = new ServiceTokenProvider(tokenManager);

  // Create logger
  const logger = new ConsoleLogger();

  // Create file store
  const fileStore = new NodeFileStore();

  // Create document converter
  const documentConverter = new DocumentConverter();

  // Create file share manager
  const fileShareManager = new MemoryFileShareManager();

  const context: IBotContext = {
    guildId: config.guildId,
    homeDirectory,
    discord,
    queryExecutor,
    sessionStore,
    memoryStore,
    scheduler,
    tokenProvider,
    logger,
    fileStore,
    documentConverter,
    fileShareManager,
  };

  return {
    context,
    discordClient, // Return raw client for SessionManager to load Discord tools
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
    'homeDirectory' in context &&
    'discord' in context &&
    'queryExecutor' in context &&
    'sessionStore' in context &&
    'memoryStore' in context &&
    'scheduler' in context &&
    'tokenProvider' in context &&
    'logger' in context
  );
}
