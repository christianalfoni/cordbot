import type {
  IBotContext,
  IDiscordAdapter,
  IQueryExecutor,
  ISessionStore,
  IMemoryStore,
  IScheduler,
  ITokenProvider,
  ILogger,
  IFileStore,
  IMessage,
  IUser,
  ITextChannel,
  IThreadChannel,
  IForumChannel,
  IMember,
  IRole,
  IChannel,
  IGuild,
  IButtonInteraction,
  IGuildScheduledEvent,
  MessageHandler,
  ChannelCreateHandler,
  ChannelDeleteHandler,
  ChannelUpdateHandler,
  InteractionCreateHandler,
  ErrorHandler,
  WarnHandler,
  SessionMapping,
  NewSessionMapping,
  RawMemoryEntry,
  MemoryLoadResult,
  ScheduledTask,
  TaskFunction,
  Token,
  TokenCategory,
  ChannelType,
  QueryOptions,
  QueryEvent,
} from '../../interfaces/index.js';
import type { IDocumentConverter } from '../../interfaces/document.js';
import type { Query } from '@anthropic-ai/claude-agent-sdk';

/**
 * Mock Discord Adapter with testing utilities
 */
export class MockDiscordAdapter implements IDiscordAdapter {
  private ready = false;
  private user: IUser | null = null;
  private channels = new Map<string, ITextChannel | IThreadChannel | IForumChannel>();
  private messages = new Map<string, IMessage>();
  private members = new Map<string, IMember>();
  private roles = new Map<string, IRole>();
  private guilds = new Map<string, IGuild>();
  private events = new Map<string, IGuildScheduledEvent>();

  // Event handlers
  private messageHandlers: MessageHandler[] = [];
  private channelCreateHandlers: ChannelCreateHandler[] = [];
  private channelDeleteHandlers: ChannelDeleteHandler[] = [];
  private channelUpdateHandlers: ChannelUpdateHandler[] = [];
  private interactionHandlers: InteractionCreateHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private warnHandlers: WarnHandler[] = [];

  async login(token: string): Promise<void> {
    this.ready = true;
    this.user = this.createMockUser({ id: 'bot-id', username: 'TestBot', bot: true });
  }

  isReady(): boolean {
    return this.ready;
  }

  getUser(): IUser | null {
    return this.user;
  }

  destroy(): void {
    this.ready = false;
    this.user = null;
  }

  async sendMessage(channelId: string, content: string | any): Promise<IMessage> {
    const message = this.createMockMessage({
      id: `msg-${Date.now()}`,
      channelId,
      content: typeof content === 'string' ? content : content.content || '',
      authorId: this.user?.id || 'bot-id',
      author: this.user || this.createMockUser({ id: 'bot-id', username: 'TestBot', bot: true }),
    });
    this.messages.set(message.id, message);
    return message;
  }

  async editMessage(messageId: string, channelId: string, content: string): Promise<IMessage> {
    const message = this.messages.get(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    const updated = { ...message, content };
    this.messages.set(messageId, updated);
    return updated;
  }

  async deleteMessage(messageId: string, channelId: string): Promise<void> {
    this.messages.delete(messageId);
  }

  async getChannel(channelId: string): Promise<ITextChannel | IThreadChannel | IForumChannel | null> {
    return this.channels.get(channelId) || null;
  }

  async listChannels(guildId: string): Promise<IChannel[]> {
    return Array.from(this.channels.values()).filter(ch => ch.guildId === guildId);
  }

  async createChannel(guildId: string, name: string, type: ChannelType, options?: any): Promise<ITextChannel> {
    const channel = this.createMockTextChannel({ id: `ch-${Date.now()}`, name, guildId });
    this.channels.set(channel.id, channel);
    return channel;
  }

  async deleteChannel(channelId: string): Promise<void> {
    this.channels.delete(channelId);
  }

  async createThread(channelId: string, name: string, options?: any): Promise<IThreadChannel> {
    const thread = this.createMockThreadChannel({ id: `th-${Date.now()}`, name, parentId: channelId });
    this.channels.set(thread.id, thread);
    return thread;
  }

  async createForumPost(channelId: string, options: any): Promise<IThreadChannel> {
    const thread = this.createMockThreadChannel({ id: `fp-${Date.now()}`, name: options.name, parentId: channelId });
    this.channels.set(thread.id, thread);
    return thread;
  }

  async deleteForumPost(threadId: string): Promise<void> {
    this.channels.delete(threadId);
  }

  async getMember(guildId: string, userId: string): Promise<IMember> {
    const key = `${guildId}-${userId}`;
    const member = this.members.get(key);
    if (!member) {
      throw new Error(`Member ${userId} not found in guild ${guildId}`);
    }
    return member;
  }

  async listMembers(guildId: string): Promise<IMember[]> {
    return Array.from(this.members.values());
  }

  async kickMember(guildId: string, userId: string, reason?: string): Promise<void> {
    const key = `${guildId}-${userId}`;
    this.members.delete(key);
  }

  async banMember(guildId: string, userId: string, options?: any): Promise<void> {
    const key = `${guildId}-${userId}`;
    this.members.delete(key);
  }

  async getRole(guildId: string, roleId: string): Promise<IRole | null> {
    return this.roles.get(roleId) || null;
  }

  async listRoles(guildId: string): Promise<IRole[]> {
    return Array.from(this.roles.values());
  }

  async createRole(guildId: string, options: any): Promise<IRole> {
    const role = this.createMockRole({ id: `role-${Date.now()}`, name: options.name });
    this.roles.set(role.id, role);
    return role;
  }

  async assignRole(guildId: string, userId: string, roleId: string): Promise<void> {
    // No-op for mock
  }

  async removeRole(guildId: string, userId: string, roleId: string): Promise<void> {
    // No-op for mock
  }

  async createEvent(guildId: string, options: any): Promise<IGuildScheduledEvent> {
    const event = this.createMockEvent({ id: `evt-${Date.now()}`, name: options.name });
    this.events.set(event.id, event);
    return event;
  }

  async getEvent(guildId: string, eventId: string): Promise<IGuildScheduledEvent | null> {
    return this.events.get(eventId) || null;
  }

  async listEvents(guildId: string): Promise<IGuildScheduledEvent[]> {
    return Array.from(this.events.values());
  }

  async deleteEvent(guildId: string, eventId: string): Promise<void> {
    this.events.delete(eventId);
  }

  async getPollResults(channelId: string, messageId: string): Promise<any> {
    return null;
  }

  async getGuild(guildId: string): Promise<IGuild | null> {
    return this.guilds.get(guildId) || null;
  }

  on(event: string, handler: any): void {
    switch (event) {
      case 'messageCreate':
        this.messageHandlers.push(handler);
        break;
      case 'channelCreate':
        this.channelCreateHandlers.push(handler);
        break;
      case 'channelDelete':
        this.channelDeleteHandlers.push(handler);
        break;
      case 'channelUpdate':
        this.channelUpdateHandlers.push(handler);
        break;
      case 'interactionCreate':
        this.interactionHandlers.push(handler);
        break;
      case 'error':
        this.errorHandlers.push(handler);
        break;
      case 'warn':
        this.warnHandlers.push(handler);
        break;
    }
  }

  off(event: string, handler: any): void {
    switch (event) {
      case 'messageCreate':
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        break;
      case 'channelCreate':
        this.channelCreateHandlers = this.channelCreateHandlers.filter(h => h !== handler);
        break;
      case 'channelDelete':
        this.channelDeleteHandlers = this.channelDeleteHandlers.filter(h => h !== handler);
        break;
      case 'channelUpdate':
        this.channelUpdateHandlers = this.channelUpdateHandlers.filter(h => h !== handler);
        break;
      case 'interactionCreate':
        this.interactionHandlers = this.interactionHandlers.filter(h => h !== handler);
        break;
      case 'error':
        this.errorHandlers = this.errorHandlers.filter(h => h !== handler);
        break;
      case 'warn':
        this.warnHandlers = this.warnHandlers.filter(h => h !== handler);
        break;
    }
  }

  // Testing utilities
  async triggerMessage(message: Partial<IMessage>): Promise<void> {
    const fullMessage = this.createMockMessage(message);
    this.messages.set(fullMessage.id, fullMessage);
    for (const handler of this.messageHandlers) {
      await handler(fullMessage);
    }
  }

  async triggerChannelCreate(channel: IChannel): Promise<void> {
    for (const handler of this.channelCreateHandlers) {
      await handler(channel);
    }
  }

  async triggerInteraction(interaction: IButtonInteraction): Promise<void> {
    for (const handler of this.interactionHandlers) {
      await handler(interaction);
    }
  }

  private createMockUser(partial: Partial<IUser>): IUser {
    return {
      id: partial.id || 'user-id',
      username: partial.username || 'TestUser',
      bot: partial.bot || false,
      discriminator: partial.discriminator || '0000',
    };
  }

  private createMockMessage(partial: Partial<IMessage>): IMessage {
    const timestamp = partial.createdTimestamp || Date.now();
    const channel = partial.channel || this.createMockTextChannel({});

    const msg: IMessage = {
      id: partial.id || `msg-${Date.now()}`,
      content: partial.content || '',
      channelId: partial.channelId || 'channel-id',
      guildId: partial.guildId,
      authorId: partial.authorId || 'user-id',
      author: partial.author || this.createMockUser({}),
      createdTimestamp: timestamp,
      createdAt: new Date(timestamp),
      channel,
      attachments: partial.attachments || new Map(),
      reference: partial.reference || null,
      member: partial.member || null,
      mentions: partial.mentions || {
        users: [],
        has: () => false
      },
      embeds: partial.embeds || [],
      client: {
        user: this.user,
      },
      type: partial.type || 0, // 0 = Default message type
      async edit(content: string | any) {
        msg.content = typeof content === 'string' ? content : content.content || msg.content;
        return msg;
      },
      async delete() {},
      async reply(content: string | any) {
        return msg;
      },
    };
    return msg;
  }

  createMockTextChannel(partial: Partial<ITextChannel>): ITextChannel {
    const self = this;
    const channel: ITextChannel = {
      id: partial.id || 'channel-id',
      name: partial.name || 'test-channel',
      type: 0, // ChannelType.GuildText
      guildId: partial.guildId || 'guild-id',
      topic: partial.topic || null,
      threads: {
        async create(options: any): Promise<IThreadChannel> {
          return self.createMockThreadChannel({
            name: options.name,
            parentId: channel.id,
          });
        },
      },
      isTextChannel(): this is ITextChannel {
        return true;
      },
      isThreadChannel(): this is IThreadChannel {
        return false;
      },
      isThread(): this is IThreadChannel {
        return false;
      },
      isForumChannel(): this is IForumChannel {
        return false;
      },
      async send(content: string | any) {
        return self.createMockMessage({ channelId: channel.id });
      },
      async bulkDelete(messages: number | string[]) {},
      async setTopic(topic: string) {
        channel.topic = topic;
        return channel;
      },
    };
    return channel;
  }

  private createMockThreadChannel(partial: Partial<IThreadChannel>): IThreadChannel {
    const self = this;
    const thread: IThreadChannel = {
      id: partial.id || 'thread-id',
      name: partial.name || 'test-thread',
      type: 11, // ChannelType.PublicThread
      guildId: partial.guildId || 'guild-id',
      parentId: partial.parentId || null,
      ownerId: partial.ownerId || null,
      archived: partial.archived || false,
      locked: partial.locked || false,
      isTextChannel(): this is ITextChannel {
        return false;
      },
      isThreadChannel(): this is IThreadChannel {
        return true;
      },
      isThread(): this is IThreadChannel {
        return true;
      },
      isForumChannel(): this is IForumChannel {
        return false;
      },
      async send(content: string | any) {
        return self.createMockMessage({ channelId: thread.id });
      },
      async setArchived(archived: boolean) {
        thread.archived = archived;
        return thread;
      },
      async setLocked(locked: boolean) {
        thread.locked = locked;
        return thread;
      },
      async setName(name: string) {
        thread.name = name;
        return thread;
      },
    };
    return thread;
  }

  private createMockRole(partial: Partial<IRole>): IRole {
    return {
      id: partial.id || 'role-id',
      name: partial.name || 'test-role',
      color: partial.color || 0,
      position: partial.position || 0,
      permissions: partial.permissions || 0n,
      mentionable: partial.mentionable || false,
    };
  }

  private createMockEvent(partial: Partial<IGuildScheduledEvent>): IGuildScheduledEvent {
    return {
      id: partial.id || 'event-id',
      name: partial.name || 'test-event',
      description: partial.description || null,
      scheduledStartTimestamp: partial.scheduledStartTimestamp || null,
      scheduledEndTimestamp: partial.scheduledEndTimestamp || null,
      status: partial.status || 1,
      entityType: partial.entityType || 3,
      async delete() {},
    };
  }
}

/**
 * Mock Query Executor
 */
export class MockQueryExecutor implements IQueryExecutor {
  private responses: QueryEvent[] = [];

  createQuery(options: QueryOptions): Query {
    return {} as Query;
  }

  async *executeQuery(query: Query): AsyncIterableIterator<QueryEvent> {
    for (const event of this.responses) {
      yield event;
    }
  }

  resumeSession(sessionId: string, options: Omit<QueryOptions, 'sessionId'>): Query {
    return {} as Query;
  }

  getSessionId(query: Query): string | undefined {
    return 'session-id';
  }

  // Testing utilities
  setMockResponse(events: QueryEvent[]): void {
    this.responses = events;
  }
}

/**
 * Mock Session Store
 */
export class MockSessionStore implements ISessionStore {
  private sessions = new Map<string, SessionMapping>();

  createMapping(mapping: NewSessionMapping): void {
    const session: SessionMapping = {
      ...mapping,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };
    this.sessions.set(mapping.threadId, session);
  }

  getMapping(threadId: string): SessionMapping | undefined {
    return this.sessions.get(threadId);
  }

  getMappingByMessageId(messageId: string): SessionMapping | undefined {
    return Array.from(this.sessions.values()).find(s => s.messageId === messageId);
  }

  getMappingBySessionId(sessionId: string): SessionMapping | undefined {
    return Array.from(this.sessions.values()).find(s => s.sessionId === sessionId);
  }

  getChannelSessions(channelId: string): SessionMapping[] {
    return Array.from(this.sessions.values()).filter(s => s.channelId === channelId);
  }

  getAllActive(): SessionMapping[] {
    return Array.from(this.sessions.values()).filter(s => !s.archived);
  }

  updateLastActive(threadId: string): void {
    const session = this.sessions.get(threadId);
    if (session) {
      session.lastActive = Date.now();
    }
  }

  updateSessionId(threadId: string, newSessionId: string): void {
    const session = this.sessions.get(threadId);
    if (session) {
      session.sessionId = newSessionId;
    }
  }

  archiveSession(threadId: string): void {
    const session = this.sessions.get(threadId);
    if (session) {
      session.archived = true;
    }
  }

  deleteMapping(threadId: string): void {
    this.sessions.delete(threadId);
  }

  archiveOldSessions(maxAge: number): number {
    let count = 0;
    const cutoff = Date.now() - maxAge * 24 * 60 * 60 * 1000;
    for (const session of this.sessions.values()) {
      if (session.lastActive < cutoff && !session.archived) {
        session.archived = true;
        count++;
      }
    }
    return count;
  }

  getActiveCount(): number {
    return this.getAllActive().length;
  }
}

/**
 * Mock Memory Store
 */
export class MockMemoryStore implements IMemoryStore {
  private memories = new Map<string, any>();

  async saveRawMemory(channelId: string, entries: RawMemoryEntry[]): Promise<void> {
    this.memories.set(`raw-${channelId}`, entries);
  }

  async loadRawMemories(channelId: string, date: string): Promise<RawMemoryEntry[]> {
    return this.memories.get(`raw-${channelId}`) || [];
  }

  async saveDailyMemory(channelId: string, date: string, content: string): Promise<void> {
    this.memories.set(`daily-${channelId}-${date}`, content);
  }

  async loadDailyMemory(channelId: string, date: string): Promise<string | null> {
    return this.memories.get(`daily-${channelId}-${date}`) || null;
  }

  async saveWeeklyMemory(channelId: string, weekStart: string, content: string): Promise<void> {
    this.memories.set(`weekly-${channelId}-${weekStart}`, content);
  }

  async loadWeeklyMemory(channelId: string, weekStart: string): Promise<string | null> {
    return this.memories.get(`weekly-${channelId}-${weekStart}`) || null;
  }

  async saveMonthlyMemory(channelId: string, month: string, content: string): Promise<void> {
    this.memories.set(`monthly-${channelId}-${month}`, content);
  }

  async loadMonthlyMemory(channelId: string, month: string): Promise<string | null> {
    return this.memories.get(`monthly-${channelId}-${month}`) || null;
  }

  async saveYearlyMemory(channelId: string, year: string, content: string): Promise<void> {
    this.memories.set(`yearly-${channelId}-${year}`, content);
  }

  async loadYearlyMemory(channelId: string, year: string): Promise<string | null> {
    return this.memories.get(`yearly-${channelId}-${year}`) || null;
  }

  async loadMemoriesForChannel(channelId: string, tokenBudget: number): Promise<MemoryLoadResult> {
    return {
      content: '',
      tokensUsed: 0,
      sources: {},
    };
  }

  async loadMemoriesForServer(
    currentChannelId: string,
    allChannelIds: string[],
    tokenBudget: number
  ): Promise<MemoryLoadResult> {
    return {
      content: '',
      tokensUsed: 0,
      sources: {},
    };
  }

  getChannelMemoryPath(channelId: string): string {
    return `/mock/memory/${channelId}`;
  }
}

/**
 * Mock Scheduler
 */
export class MockScheduler implements IScheduler {
  private tasks = new Map<string, ScheduledTask & { fn: TaskFunction }>();
  private taskIdCounter = 0;

  schedule(cronExpression: string, taskFn: TaskFunction, metadata?: any): string {
    const id = `task-${Date.now()}-${this.taskIdCounter++}`;
    const task = {
      id,
      name: metadata?.name || 'unnamed',
      schedule: cronExpression,
      taskDescription: metadata?.name || '',
      channelId: metadata?.channelId || '',
      oneTime: metadata?.oneTime || false,
      enabled: true,
      createdAt: Date.now(),
      fn: taskFn,
    };
    this.tasks.set(id, task);
    return id;
  }

  list(): ScheduledTask[] {
    return Array.from(this.tasks.values()).map(({ fn, ...task }) => task);
  }

  get(taskId: string): ScheduledTask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    const { fn, ...rest } = task;
    return rest;
  }

  remove(taskId: string): void {
    this.tasks.delete(taskId);
  }

  updateSchedule(taskId: string, newSchedule: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.schedule = newSchedule;
    }
  }

  setEnabled(taskId: string, enabled: boolean): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.enabled = enabled;
    }
  }

  stopAll(): void {
    this.tasks.clear();
  }

  validate(cronExpression: string): boolean {
    return true;
  }

  // Testing utilities
  async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task && task.enabled) {
      await task.fn();
      task.lastRun = Date.now();
    }
  }
}

/**
 * Mock Token Provider
 */
export class MockTokenProvider implements ITokenProvider {
  private tokens = new Map<TokenCategory, Token>();

  async getToken(category: TokenCategory): Promise<Token | null> {
    return this.tokens.get(category) || null;
  }

  async refreshToken(category: TokenCategory): Promise<boolean> {
    return true;
  }

  async setToken(category: TokenCategory, token: Token): Promise<void> {
    this.tokens.set(category, token);
  }

  async removeToken(category: TokenCategory): Promise<void> {
    this.tokens.delete(category);
  }

  async hasToken(category: TokenCategory): Promise<boolean> {
    return this.tokens.has(category);
  }

  isTokenExpired(token: Token): boolean {
    if (!token.expiresAt) return false;
    return Date.now() >= token.expiresAt;
  }
}

/**
 * Mock Logger
 */
export class MockLogger implements ILogger {
  public logs: Array<{ level: string; message: string; args: any[] }> = [];

  info(message: string, ...args: any[]): void {
    this.logs.push({ level: 'info', message, args });
  }

  error(message: string, ...args: any[]): void {
    this.logs.push({ level: 'error', message, args });
  }

  warn(message: string, ...args: any[]): void {
    this.logs.push({ level: 'warn', message, args });
  }

  debug(message: string, ...args: any[]): void {
    this.logs.push({ level: 'debug', message, args });
  }

  // Testing utility
  clear(): void {
    this.logs = [];
  }

  // Testing utility
  hasLog(level: string, messagePattern: string | RegExp): boolean {
    return this.logs.some(log => {
      if (log.level !== level) return false;
      if (typeof messagePattern === 'string') {
        return log.message.includes(messagePattern);
      }
      return messagePattern.test(log.message);
    });
  }
}

/**
 * Mock File Store
 */
export class MockFileStore implements IFileStore {
  private files = new Map<string, string | Buffer>();
  private directories = new Set<string>();

  exists(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }

  readFile(path: string, encoding?: BufferEncoding): string {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`File not found: ${path}`);
    }
    if (Buffer.isBuffer(content)) {
      return content.toString(encoding || 'utf-8');
    }
    return content;
  }

  writeFile(path: string, content: string | Buffer, encoding?: BufferEncoding): void {
    this.files.set(path, content);
  }

  appendFile(path: string, content: string, encoding?: BufferEncoding): void {
    const existing = this.files.get(path);
    if (existing) {
      if (Buffer.isBuffer(existing)) {
        this.files.set(path, Buffer.concat([existing, Buffer.from(content, encoding)]));
      } else {
        this.files.set(path, existing + content);
      }
    } else {
      this.files.set(path, content);
    }
  }

  deleteFile(path: string): void {
    this.files.delete(path);
  }

  deleteDirectory(path: string): void {
    this.directories.delete(path);
    // Delete all files in the directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(path + '/')) {
        this.files.delete(filePath);
      }
    }
  }

  createDirectory(path: string): void {
    this.directories.add(path);
  }

  readDirectory(path: string): string[] {
    const entries: string[] = [];
    // Add files in this directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(path + '/')) {
        const relativePath = filePath.slice(path.length + 1);
        const firstPart = relativePath.split('/')[0];
        if (!entries.includes(firstPart)) {
          entries.push(firstPart);
        }
      }
    }
    // Add subdirectories
    for (const dirPath of this.directories) {
      if (dirPath.startsWith(path + '/')) {
        const relativePath = dirPath.slice(path.length + 1);
        const firstPart = relativePath.split('/')[0];
        if (!entries.includes(firstPart)) {
          entries.push(firstPart);
        }
      }
    }
    return entries;
  }

  getStats(path: string): { isFile: boolean; isDirectory: boolean; size: number; mtime: Date } {
    const isFile = this.files.has(path);
    const isDirectory = this.directories.has(path);

    let size = 0;
    if (isFile) {
      const content = this.files.get(path);
      if (Buffer.isBuffer(content)) {
        size = content.length;
      } else if (typeof content === 'string') {
        size = Buffer.byteLength(content);
      }
    }

    return {
      isFile,
      isDirectory,
      size,
      mtime: new Date(),
    };
  }
}

/**
 * Mock Document Converter for testing
 */
export class MockDocumentConverter implements IDocumentConverter {
  isSupportedFileType(contentType?: string, filename?: string): boolean {
    return contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || filename?.toLowerCase().endsWith('.docx') || false;
  }

  async convertDocxToMarkdown(buffer: Buffer, filename: string): Promise<string | null> {
    return `# Mock Markdown\n\nConverted from ${filename}`;
  }

  async convertPdfToMarkdown(buffer: Buffer, filename: string): Promise<string | null> {
    return `# Mock Markdown\n\nConverted from ${filename}`;
  }

  async convertMarkdownToDocx(markdown: string, filename: string): Promise<Buffer | null> {
    return Buffer.from(`Mock DOCX content for ${filename}`);
  }

  async convertMarkdownToPdf(markdown: string, filename: string): Promise<Buffer | null> {
    return Buffer.from(`Mock PDF content for ${filename}`);
  }
}

/**
 * Create a complete mock bot context for testing
 */
export function createMockContext(guildId: string = 'test-guild-id'): IBotContext & {
  // Testing utilities
  discord: MockDiscordAdapter;
  queryExecutor: MockQueryExecutor;
  sessionStore: MockSessionStore;
  memoryStore: MockMemoryStore;
  scheduler: MockScheduler;
  tokenProvider: MockTokenProvider;
  logger: MockLogger;
  fileStore: MockFileStore;
  documentConverter: MockDocumentConverter;
} {
  return {
    guildId,
    homeDirectory: '/tmp/test-home',
    discord: new MockDiscordAdapter(),
    queryExecutor: new MockQueryExecutor(),
    sessionStore: new MockSessionStore(),
    memoryStore: new MockMemoryStore(),
    scheduler: new MockScheduler(),
    tokenProvider: new MockTokenProvider(),
    logger: new MockLogger(),
    fileStore: new MockFileStore(),
    documentConverter: new MockDocumentConverter(),
  };
}
