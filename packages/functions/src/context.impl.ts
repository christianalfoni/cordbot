/**
 * Production Function Context Implementation
 *
 * Concrete implementations that wrap Firebase Admin SDK and external services.
 * These adapters should be simple wrappers with no business logic.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type {
  FunctionContext,
  IFirestore,
  IHttpClient,
  ISecretsManager,
  ILogger,
  Bot,
  Guild,
  User,
} from './context.js';

/**
 * Firestore adapter - wraps Firebase Admin Firestore operations
 */
class FirestoreAdapter implements IFirestore {
  private db = getFirestore();

  async getBot(userId: string, botId: string): Promise<Bot | null> {
    // First try to find in bots subcollection (legacy)
    const botDoc = await this.db
      .collection('users')
      .doc(userId)
      .collection('bots')
      .doc(botId)
      .get();

    if (botDoc.exists) {
      return botDoc.data() as Bot;
    }

    // If not found, try guilds collection (new OAuth-based model)
    const guildDoc = await this.db.collection('guilds').doc(botId).get();

    if (guildDoc.exists) {
      const guildData = guildDoc.data();
      // Verify this guild belongs to the user
      if (guildData?.userId === userId) {
        return guildData as unknown as Bot;
      }
    }

    return null;
  }

  async updateBot(userId: string, botId: string, data: Partial<Bot>): Promise<void> {
    // Try to update in bots subcollection first (legacy)
    const botDoc = await this.db
      .collection('users')
      .doc(userId)
      .collection('bots')
      .doc(botId)
      .get();

    if (botDoc.exists) {
      await botDoc.ref.update(data);
      return;
    }

    // If not found, try guilds collection (new OAuth-based model)
    const guildDoc = await this.db.collection('guilds').doc(botId).get();

    if (guildDoc.exists && guildDoc.data()?.userId === userId) {
      await guildDoc.ref.update(data);
      return;
    }

    throw new Error('Bot or guild not found');
  }

  async queryBotByToken(token: string): Promise<{ userId: string; botId: string; data: Bot } | null> {
    const snapshot = await this.db
      .collectionGroup('bots')
      .where('discordBotToken', '==', token)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const userId = doc.ref.parent.parent?.id;

    if (!userId) {
      return null;
    }

    return {
      userId,
      botId: doc.id,
      data: doc.data() as Bot,
    };
  }

  async deleteBot(userId: string, botId: string): Promise<void> {
    await this.db
      .collection('users')
      .doc(userId)
      .collection('bots')
      .doc(botId)
      .delete();
  }

  async createBot(userId: string, botId: string, data: Bot): Promise<void> {
    await this.db
      .collection('users')
      .doc(userId)
      .collection('bots')
      .doc(botId)
      .set(data);
  }

  async queryBots(userId: string): Promise<Array<{ id: string; data: Bot }>> {
    const snapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection('bots')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as Bot,
    }));
  }

  async getGuild(guildId: string): Promise<Guild | null> {
    const doc = await this.db.collection('guilds').doc(guildId).get();
    return doc.exists ? (doc.data() as Guild) : null;
  }

  async createGuild(guildId: string, data: Guild): Promise<void> {
    await this.db.collection('guilds').doc(guildId).set(data);
  }

  async updateGuild(guildId: string, data: Partial<Guild>): Promise<void> {
    await this.db.collection('guilds').doc(guildId).update(data);
  }

  async getUser(userId: string): Promise<User | null> {
    const doc = await this.db.collection('users').doc(userId).get();
    return doc.exists ? (doc.data() as User) : null;
  }

  async updateUser(userId: string, data: Partial<User>): Promise<void> {
    await this.db.collection('users').doc(userId).update(data);
  }
}

/**
 * HTTP client adapter - wraps fetch for external API calls
 */
class HttpClientAdapter implements IHttpClient {
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, options);
  }
}

/**
 * Secrets adapter - wraps Firebase secret definitions
 */
class SecretsAdapter implements ISecretsManager {
  private secrets: Map<string, any>;

  constructor(secretDefinitions?: Record<string, any>) {
    this.secrets = new Map(Object.entries(secretDefinitions || {}));
  }

  getSecret(name: string): string {
    const secret = this.secrets.get(name);
    if (!secret) {
      throw new Error(`Secret ${name} not found`);
    }
    return secret.value();
  }
}

/**
 * Logger adapter - wraps Firebase Functions logger
 */
class LoggerAdapter implements ILogger {
  info(message: string, meta?: Record<string, unknown>): void {
    logger.info(message, meta);
  }

  error(message: string, error?: unknown): void {
    logger.error(message, error);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    logger.warn(message, meta);
  }
}

/**
 * Production context - combines all production adapters
 */
export class ProductionFunctionContext implements FunctionContext {
  public readonly firestore: IFirestore;
  public readonly http: IHttpClient;
  public readonly secrets: ISecretsManager;
  public readonly logger: ILogger;

  constructor(secretDefinitions?: Record<string, any>) {
    this.firestore = new FirestoreAdapter();
    this.http = new HttpClientAdapter();
    this.secrets = new SecretsAdapter(secretDefinitions);
    this.logger = new LoggerAdapter();
  }

  getCurrentTime(): Date {
    return new Date();
  }
}
