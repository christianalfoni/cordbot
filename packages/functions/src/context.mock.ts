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
  Bot,
  Guild,
  User,
} from './context.js';

/**
 * Mock Firestore - all methods are vitest mocks
 */
export class MockFirestore implements IFirestore {
  getBot = vi.fn<[string, string], Promise<Bot | null>>();
  updateBot = vi.fn<[string, string, Partial<Bot>], Promise<void>>();
  queryBotByToken = vi.fn<[string], Promise<{ userId: string; botId: string; data: Bot } | null>>();
  deleteBot = vi.fn<[string, string], Promise<void>>();
  createBot = vi.fn<[string, string, Bot], Promise<void>>();
  queryBots = vi.fn<[string], Promise<Array<{ id: string; data: Bot }>>>();
  getGuild = vi.fn<[string], Promise<Guild | null>>();
  createGuild = vi.fn<[string, Guild], Promise<void>>();
  updateGuild = vi.fn<[string, Partial<Guild>], Promise<void>>();
  getUser = vi.fn<[string], Promise<User | null>>();
  updateUser = vi.fn<[string, Partial<User>], Promise<void>>();
}

/**
 * Mock HTTP Client - fetch is a vitest mock
 */
export class MockHttpClient implements IHttpClient {
  fetch = vi.fn<[string, RequestInit?], Promise<Response>>();
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
  info = vi.fn<[string, Record<string, unknown>?], void>();
  error = vi.fn<[string, unknown?], void>();
  warn = vi.fn<[string, Record<string, unknown>?], void>();
}

/**
 * Mock Function Context - combines all mock adapters
 */
export class MockFunctionContext implements FunctionContext {
  public readonly firestore: MockFirestore;
  public readonly http: MockHttpClient;
  public readonly secrets: MockSecretsManager;
  public readonly logger: MockLogger;

  constructor() {
    this.firestore = new MockFirestore();
    this.http = new MockHttpClient();
    this.secrets = new MockSecretsManager();
    this.logger = new MockLogger();
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
