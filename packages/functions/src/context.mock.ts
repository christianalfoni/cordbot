/**
 * Mock Function Context Implementation
 *
 * Used for testing business logic without real Firebase/external APIs.
 * All methods are vitest mock functions (vi.fn()) that can be spied on and controlled.
 */

import { vi } from 'vitest';
import type {
  FunctionContext,
  IFirestore,
  IHttpClient,
  ISecretsManager,
  ILogger,
  IStripe,
  IAuth,
} from './context.js';

/**
 * Mock Firestore - all methods are vitest mocks
 */
export class MockFirestore implements IFirestore {
  getBot = vi.fn();
  updateBot = vi.fn();
  queryBotByToken = vi.fn();
  deleteBot = vi.fn();
  createBot = vi.fn();
  queryBots = vi.fn();
  getGuild = vi.fn();
  createGuild = vi.fn();
  updateGuild = vi.fn();
  deleteGuild = vi.fn();
  getUser = vi.fn();
  updateUser = vi.fn();
  deleteUser = vi.fn();
  getGuildDeployment = vi.fn();
  createGuildDeployment = vi.fn();
  updateGuildDeployment = vi.fn();
  deleteGuildDeployment = vi.fn();
  getFreeTierConfig = vi.fn();
  createFreeTierConfig = vi.fn();
  incrementFreeTierSlots = vi.fn();
  queryGuildsByUser = vi.fn();
  runTransaction = vi.fn();
  createSubscription = vi.fn();
  updateSubscription = vi.fn();
  getSubscription = vi.fn();
  getSubscriptionByGuild = vi.fn();
  createPayment = vi.fn();
  queryPayments = vi.fn();
  setBotVersion = vi.fn();
}

/**
 * Mock HTTP Client - fetch is a vitest mock
 */
export class MockHttpClient implements IHttpClient {
  fetch = vi.fn();
}

/**
 * Mock Secrets Manager - stores secrets in memory
 */
export class MockSecretsManager implements ISecretsManager {
  private secrets = new Map<string, string>();

  setSecret(name: string, value: string): void {
    this.secrets.set(name, value);
  }

  getSecret(name: string): string {
    const value = this.secrets.get(name);
    if (value === undefined) {
      throw new Error(`Secret ${name} not found`);
    }
    return value;
  }

  clearSecrets(): void {
    this.secrets.clear();
  }
}

/**
 * Mock Logger - all methods are vitest mocks
 */
export class MockLogger implements ILogger {
  info = vi.fn();
  error = vi.fn();
  warn = vi.fn();
}

/**
 * Mock Stripe - all methods are vitest mocks
 */
export class MockStripe implements IStripe {
  cancelSubscriptionImmediately = vi.fn();
}

/**
 * Mock Auth - all methods are vitest mocks
 */
export class MockAuth implements IAuth {
  deleteUser = vi.fn();
}

/**
 * Mock Function Context - combines all mock adapters
 */
export class MockFunctionContext implements FunctionContext {
  public readonly firestore: MockFirestore;
  public readonly http: MockHttpClient;
  public readonly secrets: MockSecretsManager;
  public readonly logger: MockLogger;
  public readonly stripe: MockStripe;
  public readonly auth: MockAuth;

  constructor() {
    this.firestore = new MockFirestore();
    this.http = new MockHttpClient();
    this.secrets = new MockSecretsManager();
    this.logger = new MockLogger();
    this.stripe = new MockStripe();
    this.auth = new MockAuth();
  }

  getCurrentTime = vi.fn(() => new Date('2024-01-01T00:00:00Z'));

  /**
   * Reset all mocks - call this in beforeEach to ensure clean test state
   */
  resetMocks(): void {
    vi.clearAllMocks();
    this.secrets.clearSecrets();
  }
}

/**
 * Helper to create a mock HTTP Response
 */
export function createMockResponse(options: {
  ok: boolean;
  status?: number;
  statusText?: string;
  data?: any;
}): Response {
  const { ok, status = ok ? 200 : 500, statusText = ok ? 'OK' : 'Error', data } = options;

  return {
    ok,
    status,
    statusText,
    json: vi.fn(async () => data),
    text: vi.fn(async () => JSON.stringify(data)),
  } as unknown as Response;
}
