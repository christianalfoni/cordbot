# Discord Bot Architecture: Context Interface Pattern

## Core Philosophy

This Discord bot is built using a **Context Interface Pattern** that separates the application into two clean layers:

1. **Application Logic** (`agent/`, `discord/`, `scheduler/`, etc.) - Pure TypeScript that describes _what_ the bot does
2. **Context Interfaces** (`interfaces/`) - Abstract definitions of _what capabilities_ are needed
3. **Context Implementations** (`implementations/`) - Concrete implementations of _how_ those capabilities work

The application logic **never** directly imports external dependencies (Discord.js, Anthropic SDK, file system, etc.). Instead, it receives a `IBotContext` interface that provides all capabilities it needs.

## Architecture Overview

### The Bot Context Interface

The central dependency injection container that provides access to all bot capabilities:

```typescript
// interfaces/core.ts
export interface IBotContext {
  // Discord operations (messages, channels, threads)
  discord: IDiscordAdapter;

  // Claude AI query execution
  queryExecutor: IQueryExecutor;

  // Session persistence (thread ↔ Claude session mappings)
  sessionStore: ISessionStore;

  // Long-term memory storage
  memoryStore: IMemoryStore;

  // Task scheduling (cron jobs)
  scheduler: IScheduler;

  // Permission management (Discord roles/permissions)
  permissionManager: IPermissionManager;

  // OAuth token management
  tokenProvider: ITokenProvider;

  // Logging operations
  logger: ILogger;
}
```

**Key Principle**: This interface defines _what_ the bot needs, not _how_ to provide it.

### Capability Interfaces

Each capability in `IBotContext` has its own interface defining specific operations:

```typescript
// interfaces/discord.ts
export interface IDiscordAdapter {
  // Send messages
  sendMessage(channelId: string, content: string): Promise<IMessage>;
  replyToMessage(messageId: string, content: string): Promise<IMessage>;

  // Thread management
  createThread(channelId: string, name: string): Promise<IThreadChannel>;
  getThread(threadId: string): Promise<IThreadChannel | null>;

  // Event handling
  on(event: 'messageCreate', handler: (message: IMessage) => void): void;
  on(event: 'channelCreate', handler: (channel: IChannel) => void): void;
}

// interfaces/storage.ts
export interface ISessionStore {
  createMapping(data: SessionMapping): void;
  getMapping(threadId: string): SessionMapping | undefined;
  updateLastActive(threadId: string): void;
  getAllActive(): SessionMapping[];
  archiveSession(threadId: string): void;
}

// interfaces/query.ts
export interface IQueryExecutor {
  query(prompt: string, options: QueryOptions): Promise<QueryResult>;
  streamQuery(prompt: string, options: QueryOptions): AsyncIterable<StreamEvent>;
}
```

**Key Principle**: Interfaces are designed around bot operations, not around third-party libraries.

### Application Logic

Application components receive the context and use it to implement bot behavior:

```typescript
// agent/manager.ts
export class SessionManager {
  constructor(
    private context: IBotContext,
    private sessionsDir: string,
    private workspaceRoot: string,
    private memoryContextSize: number
  ) {}

  async getOrCreateSession(
    threadId: string,
    channelId: string,
    workingDir: string
  ): Promise<{ sessionId: string; isNew: boolean }> {
    // Use context.sessionStore instead of direct database access
    const existing = this.context.sessionStore.getMapping(threadId);

    if (existing) {
      this.context.sessionStore.updateLastActive(threadId);
      return { sessionId: existing.sessionId, isNew: false };
    }

    // Create new session
    const sessionId = `sess_${Date.now()}_${randomUUID()}`;

    this.context.sessionStore.createMapping({
      threadId,
      channelId,
      sessionId,
      workingDirectory: workingDir,
    });

    return { sessionId, isNew: true };
  }

  createQuery(userMessage: string, sessionId: string): Query {
    // Use context.logger instead of console.log
    this.context.logger.info(`Creating query for session ${sessionId}`);

    // Use context.queryExecutor instead of directly importing Claude SDK
    return this.context.queryExecutor.createQuery(userMessage, {
      resume: sessionId,
      cwd: this.workspaceRoot,
    });
  }
}
```

**Key Principle**: Application logic focuses on _what_ needs to happen. The context handles _how_ it happens.

### Context Implementation (Production)

The factory creates production implementations:

```typescript
// implementations/factory.ts
export async function createProductionBotContext(config: BotContextConfig): Promise<IBotContext> {
  // Initialize Discord.js client
  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  await discordClient.login(config.discordToken);

  return {
    // Wrap Discord.js with our adapter
    discord: new DiscordJsAdapter(discordClient),

    // Wrap Anthropic SDK with our executor
    queryExecutor: new ClaudeSDKQueryExecutor(config.anthropicApiKey),

    // File system based storage
    sessionStore: new FileSystemSessionStore(config.workingDirectory),
    memoryStore: new FileSystemMemoryStore(config.workingDirectory),

    // Node.js cron scheduler
    scheduler: new NodeCronScheduler(),

    // Discord role-based permissions
    permissionManager: new DiscordPermissionManager(discordClient),

    // Service-based OAuth tokens
    tokenProvider: new ServiceTokenProvider(config.serviceUrl),

    // Console logger
    logger: new ConsoleLogger(),
  };
}
```

**Key Principle**: This is where all third-party dependencies are instantiated. Application code never sees them.

### Integration

The context is created once at startup and passed throughout the application:

```typescript
// index.ts
export async function startBot(cwd: string): Promise<void> {
  // Create production context with all real implementations
  const context = await createProductionBotContext({
    discordToken: process.env.DISCORD_BOT_TOKEN!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    guildId: process.env.DISCORD_GUILD_ID!,
    workingDirectory: cwd,
  });

  // Pass context to all application components
  const sessionManager = new SessionManager(context, sessionsDir, cwd);
  const cronRunner = new CronRunner(context.discord, sessionManager, context.logger);

  // Setup event handlers with context
  setupEventHandlers(context, sessionManager, channelMappings, cwd);

  // Start health server with context
  const healthServer = new HealthServer({ context, port: 8080 });
}
```

**Key Principle**: Context flows down from main entry point. Nothing creates its own dependencies.

## Testing Pattern

### Mock Context for Tests

```typescript
// interfaces/__tests__/mocks.ts
import { vi } from 'vitest';
import type { IBotContext } from '../core';

export function createMockBotContext(): IBotContext {
  return {
    discord: {
      sendMessage: vi.fn(),
      replyToMessage: vi.fn(),
      createThread: vi.fn(),
      getThread: vi.fn(),
      on: vi.fn(),
    },

    sessionStore: {
      createMapping: vi.fn(),
      getMapping: vi.fn(),
      updateLastActive: vi.fn(),
      getAllActive: vi.fn(),
      archiveSession: vi.fn(),
    },

    queryExecutor: {
      query: vi.fn(),
      streamQuery: vi.fn(),
    },

    memoryStore: {
      saveMemory: vi.fn(),
      loadMemory: vi.fn(),
      compressMemory: vi.fn(),
    },

    scheduler: {
      schedule: vi.fn(),
      stopAll: vi.fn(),
    },

    permissionManager: {
      hasPermission: vi.fn().mockResolvedValue(true),
      checkPermission: vi.fn(),
    },

    tokenProvider: {
      getToken: vi.fn().mockResolvedValue('mock-token'),
      refreshToken: vi.fn(),
    },

    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
}
```

### Writing Tests

```typescript
// agent/__tests__/manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../manager';
import { createMockBotContext } from '../../interfaces/__tests__/mocks';

describe('SessionManager', () => {
  let context: ReturnType<typeof createMockBotContext>;
  let manager: SessionManager;

  beforeEach(() => {
    context = createMockBotContext();
    manager = new SessionManager(context, '/sessions', '/workspace', 10000);
  });

  it('should create new session if none exists', async () => {
    // Arrange - mock returns no existing session
    context.sessionStore.getMapping.mockReturnValue(undefined);

    // Act
    const result = await manager.getOrCreateSession('thread-1', 'channel-1', '/workspace');

    // Assert - new session created
    expect(result.isNew).toBe(true);
    expect(context.sessionStore.createMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        channelId: 'channel-1',
      })
    );
  });

  it('should reuse existing session', async () => {
    // Arrange - mock returns existing session
    context.sessionStore.getMapping.mockReturnValue({
      sessionId: 'sess-123',
      threadId: 'thread-1',
      channelId: 'channel-1',
      workingDirectory: '/workspace',
    });

    // Act
    const result = await manager.getOrCreateSession('thread-1', 'channel-1', '/workspace');

    // Assert - existing session reused
    expect(result.isNew).toBe(false);
    expect(result.sessionId).toBe('sess-123');
    expect(context.sessionStore.updateLastActive).toHaveBeenCalledWith('thread-1');
    expect(context.sessionStore.createMapping).not.toHaveBeenCalled();
  });

  it('should handle session creation failure', async () => {
    // Arrange - mock throws error
    context.sessionStore.createMapping.mockImplementation(() => {
      throw new Error('Database error');
    });

    // Act & Assert
    await expect(
      manager.getOrCreateSession('thread-1', 'channel-1', '/workspace')
    ).rejects.toThrow('Database error');
  });
});
```

**Key Benefits**:
- No actual Discord connection needed
- No actual Claude API calls needed
- No actual file system operations needed
- Tests run instantly
- Tests are deterministic
- Easy to simulate error conditions

## Design Principles

### 1. Interface Types vs Implementation Types

```typescript
// ❌ BAD - Application imports Discord.js directly
import { Message, TextChannel } from 'discord.js';

async function handleMessage(message: Message) {
  await message.reply('Hello');
}

// ✅ GOOD - Application uses interface types
import type { IMessage } from './interfaces/discord';

async function handleMessage(context: IBotContext, message: IMessage) {
  await context.discord.replyToMessage(message.id, 'Hello');
}
```

### 2. Dependency Injection, Not Service Locators

```typescript
// ❌ BAD - Getting context from a global
import { getGlobalContext } from './context';

class SessionManager {
  async createSession() {
    const context = getGlobalContext();
    context.sessionStore.createMapping(...);
  }
}

// ✅ GOOD - Context injected via constructor
class SessionManager {
  constructor(private context: IBotContext) {}

  async createSession() {
    this.context.sessionStore.createMapping(...);
  }
}
```

### 3. Business Logic Stays in Application Layer

```typescript
// ❌ BAD - Business logic in implementation
class FileSystemSessionStore implements ISessionStore {
  createMapping(data: SessionMapping): void {
    // BAD: Validation and business logic here
    if (data.workingDirectory.includes('..')) {
      throw new Error('Invalid path');
    }

    // BAD: Auto-creating related data
    this.createDefaultMemory(data.sessionId);

    fs.writeFileSync(this.getPath(data.threadId), JSON.stringify(data));
  }
}

// ✅ GOOD - Implementation is simple I/O
class FileSystemSessionStore implements ISessionStore {
  createMapping(data: SessionMapping): void {
    // Just write the data - validation happens in application layer
    fs.writeFileSync(this.getPath(data.threadId), JSON.stringify(data));
  }
}

// ✅ GOOD - Business logic in application
class SessionManager {
  async createSession(threadId: string, workingDir: string) {
    // Validation in application layer
    if (workingDir.includes('..')) {
      throw new Error('Invalid path');
    }

    // Business logic: create session first
    this.context.sessionStore.createMapping({
      threadId,
      workingDirectory: workingDir,
      sessionId: generateId(),
    });

    // Then create related memory
    await this.context.memoryStore.createMemory(sessionId);
  }
}
```

### 4. Type Casting Only in Implementations

```typescript
// ❌ BAD - Type casting in application code
class SessionManager {
  async createSession(threadId: string) {
    const data = await this.context.sessionStore.getMapping(threadId);
    const session = data as SessionMapping; // BAD
  }
}

// ✅ GOOD - Application trusts interfaces
class SessionManager {
  async createSession(threadId: string) {
    const session = await this.context.sessionStore.getMapping(threadId);
    // No casting needed - interface guarantees the type
  }
}

// ✅ GOOD - Type casting in implementation
class FileSystemSessionStore implements ISessionStore {
  getMapping(threadId: string): SessionMapping | undefined {
    const raw = fs.readFileSync(this.getPath(threadId), 'utf-8');
    return JSON.parse(raw) as SessionMapping; // OK here
  }
}
```

### 5. Prefer Specific Methods Over Generic Ones

```typescript
// ❌ BAD - Generic "do anything" interface
export interface IDiscordAdapter {
  execute(operation: string, params: any): Promise<any>;
}

// ✅ GOOD - Specific, type-safe methods
export interface IDiscordAdapter {
  sendMessage(channelId: string, content: string): Promise<IMessage>;
  deleteMessage(messageId: string): Promise<void>;
  createThread(channelId: string, name: string): Promise<IThreadChannel>;
}
```

## When to Update Each Layer

### Update `interfaces/` when:
- Adding a new external capability (e.g., adding email notifications)
- Changing how application interacts with a capability (e.g., adding parameters)
- Adding a new adapter interface (e.g., supporting Slack in addition to Discord)

**Example**: Adding reaction support
```typescript
// interfaces/discord.ts
export interface IDiscordAdapter {
  // ... existing methods
  addReaction(messageId: string, emoji: string): Promise<void>;
  removeReaction(messageId: string, emoji: string): Promise<void>;
}
```

### Update `implementations/` when:
- Switching to a different library (e.g., Discord.js v13 → v14)
- Adding a new implementation variant (e.g., adding a mock implementation)
- Fixing bugs in how external services are called
- Optimizing performance of I/O operations

**Example**: Implementing reaction support
```typescript
// implementations/discord/adapter.ts
export class DiscordJsAdapter implements IDiscordAdapter {
  async addReaction(messageId: string, emoji: string): Promise<void> {
    const message = await this.client.channels.cache
      .get(channelId)
      ?.messages.fetch(messageId);
    await message?.react(emoji);
  }
}
```

### Update `agent/`, `discord/`, `scheduler/`, etc. (application logic) when:
- Adding new bot features
- Changing bot behavior
- Fixing business logic bugs
- Updating workflows and state machines

**Example**: Using reaction support
```typescript
// discord/events.ts
async function handleCommand(context: IBotContext, message: IMessage) {
  // Acknowledge with reaction
  await context.discord.addReaction(message.id, '👍');

  // Process command...
  const result = await processCommand(message.content);

  // Update reaction on completion
  await context.discord.removeReaction(message.id, '👍');
  await context.discord.addReaction(message.id, '✅');
}
```

## Common Patterns

### Pattern: Passing Context Through Event Handlers

```typescript
// discord/events.ts
export function setupEventHandlers(
  context: IBotContext,
  sessionManager: SessionManager,
  channelMappings: ChannelMapping[]
): void {
  // Context flows into event handlers
  context.discord.on('messageCreate', async (message) => {
    await handleMessage(context, sessionManager, message);
  });

  context.discord.on('channelCreate', async (channel) => {
    await handleNewChannel(context, channel);
  });
}

async function handleMessage(
  context: IBotContext,
  sessionManager: SessionManager,
  message: IMessage
): Promise<void> {
  // Use context for all operations
  context.logger.info(`Processing message from ${message.author.username}`);

  const session = await sessionManager.getOrCreateSession(
    message.channelId,
    message.id,
    '/workspace'
  );

  await context.discord.replyToMessage(
    message.id,
    `Session ${session.sessionId} created`
  );
}
```

### Pattern: Context Scoping for Concurrent Operations

```typescript
// agent/manager.ts
export class SessionManager {
  private currentChannels = new Map<string, ITextChannel>();

  setChannelContext(sessionId: string, channel: ITextChannel): void {
    this.currentChannels.set(sessionId, channel);
  }

  clearChannelContext(sessionId: string): void {
    this.currentChannels.delete(sessionId);
  }

  getChannelContext(sessionId: string): ITextChannel | null {
    return this.currentChannels.get(sessionId) || null;
  }
}

// Usage in event handler
async function handleMessage(context: IBotContext, manager: SessionManager, message: IMessage) {
  const sessionId = await manager.getOrCreateSession(...);

  // Set scoped context for this session
  manager.setChannelContext(sessionId, message.channel);

  try {
    // Process message with scoped context
    await processWithSession(context, sessionId);
  } finally {
    // Always clean up
    manager.clearChannelContext(sessionId);
  }
}
```

### Pattern: Evolving Interfaces When Operations Are Missing

When you need an operation that doesn't exist in an interface, you must add it to the interface - **no escape hatches allowed**.

```typescript
// ❌ BAD - No escape hatches
export interface IDiscordAdapter {
  sendMessage(channelId: string, content: string): Promise<IMessage>;
  getRawClient(): any;  // NO - this breaks the pattern
}

// ✅ GOOD - Add specific method to interface
export interface IDiscordAdapter {
  sendMessage(channelId: string, content: string): Promise<IMessage>;
  fetchGuild(guildId: string): Promise<IGuild>;  // Proper abstraction
}

// Then implement in adapter
class DiscordJsAdapter implements IDiscordAdapter {
  async fetchGuild(guildId: string): Promise<IGuild> {
    const guild = await this.client.guilds.fetch(guildId);
    return this.wrapGuild(guild);
  }
}
```

**Principle**: If your application needs an operation, the interface should provide it. No shortcuts.

## Benefits of This Architecture

1. **Testability**: Mock entire context with spy functions - no real Discord, no real Claude API, no real file system
2. **Flexibility**: Swap implementations (production, testing, development) without touching application code
3. **Clarity**: Clear separation between "what to do" (application) and "how to do it" (implementations)
4. **Type Safety**: TypeScript ensures all capabilities are fully implemented
5. **Portability**: Same bot logic can work with different Discord libraries, different storage backends, etc.
6. **Maintainability**: Changes to external libraries are isolated to implementation layer
7. **Debuggability**: Easy to add logging, metrics, or debugging to implementations without changing application

## Summary

- **`interfaces/`** = What the bot needs (abstract capabilities)
- **`implementations/`** = How to provide it (concrete I/O and SDK calls)
- **`agent/`, `discord/`, `scheduler/`, etc.`** = What the bot does (business logic)
- **`IBotContext`** = Dependency injection container passed throughout application
- **Tests** = Mock context with spy functions, verify application behavior
- **Type Casting** = Only in implementations, never in application code
- **No Escape Hatches** = Interfaces must be complete - add methods rather than exposing raw clients

This pattern gives you complete control over testing while keeping your application code clean, focused, and portable.
