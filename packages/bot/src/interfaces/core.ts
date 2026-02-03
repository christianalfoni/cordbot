import type { IDiscordAdapter } from './discord';
import type { IQueryExecutor } from './query';
import type { ISessionStore, IMemoryStore } from './storage';
import type { IScheduler } from './scheduler';
import type { IPermissionManager } from './permission';
import type { ITokenProvider } from './token';
import type { ILogger } from './logger';
import type { IFileStore } from './file';

/**
 * Bot context - central dependency injection container
 *
 * This interface provides access to all external dependencies and SDKs
 * that the bot needs. It enables dependency injection for testability
 * and makes it easy to swap implementations.
 */
export interface IBotContext {
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
   * Permission manager
   */
  permissionManager: IPermissionManager;

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
