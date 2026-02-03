import {
  SessionDatabase,
  SessionMapping as DbSessionMapping,
  NewSessionMapping as DbNewSessionMapping,
} from '../../storage/database.js';
import type {
  ISessionStore,
  SessionMapping,
  NewSessionMapping,
} from '../../interfaces/storage.js';

/**
 * Filesystem session store implementation
 * Adapts the existing SessionDatabase to the ISessionStore interface
 */
export class FileSystemSessionStore implements ISessionStore {
  private db: SessionDatabase;

  constructor(storageDir: string) {
    this.db = new SessionDatabase(storageDir);
  }

  /**
   * Map from database format to interface format
   */
  private mapFromDb(dbMapping: DbSessionMapping): SessionMapping {
    return {
      threadId: dbMapping.discord_thread_id,
      sessionId: dbMapping.session_id,
      channelId: dbMapping.discord_channel_id,
      guildId: '', // Not stored in DB currently
      messageId: dbMapping.discord_message_id,
      workingDirectory: dbMapping.working_directory,
      createdAt: new Date(dbMapping.created_at).getTime(),
      lastActive: new Date(dbMapping.last_active_at).getTime(),
      archived: dbMapping.status === 'archived',
    };
  }

  /**
   * Map from interface format to database format
   */
  private mapToDb(mapping: NewSessionMapping): DbNewSessionMapping {
    return {
      discord_thread_id: mapping.threadId,
      discord_channel_id: mapping.channelId,
      discord_message_id: mapping.messageId,
      session_id: mapping.sessionId,
      working_directory: mapping.workingDirectory,
      status: 'active',
    };
  }

  createMapping(mapping: NewSessionMapping): void {
    this.db.createMapping(this.mapToDb(mapping));
  }

  getMapping(threadId: string): SessionMapping | undefined {
    const dbMapping = this.db.getMapping(threadId);
    return dbMapping ? this.mapFromDb(dbMapping) : undefined;
  }

  getMappingByMessageId(messageId: string): SessionMapping | undefined {
    const dbMapping = this.db.getMappingByMessageId(messageId);
    return dbMapping ? this.mapFromDb(dbMapping) : undefined;
  }

  getMappingBySessionId(sessionId: string): SessionMapping | undefined {
    const dbMapping = this.db.getMappingBySessionId(sessionId);
    return dbMapping ? this.mapFromDb(dbMapping) : undefined;
  }

  getChannelSessions(channelId: string): SessionMapping[] {
    const dbMappings = this.db.getChannelSessions(channelId);
    return dbMappings.map(m => this.mapFromDb(m));
  }

  getAllActive(): SessionMapping[] {
    const dbMappings = this.db.getAllActive();
    return dbMappings.map(m => this.mapFromDb(m));
  }

  updateLastActive(threadId: string): void {
    this.db.updateLastActive(threadId);
  }

  updateSessionId(threadId: string, newSessionId: string): void {
    this.db.updateSessionId(threadId, newSessionId);
  }

  archiveSession(threadId: string): void {
    this.db.archiveSession(threadId);
  }

  deleteMapping(threadId: string): void {
    this.db.deleteMapping(threadId);
  }

  archiveOldSessions(maxAge: number): number {
    const now = Date.now();
    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000; // Convert days to milliseconds

    const activeSessions = this.db.getAllActive();
    let archived = 0;

    for (const session of activeSessions) {
      const lastActive = new Date(session.last_active_at).getTime();
      if (now - lastActive > maxAgeMs) {
        this.db.archiveSession(session.discord_thread_id);
        archived++;
      }
    }

    return archived;
  }

  getActiveCount(): number {
    return this.db.getActiveCount();
  }
}
