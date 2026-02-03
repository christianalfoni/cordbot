# Bot Interface Implementation

This document describes the interface-based architecture implemented for the bot package to enable unit testing and dependency injection.

## Overview

The bot now uses a clean architecture pattern with:
- **Interfaces** defining contracts for external dependencies
- **Implementations** wrapping real SDKs (Discord.js, Claude Agent SDK, etc.)
- **Dependency Injection** via `IBotContext`

This allows for easy mocking and unit testing without requiring live connections to Discord, Claude API, or external services.

## Architecture

```
src/
├── interfaces/           # All interface definitions
│   ├── core.ts          # IBotContext - main DI container
│   ├── discord.ts       # IDiscordAdapter - Discord operations
│   ├── query.ts         # IQueryExecutor - Claude queries
│   ├── storage.ts       # ISessionStore, IMemoryStore
│   ├── scheduler.ts     # IScheduler - cron jobs
│   ├── permission.ts    # IPermissionManager
│   └── token.ts         # ITokenProvider
│
└── implementations/      # Real SDK implementations
    ├── factory.ts       # Production context factory
    ├── discord/
    │   └── adapter.ts   # Discord.js wrapper
    ├── query/
    │   └── claude-sdk.ts # Claude Agent SDK wrapper
    ├── storage/
    │   ├── filesystem-session.ts
    │   └── filesystem-memory.ts
    ├── scheduler/
    │   └── node-cron.ts
    ├── permission/
    │   └── discord-permission.ts
    └── token/
        └── service-token.ts
```

## Core Interface: IBotContext

The `IBotContext` interface is the main dependency injection container:

```typescript
interface IBotContext {
  discord: IDiscordAdapter;
  queryExecutor: IQueryExecutor;
  sessionStore: ISessionStore;
  memoryStore: IMemoryStore;
  scheduler: IScheduler;
  permissionManager: IPermissionManager;
  tokenProvider: ITokenProvider;
}
```

This single object provides access to all external dependencies the bot needs.

## Key Interfaces

### IDiscordAdapter
Abstracts all Discord.js operations:
- Message operations (send, edit, delete)
- Channel operations (create, list, delete)
- Thread operations
- Member operations (kick, ban, timeout)
- Role operations
- Event operations
- Poll operations
- Event handlers

**Benefit**: Can mock Discord without a live connection.

### IQueryExecutor
Abstracts Claude Agent SDK query execution:
- Create and execute queries
- Resume sessions
- Stream query events

**Benefit**: Can mock Claude responses for testing.

### ISessionStore
Abstracts session persistence:
- Create/get/update session mappings
- Archive old sessions
- Query by thread/channel/session ID

**Benefit**: Can use in-memory storage for tests.

### IMemoryStore
Abstracts memory storage:
- Save/load raw, daily, weekly, monthly, yearly memories
- Load memories within token budget
- Hierarchical memory management

**Benefit**: Can mock memory operations.

### IScheduler
Abstracts cron job scheduling:
- Schedule tasks with cron expressions
- List/get/remove tasks
- Update schedules
- Enable/disable tasks

**Benefit**: Can test scheduled tasks synchronously.

### IPermissionManager
Abstracts permission requests:
- Request permission from users
- Handle approvals/denials
- Get permission levels for tools

**Benefit**: Can auto-approve/deny in tests.

### ITokenProvider
Abstracts OAuth token management:
- Get/refresh tokens
- Check token expiry
- Set/remove tokens

**Benefit**: Can provide mock tokens.

## Production Usage

### Creating a Production Context

```typescript
import { createProductionBotContext } from './implementations/factory';

const context = await createProductionBotContext({
  discordToken: process.env.DISCORD_BOT_TOKEN,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  guildId: process.env.DISCORD_GUILD_ID,
  workingDirectory: process.cwd(),
  memoryContextSize: 100000,
  serviceUrl: process.env.SERVICE_URL,
});

// Now use context throughout your app
context.discord.sendMessage(channelId, 'Hello!');
```

### Refactoring Existing Code

Before:
```typescript
// Direct SDK usage
const client = new Client({ intents: [...] });
await client.login(token);
```

After:
```typescript
// Using interface
class MyBot {
  constructor(private context: IBotContext) {}

  async start() {
    // context.discord is already logged in
    this.context.discord.on('messageCreate', this.handleMessage);
  }

  private handleMessage = async (message: IMessage) => {
    // Use context.queryExecutor instead of direct SDK
    const query = this.context.queryExecutor.createQuery({
      prompt: message.content,
      workingDirectory: '/workspace',
    });
  }
}
```

## Testing (To Be Implemented)

### Mock Context Structure

```
src/mocks/
├── mock-discord.ts       # MockDiscordAdapter
├── mock-query.ts         # MockQueryExecutor
├── mock-storage.ts       # InMemorySessionStore, InMemoryMemoryStore
├── mock-scheduler.ts     # MockScheduler
├── mock-permission.ts    # MockPermissionManager
├── mock-token.ts         # MockTokenProvider
└── test-helpers.ts       # Factory: createMockBotContext()
```

### Example Test (Future)

```typescript
import { createMockBotContext } from '../mocks/test-helpers';

describe('SessionManager', () => {
  it('should create new session on first query', async () => {
    const context = createMockBotContext();
    const manager = new SessionManager(context);

    await manager.createQuery({
      threadId: 'thread-123',
      prompt: 'Hello',
      workingDirectory: '/test',
    });

    // Assert session was created
    const mapping = context.sessionStore.getMapping('thread-123');
    expect(mapping).toBeDefined();
  });
});
```

## Migration Path

### Phase 1: Core Refactoring
- [x] Create all interface definitions
- [x] Implement production wrappers
- [x] Create factory for production context
- [ ] Refactor main entry points to use IBotContext
- [ ] Refactor SessionManager to use IBotContext
- [ ] Refactor event handlers to use IBotContext

### Phase 2: Test Infrastructure
- [ ] Create mock implementations
- [ ] Create test helper factories
- [ ] Add vitest configuration
- [ ] Write first integration test

### Phase 3: Comprehensive Testing
- [ ] Test SessionManager
- [ ] Test Discord event handlers
- [ ] Test tool implementations
- [ ] Test CronRunner
- [ ] Test memory operations

## Benefits

✅ **Testability**: Can unit test complex business logic without external dependencies
✅ **Flexibility**: Easy to swap Discord for Slack, or filesystem for Firestore
✅ **Maintainability**: Clear boundaries between business logic and infrastructure
✅ **Development Speed**: Tests run instantly without waiting for API calls
✅ **Type Safety**: Interfaces ensure consistent contracts across implementations
✅ **Mocking**: Can simulate edge cases (API errors, timeouts) easily in tests

## Next Steps

1. Refactor main bot entry point to use `createProductionBotContext()`
2. Update SessionManager to accept `IBotContext` instead of individual dependencies
3. Update event handlers to use interface types
4. Create mock implementations for testing
5. Write first test suite

## Files Modified

### New Files
- `src/interfaces/*.ts` - All interface definitions
- `src/implementations/**/*.ts` - Production implementations
- `src/implementations/factory.ts` - Context factory

### Future Changes
- `src/index.ts` - Will use factory
- `src/agent/manager.ts` - Will accept IBotContext
- `src/discord/events.ts` - Will use IDiscordAdapter
- Tool implementations - Will use context interfaces

## Notes

- All implementations wrap existing code, so behavior is unchanged
- The `_raw` property on interface types allows access to underlying SDK objects when needed
- Mock implementations will be created in a separate phase
- This architecture enables both unit and integration testing
