import type { IDiscordAdapter } from './discord';
import type { IQueryExecutor } from './query';
import type { ISessionStore, IMemoryStore } from './storage';
import type { IScheduler } from './scheduler';
import type { ITokenProvider } from './token';
import type { ILogger } from './logger';
import type { IFileStore } from './file';
import type { IDocumentConverter } from './document';

/**
 * Bot context - central dependency injection container
 *
 * This interface provides access to all external dependencies and SDKs
 * that the bot needs. It enables dependency injection for testability
 * and makes it easy to swap implementations.
 */
export interface IBotContext {
  /**
   * The configured Discord guild ID from environment variable
   * This should ALWAYS be used instead of client.guilds.cache
   */
  guildId: string;

  /**
   * The home directory path (from HOME environment variable)
   * Use this instead of process.env.HOME or os.homedir()
   */
  homeDirectory: string;

  /**
   * Discord operations adapter
   */
  discord: IDiscordAdapter;

  /**
   * Claude query executor
   */
  queryExecutor: IQueryExecutor;

  /**
   * Session storage
   */
  sessionStore: ISessionStore;

  /**
   * Memory storage
   */
  memoryStore: IMemoryStore;

  /**
   * Task scheduler
   */
  scheduler: IScheduler;

  /**
   * OAuth token provider
   */
  tokenProvider: ITokenProvider;

  /**
   * Logger for all logging operations
   */
  logger: ILogger;

  /**
   * File system operations
   */
  fileStore: IFileStore;

  /**
   * Document conversion (docx ↔ markdown)
   */
  documentConverter: IDocumentConverter;
}

/**
 * Configuration for creating a bot context
 */
export interface BotContextConfig {
  discordToken: string;
  anthropicApiKey: string;
  guildId: string;
  workingDirectory: string;
  memoryContextSize?: number;
  serviceUrl?: string;
}
