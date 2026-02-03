# Firebase Functions Architecture Guide: Context Interface Pattern

## Core Philosophy

Separate Firebase Functions into two layers:

1. **Business Logic** - Pure TypeScript that describes _what_ happens (domain logic)
2. **Function Context** - Implementations of _how_ things happen (Firestore, external APIs, OAuth, secrets)

Your business logic should never directly import Firebase Admin SDK, external APIs, or other I/O operations. Instead, it receives a `FunctionContext` interface that provides all capabilities it needs.

## Pattern Overview

### The Function Context Interface

Define an interface containing all external capabilities your Firebase Function needs:

```typescript
// context.ts
export interface FunctionContext {
  // Firestore operations
  firestore: IFirestore;

  // External API calls
  http: IHttpClient;

  // Secrets management
  secrets: ISecretsManager;

  // Logging
  logger: ILogger;

  // Time utilities (for testing)
  getCurrentTime(): Date;
}

export interface IFirestore {
  getBot(userId: string, botId: string): Promise<Bot | null>;
  updateBot(userId: string, botId: string, data: Partial<Bot>): Promise<void>;
  queryBotByToken(token: string): Promise<{ userId: string; botId: string; data: Bot } | null>;
  getGuild(guildId: string): Promise<Guild | null>;
  createGuild(guildId: string, data: Guild): Promise<void>;
}

export interface IHttpClient {
  fetch(url: string, options?: RequestInit): Promise<Response>;
}

export interface ISecretsManager {
  getSecret(name: string): string;
}

export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}
```

### The Business Logic

Your business logic accepts the context and implements domain operations:

```typescript
// oauth-service.ts
import { FunctionContext } from "./context";
import { HttpsError } from "firebase-functions/v2/https";

export class OAuthService {
  constructor(private ctx: FunctionContext) {}

  async exchangeGmailToken(params: {
    code: string;
    userId: string;
    botId: string;
    redirectUri: string;
  }): Promise<{ success: true; email: string }> {
    const { code, userId, botId, redirectUri } = params;

    // Business logic - orchestration without direct dependencies
    this.ctx.logger.info('Attempting token exchange', {
      redirectUri,
      hasCode: !!code,
    });

    // Exchange code for tokens via HTTP client
    const tokenResponse = await this.ctx.http.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.ctx.secrets.getSecret('GOOGLE_CLIENT_ID'),
        client_secret: this.ctx.secrets.getSecret('GOOGLE_CLIENT_SECRET'),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      this.ctx.logger.error('Failed to exchange OAuth code:', errorData);
      throw new HttpsError('internal', 'Failed to exchange authorization code');
    }

    const tokens = await tokenResponse.json();

    // Fetch user info
    const userInfoResponse = await this.ctx.http.fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!userInfoResponse.ok) {
      throw new HttpsError('internal', 'Failed to fetch user info');
    }

    const userInfo = await userInfoResponse.json();

    // Store tokens in Firestore
    await this.ctx.firestore.updateBot(userId, botId, {
      oauthConnections: {
        gmail: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in * 1000),
          email: userInfo.email,
          scope: tokens.scope,
          connectedAt: this.ctx.getCurrentTime().toISOString(),
        },
      },
    });

    this.ctx.logger.info(`Gmail connected for bot ${botId}: ${userInfo.email}`);

    return { success: true, email: userInfo.email };
  }
}
```

### The Production Implementation

Create concrete implementations that wrap Firebase Admin SDK and external services:

```typescript
// context.impl.ts
import { FunctionContext, IFirestore, IHttpClient, ISecretsManager, ILogger } from "./context";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

class FirestoreAdapter implements IFirestore {
  private db = getFirestore();

  async getBot(userId: string, botId: string) {
    const doc = await this.db
      .collection('users')
      .doc(userId)
      .collection('bots')
      .doc(botId)
      .get();

    return doc.exists ? (doc.data() as Bot) : null;
  }

  async updateBot(userId: string, botId: string, data: Partial<Bot>) {
    await this.db
      .collection('users')
      .doc(userId)
      .collection('bots')
      .doc(botId)
      .update(data);
  }

  async queryBotByToken(token: string) {
    const snapshot = await this.db
      .collectionGroup('bots')
      .where('discordBotToken', '==', token)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const userId = doc.ref.parent.parent?.id;
    return {
      userId: userId!,
      botId: doc.id,
      data: doc.data() as Bot,
    };
  }

  async getGuild(guildId: string) {
    const doc = await this.db.collection('guilds').doc(guildId).get();
    return doc.exists ? (doc.data() as Guild) : null;
  }

  async createGuild(guildId: string, data: Guild) {
    await this.db.collection('guilds').doc(guildId).set(data);
  }
}

class HttpClientAdapter implements IHttpClient {
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, options);
  }
}

class SecretsAdapter implements ISecretsManager {
  private secrets: Map<string, any>;

  constructor(secretDefinitions: Record<string, any>) {
    this.secrets = new Map(Object.entries(secretDefinitions));
  }

  getSecret(name: string): string {
    const secret = this.secrets.get(name);
    if (!secret) {
      throw new Error(`Secret ${name} not found`);
    }
    return secret.value();
  }
}

class LoggerAdapter implements ILogger {
  info(message: string, meta?: Record<string, unknown>) {
    logger.info(message, meta);
  }

  error(message: string, error?: unknown) {
    logger.error(message, error);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    logger.warn(message, meta);
  }
}

export class ProductionFunctionContext implements FunctionContext {
  public readonly firestore: IFirestore;
  public readonly http: IHttpClient;
  public readonly secrets: ISecretsManager;
  public readonly logger: ILogger;

  constructor(secretDefinitions?: Record<string, any>) {
    this.firestore = new FirestoreAdapter();
    this.http = new HttpClientAdapter();
    this.secrets = new SecretsAdapter(secretDefinitions || {});
    this.logger = new LoggerAdapter();
  }

  getCurrentTime(): Date {
    return new Date();
  }
}
```

## Integration with Firebase Functions

### Firebase Functions Entry Points

The context is instantiated at the function boundary and passed to business logic:

```typescript
// index.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { ProductionFunctionContext } from "./context.impl";
import { OAuthService } from "./oauth-service";

// Define secrets
const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");

/**
 * Callable function (onCall)
 */
export const exchangeGmailToken = onCall(
  { secrets: [googleClientId, googleClientSecret] },
  async (request) => {
    // Authentication check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { code, userId, botId, redirectUri } = request.data;

    if (!code || !userId || !botId || !redirectUri) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (request.auth.uid !== userId) {
      throw new HttpsError('permission-denied', 'User can only manage their own bots');
    }

    // Create context with secrets
    const ctx = new ProductionFunctionContext({
      GOOGLE_CLIENT_ID: googleClientId,
      GOOGLE_CLIENT_SECRET: googleClientSecret,
    });

    // Execute business logic
    const service = new OAuthService(ctx);
    return service.exchangeGmailToken({ code, userId, botId, redirectUri });
  }
);

/**
 * HTTP function (onRequest)
 */
export const handleWebhook = onRequest(async (req, res) => {
  const ctx = new ProductionFunctionContext();

  // Process webhook logic...
  ctx.logger.info('Webhook received', { path: req.path });

  res.status(200).send({ success: true });
});

/**
 * Firestore trigger (onDocumentCreated)
 */
export const onGuildCreated = onDocumentCreated(
  'guilds/{guildId}',
  async (event) => {
    const ctx = new ProductionFunctionContext();
    const guildId = event.params.guildId;
    const guildData = event.data?.data();

    ctx.logger.info('New guild created', { guildId, guildData });

    // Execute provisioning logic...
  }
);
```

### Key Principles

1. **Function boundary creates context**: Context is instantiated at the top level of each Firebase Function
2. **Business logic is pure**: Services like `OAuthService` are testable classes that accept context
3. **Secrets injected into context**: Pass Firebase secret definitions to context constructor
4. **No direct SDK imports in business logic**: All Firebase/external operations go through context interfaces

## Testing Pattern

Tests should always use a mock context. Never test with real Firestore, external APIs, or secrets.

### Mock Function Context

```typescript
// context.mock.ts
import { FunctionContext, IFirestore, IHttpClient, ISecretsManager, ILogger } from "./context";
import { vi } from "vitest";

class MockFirestore implements IFirestore {
  getBot = vi.fn<[string, string], Promise<Bot | null>>();
  updateBot = vi.fn<[string, string, Partial<Bot>], Promise<void>>();
  queryBotByToken = vi.fn<[string], Promise<{ userId: string; botId: string; data: Bot } | null>>();
  getGuild = vi.fn<[string], Promise<Guild | null>>();
  createGuild = vi.fn<[string, Guild], Promise<void>>();
}

class MockHttpClient implements IHttpClient {
  fetch = vi.fn<[string, RequestInit?], Promise<Response>>();
}

class MockSecretsManager implements ISecretsManager {
  private secrets = new Map<string, string>();

  setSecret(name: string, value: string) {
    this.secrets.set(name, value);
  }

  getSecret(name: string): string {
    return this.secrets.get(name) || 'mock-secret';
  }
}

class MockLogger implements ILogger {
  info = vi.fn();
  error = vi.fn();
  warn = vi.fn();
}

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

  getCurrentTime = vi.fn(() => new Date("2024-01-01T00:00:00Z"));
}
```

### Writing Tests for Firebase Functions Business Logic

```typescript
// oauth-service.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { OAuthService } from "./oauth-service";
import { MockFunctionContext } from "./context.mock";
import { HttpsError } from "firebase-functions/v2/https";

describe("OAuthService", () => {
  let ctx: MockFunctionContext;
  let service: OAuthService;

  beforeEach(() => {
    ctx = new MockFunctionContext();
    service = new OAuthService(ctx);

    // Setup default secrets
    ctx.secrets.setSecret('GOOGLE_CLIENT_ID', 'test-client-id');
    ctx.secrets.setSecret('GOOGLE_CLIENT_SECRET', 'test-client-secret');
  });

  it("should exchange Gmail token successfully", async () => {
    // Arrange
    const params = {
      code: 'test-code',
      userId: 'user123',
      botId: 'bot456',
      redirectUri: 'https://example.com/callback',
    };

    // Mock OAuth token response
    ctx.http.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
      }),
    } as Response);

    // Mock user info response
    ctx.http.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        email: 'test@gmail.com',
      }),
    } as Response);

    // Act
    const result = await service.exchangeGmailToken(params);

    // Assert
    expect(result).toEqual({
      success: true,
      email: 'test@gmail.com',
    });

    // Verify HTTP calls
    expect(ctx.http.fetch).toHaveBeenCalledTimes(2);
    expect(ctx.http.fetch).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
      })
    );

    // Verify Firestore update
    expect(ctx.firestore.updateBot).toHaveBeenCalledWith(
      'user123',
      'bot456',
      expect.objectContaining({
        oauthConnections: expect.objectContaining({
          gmail: expect.objectContaining({
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            email: 'test@gmail.com',
          }),
        }),
      })
    );

    // Verify logging
    expect(ctx.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('token exchange'),
      expect.any(Object)
    );
  });

  it("should handle OAuth token exchange failure", async () => {
    // Arrange
    const params = {
      code: 'invalid-code',
      userId: 'user123',
      botId: 'bot456',
      redirectUri: 'https://example.com/callback',
    };

    ctx.http.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Invalid authorization code',
      }),
    } as Response);

    // Act & Assert
    await expect(service.exchangeGmailToken(params)).rejects.toThrow(HttpsError);

    // Verify error was logged
    expect(ctx.logger.error).toHaveBeenCalled();

    // Verify Firestore was NOT updated
    expect(ctx.firestore.updateBot).not.toHaveBeenCalled();
  });

  it("should handle user info fetch failure", async () => {
    // Arrange
    const params = {
      code: 'test-code',
      userId: 'user123',
      botId: 'bot456',
      redirectUri: 'https://example.com/callback',
    };

    // Mock successful token exchange
    ctx.http.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
      }),
    } as Response);

    // Mock failed user info fetch
    ctx.http.fetch.mockResolvedValueOnce({
      ok: false,
    } as Response);

    // Act & Assert
    await expect(service.exchangeGmailToken(params)).rejects.toThrow(
      'Failed to fetch user info'
    );

    // Verify Firestore was NOT updated
    expect(ctx.firestore.updateBot).not.toHaveBeenCalled();
  });
});
```

### Advanced: Testing with Firestore State

For services that query and modify Firestore state, you can simulate a simple in-memory store:

```typescript
// context.mock.ts (extension)
export class StatefulMockFirestore extends MockFirestore {
  private bots = new Map<string, Bot>();
  private guilds = new Map<string, Guild>();

  async getBot(userId: string, botId: string) {
    const key = `${userId}:${botId}`;
    return this.bots.get(key) || null;
  }

  async updateBot(userId: string, botId: string, data: Partial<Bot>) {
    const key = `${userId}:${botId}`;
    const existing = this.bots.get(key);
    if (!existing) {
      throw new Error(`Bot ${key} not found`);
    }
    this.bots.set(key, { ...existing, ...data });
  }

  async queryBotByToken(token: string) {
    for (const [key, bot] of this.bots.entries()) {
      if (bot.discordBotToken === token) {
        const [userId, botId] = key.split(':');
        return { userId, botId, data: bot };
      }
    }
    return null;
  }

  // Test helper to seed data
  seedBot(userId: string, botId: string, bot: Bot) {
    const key = `${userId}:${botId}`;
    this.bots.set(key, bot);
  }
}

// In test:
it("should refresh token for existing bot", async () => {
  const ctx = new MockFunctionContext();
  const statefulFirestore = new StatefulMockFirestore();
  ctx.firestore = statefulFirestore;

  // Seed test data
  statefulFirestore.seedBot('user123', 'bot456', {
    discordBotToken: 'discord-token-123',
    oauthConnections: {
      gmail: {
        accessToken: 'old-token',
        refreshToken: 'refresh-token-123',
        expiresAt: Date.now() - 1000, // Expired
        email: 'test@gmail.com',
      },
    },
  });

  // Mock HTTP response for token refresh
  ctx.http.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      access_token: 'new-access-token',
      expires_in: 3600,
    }),
  } as Response);

  const service = new TokenRefreshService(ctx);
  const result = await service.refreshGmailToken({
    botToken: 'discord-token-123',
  });

  expect(result.accessToken).toBe('new-access-token');

  // Verify state was updated
  const updatedBot = await statefulFirestore.getBot('user123', 'bot456');
  expect(updatedBot?.oauthConnections.gmail.accessToken).toBe('new-access-token');
});
```

## Benefits for Firebase Functions

1. **Testability**: 100% unit test coverage without Firebase emulators, real Firestore, or external APIs
2. **Fast Tests**: Business logic tests run in milliseconds without network I/O
3. **Flexibility**: Easy to swap Firestore for another database in the future
4. **Clarity**: Clear boundary between domain logic and Firebase/infrastructure code
5. **Type Safety**: TypeScript ensures context interface is fully implemented
6. **Mockability**: Every external dependency (Firestore, HTTP, secrets) can be spied on and controlled
7. **Cost Efficiency**: Develop and test locally without triggering Firebase Functions or external API calls
8. **Debugging**: Easier to isolate and test business logic separately from Firebase infrastructure

## Anti-Patterns to Avoid in Firebase Functions

❌ **Don't import Firebase Admin SDK directly in business logic:**

```typescript
// oauth-service.ts - BAD
import { getFirestore } from 'firebase-admin/firestore';

class OAuthService {
  async exchangeToken() {
    const db = getFirestore(); // Tightly coupled, untestable
    await db.collection('users').doc('123').update(...);
  }
}
```

✅ **Do use context interface:**

```typescript
// oauth-service.ts - GOOD
class OAuthService {
  constructor(private ctx: FunctionContext) {}

  async exchangeToken() {
    await this.ctx.firestore.updateBot('user123', 'bot456', ...);
  }
}
```

❌ **Don't make context methods optional:**

```typescript
interface FunctionContext {
  firestore?: IFirestore; // BAD - creates uncertainty in business logic
}
```

❌ **Don't put business logic in the context implementation:**

```typescript
class ProductionFunctionContext implements FunctionContext {
  async exchangeGmailToken(code: string) {
    // BAD - business logic belongs in service, not context
    const tokens = await fetch(...);
    await this.firestore.updateBot(...);
  }
}
```

✅ **Do keep context implementations simple - they should only wrap external dependencies:**

```typescript
class FirestoreAdapter implements IFirestore {
  private db = getFirestore();

  async updateBot(userId: string, botId: string, data: Partial<Bot>) {
    // GOOD - simple wrapper, no business logic
    await this.db
      .collection('users')
      .doc(userId)
      .collection('bots')
      .doc(botId)
      .update(data);
  }
}
```

❌ **Don't use type casting in business logic:**

```typescript
// oauth-service.ts - BAD
class OAuthService {
  async getBot(userId: string, botId: string): Promise<Bot> {
    const data = await this.ctx.firestore.getBot(userId, botId);
    return data as Bot; // Type casting in business logic - BAD
  }
}
```

✅ **Do use type casting only in context implementations:**

```typescript
// context.impl.ts - GOOD
class FirestoreAdapter implements IFirestore {
  async getBot(userId: string, botId: string): Promise<Bot | null> {
    const doc = await this.db
      .collection('users')
      .doc(userId)
      .collection('bots')
      .doc(botId)
      .get();

    return doc.exists ? (doc.data() as Bot) : null; // Type casting is OK here
  }
}

// oauth-service.ts - GOOD
class OAuthService {
  async getBot(userId: string, botId: string): Promise<Bot | null> {
    return this.ctx.firestore.getBot(userId, botId); // No casting - trust the interface
  }
}
```

❌ **Don't instantiate context inside business logic:**

```typescript
// oauth-service.ts - BAD
class OAuthService {
  async exchangeToken() {
    const ctx = new ProductionFunctionContext(); // BAD - creates test problems
    await ctx.firestore.updateBot(...);
  }
}
```

✅ **Do inject context via constructor:**

```typescript
// oauth-service.ts - GOOD
class OAuthService {
  constructor(private ctx: FunctionContext) {} // Testable

  async exchangeToken() {
    await this.ctx.firestore.updateBot(...);
  }
}
```

## Summary

- **FunctionContext Interface** = All Firebase operations (Firestore, Auth), HTTP calls, secrets, logging
- **Business Logic Services** = Pure domain logic that uses the context (testable classes)
- **Production Context** = Real implementations wrapping Firebase Admin SDK and external APIs
- **Mock Context** = Vitest spy functions for unit testing
- **Firebase Function** = Entry point that creates context and delegates to business logic
- **Tests** = Instantiate services with mock context, verify behavior via spies
- **Type Casting** = Only allowed in context implementations (adapters), never in business logic

This pattern gives you complete control over testing Firebase Functions while keeping business logic clean, focused, and fast to test.

## Migration Strategy

1. **Extract business logic**: Move domain logic from Firebase Function handlers into service classes
2. **Define interfaces**: Create `FunctionContext` and sub-interfaces (`IFirestore`, `IHttpClient`, etc.)
3. **Create adapters**: Wrap Firebase Admin SDK and external APIs in production implementations
4. **Refactor functions**: Update Firebase Functions to instantiate context and call services
5. **Add tests**: Write unit tests using mock context
6. **Iterate**: Gradually refactor existing functions to follow this pattern
