# Changes Needed to Align with Context Interface Pattern

## Critical Changes (Breaks Pattern Fundamentally)

### 1. `agent/manager.ts` - Stop Creating Queries Directly
**Current Problem:**
```typescript
// Line 1: Direct import from SDK
import { query, Query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

// Line 311: Direct query creation
const result = query({ prompt: userMessage, options });
```

**Required Fix:**
```typescript
// Use context.queryExecutor instead
createQuery(userMessage: string, sessionId: string): Query {
  return this.context.queryExecutor.createQuery(userMessage, {
    resume: sessionId,
    cwd: this.workspaceRoot,
  });
}
```

**Impact:** High - This is the core of bot functionality

---

### 2. `agent/stream.ts` - Remove Discord.js Imports
**Current Problem:**
```typescript
// Line 6: Direct Discord.js imports
import { AttachmentBuilder, TextChannel, ThreadChannel, Message } from 'discord.js';

// Function signatures use Discord.js types
export async function streamToDiscord(
  query: Query,
  channel: TextChannel | ThreadChannel,  // Discord.js type
  message: Message,  // Discord.js type
  ...
)
```

**Required Fix:**
```typescript
// Use interface types
import type { IMessage, ITextChannel, IThreadChannel } from '../interfaces/discord';

export async function streamToDiscord(
  query: Query,
  channel: ITextChannel | IThreadChannel,  // Interface type
  message: IMessage,  // Interface type
  context: IBotContext,  // Add context for operations
  ...
)
```

**Impact:** High - Used by all message handling

---

### 3. `discord/events.ts` - Remove All External Dependencies
**Current Problem:**
```typescript
// Lines 1-3: Multiple external imports
import { Message, TextChannel, ThreadChannel } from 'discord.js';
import fs from 'fs';
import path from 'path';

// Line 211: Function uses Discord.js types
async function handleMessage(message: Message) {
  // Line 127: Direct file operations
  fs.existsSync(claudeMdPath);
}
```

**Required Fix:**
```typescript
// Only import interface types
import type { IMessage } from '../interfaces/discord';

async function handleMessage(
  context: IBotContext,
  message: IMessage,
  sessionManager: SessionManager
) {
  // Use context for file operations
  const exists = await context.fileStore.exists(claudeMdPath);
}
```

**Impact:** High - Main event handling logic

---

### 4. `scheduler/runner.ts` - Remove node-cron Import
**Current Problem:**
```typescript
// Line 1: Direct import
import cron from 'node-cron';

// Line 134: Direct usage
this.jobs.set(channelId, cron.schedule(cronExpression, async () => {
  // ...
}));
```

**Required Fix:**
```typescript
// Use context.scheduler
this.jobs.set(channelId,
  context.scheduler.schedule(cronExpression, async () => {
    // ...
  })
);
```

**Impact:** High - Cron functionality

---

### 5. Move `memory/storage.ts` to `implementations/`
**Current Problem:**
- Entire file is pure I/O operations with fs
- Located in application logic directory
- No business logic, just file read/write/append

**Required Fix:**
- Move to `implementations/storage/filesystem-memory.ts`
- Implement `IMemoryStore` interface
- Create interface methods:
  - `appendRawMemory(channelId: string, content: string): Promise<void>`
  - `loadMemory(channelId: string, tokenLimit: number): Promise<MemoryEntry[]>`
  - `compressMemory(channelId: string): Promise<void>`

**Impact:** Medium - Memory system refactor

---

### 6. Move `memory/logger.ts` to `implementations/`
**Current Problem:**
- File-based logging implementation using fs
- Should be part of ILogger implementation or separate file logger

**Required Fix:**
- Move to `implementations/logger/file-logger.ts`
- Extend ILogger interface with file logging methods if needed
- Application code uses `context.logger` only

**Impact:** Low - Nice to have for clean architecture

---

## Medium Priority Changes

### 7. `tools/loader.ts` - Remove Discord.js Types
**Current Problem:**
```typescript
import { ThreadChannel, TextChannel } from 'discord.js';

export function loadBuiltinTools(
  getWorkingDirectory: () => string,
  getChannelId: () => string,
  queueFileForSharing: (filePath: string) => void,
  getChannel?: () => TextChannel | ThreadChannel | null  // Discord.js types
)
```

**Required Fix:**
```typescript
import type { ITextChannel, IThreadChannel } from '../interfaces/discord';

export function loadBuiltinTools(
  getWorkingDirectory: () => string,
  getChannelId: () => string,
  queueFileForSharing: (filePath: string) => void,
  getChannel?: () => ITextChannel | IThreadChannel | null
)
```

---

### 8. `tools/cron/*.ts` - Use Context for File Operations
**Current Problem:**
All cron tools import `fs` and do direct file operations

**Required Fix:**
- Create `ICronStore` interface with methods:
  - `saveCronFile(channelId: string, config: CronConfig): Promise<void>`
  - `loadCronFile(channelId: string): Promise<CronConfig>`
  - `deleteCronFile(channelId: string): Promise<void>`
- Pass context to tool handlers
- Use `context.cronStore` instead of `fs`

---

### 9. `scheduler/parser.ts` - Remove fs Import
**Current Problem:**
```typescript
import fs from 'fs';

export function parseCronFile(filePath: string): CronConfig {
  if (!fs.existsSync(filePath)) return { jobs: [] };
  const content = fs.readFileSync(filePath, 'utf-8');
}
```

**Required Fix:**
```typescript
// Parser should receive content, not read files
export function parseCronContent(content: string): CronConfig {
  return JSON.parse(content);
}

// Reading happens in implementation layer
class NodeCronScheduler implements IScheduler {
  private parser: CronParser;

  async loadCronFile(channelId: string): Promise<CronConfig> {
    const content = await fs.readFile(this.getCronPath(channelId), 'utf-8');
    return this.parser.parseCronContent(content);
  }
}
```

---

### 10. `permissions/discord.ts` - Decide on Pattern
**Current Problem:**
- Imports Discord.js UI components (ButtonBuilder, ActionRowBuilder)
- Located in wrong directory (should be in implementations)

**Options:**
1. Move to `implementations/permission/discord-ui.ts`
2. Create `IPermissionUI` interface if this needs to be abstracted
3. Accept that Discord-specific UI code belongs in implementations

---

## Interface Additions Needed

### Add `IFileStore` Interface
```typescript
// interfaces/storage.ts
export interface IFileStore {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
}
```

### Add `ICronStore` Interface
```typescript
// interfaces/storage.ts
export interface ICronStore {
  saveCronFile(channelId: string, config: CronConfig): Promise<void>;
  loadCronFile(channelId: string): Promise<CronConfig>;
  deleteCronFile(channelId: string): Promise<void>;
}
```

### Expand `IScheduler` Interface
```typescript
// interfaces/scheduler.ts
export interface IScheduler {
  schedule(expression: string, handler: () => void): ScheduledJob;
  stopAll(): void;
  stop(job: ScheduledJob): void;
}

export interface ScheduledJob {
  stop(): void;
}
```

### Update `IQueryExecutor` Interface
```typescript
// interfaces/query.ts
export interface IQueryExecutor {
  createQuery(prompt: string, options: QueryOptions): Query;
  // Potentially add MCP server management
  configureMcpServers(servers: McpServerConfig[]): void;
}
```

---

## Low Priority Clean-up

### 11. Replace console.log with context.logger
**Files affected:**
- `memory/logger.ts` (6 instances)
- `tools/loader.ts` (4 instances)
- Various tool files

**Fix:** Replace all `console.log()` with `context.logger.info()`

---

### 12. Remove All Escape Hatches
**Current Problem:**
- Application code accesses `message._raw` or `channel._raw` to get Discord.js objects
- `IDiscordAdapter` has `getRawClient()` method
- These escape hatches violate the Context Interface Pattern

**Required Fix:**
- Add missing methods to interface types for all operations currently using escape hatches
- Remove `_raw` properties from all interfaces
- Remove `getRawClient()` method from `IDiscordAdapter`
- Application should NEVER access raw Discord.js objects or any other third-party library objects

**Example:**
```typescript
// ❌ BAD - Using escape hatch
const client = context.discord.getRawClient();
await client.guilds.fetch(guildId);

// ✅ GOOD - Proper interface method
await context.discord.fetchGuild(guildId);
```

---

## Migration Strategy

### Phase 1: Core Query Execution (Week 1)
1. Update `IQueryExecutor` interface
2. Implement query creation in `ClaudeSDKQueryExecutor`
3. Update `SessionManager.createQuery()` to use context
4. Test thoroughly

### Phase 2: Discord Operations (Week 1-2)
1. Update all function signatures from Discord.js types to interface types
2. Update `agent/stream.ts`
3. Update `discord/events.ts`
4. Update `tools/loader.ts`

### Phase 3: File Storage (Week 2)
1. Create `IFileStore` and `ICronStore` interfaces
2. Move `memory/storage.ts` and `memory/logger.ts` to implementations
3. Update all file operations to use context
4. Update cron tools
5. Update scheduler parser

### Phase 4: Scheduler (Week 2)
1. Expand `IScheduler` interface
2. Update `scheduler/runner.ts` implementation
3. Remove direct node-cron usage

### Phase 5: Clean-up (Week 3)
1. Remove all `_raw` properties
2. Replace console.log with context.logger
3. Move permissions to implementations
4. Update tests

---

## Testing Strategy

After each phase:
1. Create mock implementations for new interfaces
2. Write unit tests using mocks
3. Run integration tests with production implementations
4. Verify no direct imports of external libraries in application code

---

## Success Criteria

✅ **Zero** direct imports of discord.js in application code
✅ **Zero** direct imports of @anthropic-ai/sdk in application code (except tool definitions)
✅ **Zero** direct imports of node-cron in application code
✅ **Zero** direct imports of fs/path in application code
✅ **Zero** usage of _raw properties
✅ All application code uses only `IBotContext` and interface types
✅ All tests use mock context
✅ 100% type safety maintained

---

## Estimated Effort

- **Phase 1 (Query Execution):** 2-3 days
- **Phase 2 (Discord Operations):** 3-4 days
- **Phase 3 (File Storage):** 3-4 days
- **Phase 4 (Scheduler):** 2-3 days
- **Phase 5 (Clean-up):** 2-3 days

**Total:** 12-17 days of focused development

---

## Risk Assessment

**Low Risk:**
- Phases 5 (clean-up only)

**Medium Risk:**
- Phases 1, 4 (well-defined interfaces)

**High Risk:**
- Phases 2, 3 (many files affected, core functionality)

**Mitigation:**
- Extensive testing at each phase
- Feature flags for gradual rollout
- Keep old code in separate branches for easy rollback
