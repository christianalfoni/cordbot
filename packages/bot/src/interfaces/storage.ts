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

