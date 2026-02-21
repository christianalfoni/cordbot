/**
 * Production Function Context Implementation
 *
 * Concrete implementations that wrap Firebase Admin SDK and external services.
 * These adapters should be simple wrappers with no business logic.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions/v2';
import type {
  FunctionContext,
  IFirestore,
  IHttpClient,
  ISecretsManager,
  ILogger,
  IStripe,
  IAuth,
  Bot,
  Guild,
  User,
  GuildDeployment,
  FreeTierConfig,
  FirestoreTransaction,
  Subscription,
  Payment,
} from './context.js';
import { FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';

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

  async deleteGuild(guildId: string): Promise<void> {
    await this.db.collection('guilds').doc(guildId).delete();
  }

  async getUser(userId: string): Promise<User | null> {
    const doc = await this.db.collection('users').doc(userId).get();
    return doc.exists ? (doc.data() as User) : null;
  }

  async updateUser(userId: string, data: Partial<User>): Promise<void> {
    await this.db.collection('users').doc(userId).update(data);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.collection('users').doc(userId).delete();
  }

  async getGuildDeployment(guildId: string): Promise<GuildDeployment | null> {
    const doc = await this.db.collection('guildDeployments').doc(guildId).get();
    return doc.exists ? (doc.data() as GuildDeployment) : null;
  }

  async createGuildDeployment(guildId: string, data: GuildDeployment): Promise<void> {
    await this.db.collection('guildDeployments').doc(guildId).set(data);
  }

  async updateGuildDeployment(guildId: string, data: Partial<GuildDeployment>): Promise<void> {
    await this.db.collection('guildDeployments').doc(guildId).update(data);
  }

  async deleteGuildDeployment(guildId: string): Promise<void> {
    await this.db.collection('guildDeployments').doc(guildId).delete();
  }

  async getFreeTierConfig(): Promise<FreeTierConfig | null> {
    const doc = await this.db.collection('config').doc('freeTier').get();
    return doc.exists ? (doc.data() as FreeTierConfig) : null;
  }

  async createFreeTierConfig(data: FreeTierConfig): Promise<void> {
    await this.db.collection('config').doc('freeTier').set(data);
  }

  async incrementFreeTierSlots(amount: number): Promise<void> {
    await this.db.collection('config').doc('freeTier').update({
      usedSlots: FieldValue.increment(amount),
    });
  }

  async queryGuildsByUser(userId: string): Promise<Array<{ id: string; data: Guild }>> {
    const snapshot = await this.db
      .collection('guilds')
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Guild }));
  }

  async runTransaction<T>(updateFunction: (transaction: FirestoreTransaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (firestoreTransaction) => {
      const transactionAdapter = new FirestoreTransactionAdapter(firestoreTransaction, this.db);
      return updateFunction(transactionAdapter);
    });
  }

  async createSubscription(id: string, data: Subscription): Promise<void> {
    await this.db.collection('subscriptions').doc(id).set(data);
  }

  async updateSubscription(id: string, data: Partial<Subscription>): Promise<void> {
    await this.db.collection('subscriptions').doc(id).update(data);
  }

  async getSubscription(id: string): Promise<Subscription | null> {
    const doc = await this.db.collection('subscriptions').doc(id).get();
    return doc.exists ? (doc.data() as Subscription) : null;
  }

  async getSubscriptionByGuild(guildId: string): Promise<{ id: string; data: Subscription } | null> {
    const snapshot = await this.db
      .collection('subscriptions')
      .where('guildId', '==', guildId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      data: doc.data() as Subscription,
    };
  }

  async createPayment(subscriptionId: string, paymentId: string, data: Payment): Promise<void> {
    await this.db
      .collection('subscriptions')
      .doc(subscriptionId)
      .collection('payments')
      .doc(paymentId)
      .set(data);
  }

  async queryPayments(subscriptionId: string): Promise<Array<{ id: string; data: Payment }>> {
    const snapshot = await this.db
      .collection('subscriptions')
      .doc(subscriptionId)
      .collection('payments')
      .orderBy('paidAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as Payment,
    }));
  }

  async setBotVersion(version: string, publishedAt: string): Promise<void> {
    await this.db.collection('config').doc('botVersion').set({
      latestVersion: version,
      publishedAt,
    });
  }
}

/**
 * Firestore transaction adapter - wraps Firestore Transaction
 */
class FirestoreTransactionAdapter implements FirestoreTransaction {
  constructor(
    private transaction: FirebaseFirestore.Transaction,
    private db: FirebaseFirestore.Firestore
  ) {}

  async getGuild(guildId: string): Promise<Guild | null> {
    const docRef = this.db.collection('guilds').doc(guildId);
    const doc = await this.transaction.get(docRef);
    return doc.exists ? (doc.data() as Guild) : null;
  }

  async getGuildDeployment(guildId: string): Promise<GuildDeployment | null> {
    const docRef = this.db.collection('guildDeployments').doc(guildId);
    const doc = await this.transaction.get(docRef);
    return doc.exists ? (doc.data() as GuildDeployment) : null;
  }

  async updateGuild(guildId: string, data: Partial<Guild>): Promise<void> {
    const docRef = this.db.collection('guilds').doc(guildId);
    this.transaction.update(docRef, data);
  }

  async updateGuildDeployment(guildId: string, data: Partial<GuildDeployment>): Promise<void> {
    const docRef = this.db.collection('guildDeployments').doc(guildId);
    this.transaction.update(docRef, data);
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
 * Auth adapter - wraps Firebase Auth operations
 */
class AuthAdapter implements IAuth {
  async deleteUser(userId: string): Promise<void> {
    const auth = getAuth();
    await auth.deleteUser(userId);
  }
}

/**
 * Stripe adapter - wraps Stripe SDK operations
 */
class StripeAdapter implements IStripe {
  private stripe: Stripe | null = null;

  constructor(private secrets: ISecretsManager) {
    // Lazy initialization - only create Stripe client when needed
  }

  private getStripeClient(): Stripe {
    if (!this.stripe) {
      const apiKey = this.secrets.getSecret('STRIPE_API_KEY');
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2026-01-28.clover',
      });
    }
    return this.stripe;
  }

  async cancelSubscriptionImmediately(subscriptionId: string): Promise<void> {
    const stripe = this.getStripeClient();
    await stripe.subscriptions.cancel(subscriptionId);
  }
}

export class ProductionFunctionContext implements FunctionContext {
  public readonly firestore: IFirestore;
  public readonly http: IHttpClient;
  public readonly secrets: ISecretsManager;
  public readonly logger: ILogger;
  public readonly stripe: IStripe;
  public readonly auth: IAuth;

  constructor(secretDefinitions?: Record<string, any>) {
    this.firestore = new FirestoreAdapter();
    this.http = new HttpClientAdapter();
    this.secrets = new SecretsAdapter(secretDefinitions);
    this.logger = new LoggerAdapter();
    this.stripe = new StripeAdapter(this.secrets);
    this.auth = new AuthAdapter();
  }

  getCurrentTime(): Date {
    return new Date();
  }
}
