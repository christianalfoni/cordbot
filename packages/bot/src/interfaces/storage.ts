/**
 * Session mapping between Discord threads and Claude sessions
 */
export interface SessionMapping {
  threadId: string;
  sessionId: string;
  channelId: string;
  guildId: string;
  messageId: string;
  workingDirectory: string;
  createdAt: number;
  lastActive: number;
  archived?: boolean;
}

/**
 * Input for creating a new session mapping
 */
export interface NewSessionMapping {
  threadId: string;
  sessionId: string;
  channelId: string;
  guildId: string;
  messageId: string;
  workingDirectory: string;
}

/**
 * Session store interface - abstracts session persistence
 */
export interface ISessionStore {
  /**
   * Create a new session mapping
   */
  createMapping(mapping: NewSessionMapping): void;

  /**
   * Get a session mapping by thread ID
   */
  getMapping(threadId: string): SessionMapping | undefined;

  /**
   * Get a session mapping by message ID
   */
  getMappingByMessageId(messageId: string): SessionMapping | undefined;

  /**
   * Get a session mapping by session ID
   */
  getMappingBySessionId(sessionId: string): SessionMapping | undefined;

  /**
   * Get all session mappings for a channel
   */
  getChannelSessions(channelId: string): SessionMapping[];

  /**
   * Get all active (non-archived) session mappings
   */
  getAllActive(): SessionMapping[];

  /**
   * Update the last active timestamp for a session
   */
  updateLastActive(threadId: string): void;

  /**
   * Update the session ID for a thread (used when resuming)
   */
  updateSessionId(threadId: string, newSessionId: string): void;

  /**
   * Archive a session (mark as inactive)
   */
  archiveSession(threadId: string): void;

  /**
   * Delete a session mapping
   */
  deleteMapping(threadId: string): void;

  /**
   * Archive sessions older than the specified age (in days)
   */
  archiveOldSessions(maxAge: number): number;

  /**
   * Get count of active sessions
   */
  getActiveCount(): number;
}

/**
 * Raw memory entry for a single message/event
 */
export interface RawMemoryEntry {
  timestamp: number;
  author: string;
  content: string;
  channelId: string;
}

/**
 * Memory load result with token budget tracking
 */
export interface MemoryLoadResult {
  content: string;
  tokensUsed: number;
  sources: {
    raw?: number;
    daily?: number;
    weekly?: number;
    monthly?: number;
  };
}

/**
 * Memory store interface - abstracts memory persistence and retrieval
 */
export interface IMemoryStore {
  /**
   * Save raw memory entries for a channel
   */
  saveRawMemory(channelId: string, entries: RawMemoryEntry[]): Promise<void>;

  /**
   * Load raw memories for a specific date
   */
  loadRawMemories(channelId: string, date: string): Promise<RawMemoryEntry[]>;

  /**
   * Save a daily summary
   */
  saveDailyMemory(channelId: string, date: string, content: string): Promise<void>;

  /**
   * Load daily summary for a specific date
   */
  loadDailyMemory(channelId: string, date: string): Promise<string | null>;

  /**
   * Save a weekly summary
   */
  saveWeeklyMemory(channelId: string, weekStart: string, content: string): Promise<void>;

  /**
   * Load weekly summary for a specific week
   */
  loadWeeklyMemory(channelId: string, weekStart: string): Promise<string | null>;

  /**
   * Save a monthly summary
   */
  saveMonthlyMemory(channelId: string, month: string, content: string): Promise<void>;

  /**
   * Load monthly summary for a specific month
   */
  loadMonthlyMemory(channelId: string, month: string): Promise<string | null>;

  /**
   * Load all relevant memories for a channel within a token budget
   */
  loadMemoriesForChannel(channelId: string, tokenBudget: number): Promise<MemoryLoadResult>;

  /**
   * Get the channel's memory directory path
   */
  getChannelMemoryPath(channelId: string): string;
}
