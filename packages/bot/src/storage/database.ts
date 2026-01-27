import Database from 'better-sqlite3';

export interface SessionMapping {
  discord_thread_id: string;
  discord_channel_id: string;
  discord_message_id: string;
  session_id: string;
  working_directory: string;
  created_at: string;
  last_active_at: string;
  status: 'active' | 'archived';
}

export interface NewSessionMapping {
  discord_thread_id: string;
  discord_channel_id: string;
  discord_message_id: string;
  session_id: string;
  working_directory: string;
  status: 'active' | 'archived';
}

export class SessionDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  /**
   * Create a new session mapping
   */
  createMapping(mapping: NewSessionMapping): void {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO session_mappings (
        discord_thread_id,
        discord_channel_id,
        discord_message_id,
        session_id,
        working_directory,
        created_at,
        last_active_at,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      mapping.discord_thread_id,
      mapping.discord_channel_id,
      mapping.discord_message_id,
      mapping.session_id,
      mapping.working_directory,
      now,
      now,
      mapping.status
    );
  }

  /**
   * Get a session mapping by Discord thread ID
   */
  getMapping(threadId: string): SessionMapping | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM session_mappings WHERE discord_thread_id = ?
    `);

    return stmt.get(threadId) as SessionMapping | undefined;
  }

  /**
   * Get session mapping by session ID
   */
  getMappingBySessionId(sessionId: string): SessionMapping | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM session_mappings WHERE session_id = ?
    `);

    return stmt.get(sessionId) as SessionMapping | undefined;
  }

  /**
   * Get all sessions for a channel
   */
  getChannelSessions(channelId: string): SessionMapping[] {
    const stmt = this.db.prepare(`
      SELECT * FROM session_mappings WHERE discord_channel_id = ?
      ORDER BY last_active_at DESC
    `);

    return stmt.all(channelId) as SessionMapping[];
  }

  /**
   * Get all active sessions
   */
  getAllActive(): SessionMapping[] {
    const stmt = this.db.prepare(`
      SELECT * FROM session_mappings WHERE status = 'active'
      ORDER BY last_active_at DESC
    `);

    return stmt.all() as SessionMapping[];
  }

  /**
   * Update last active timestamp for a session
   */
  updateLastActive(threadId: string): void {
    const stmt = this.db.prepare(`
      UPDATE session_mappings
      SET last_active_at = ?
      WHERE discord_thread_id = ?
    `);

    stmt.run(new Date().toISOString(), threadId);
  }

  /**
   * Update session ID for a thread
   */
  updateSessionId(threadId: string, newSessionId: string): void {
    const stmt = this.db.prepare(`
      UPDATE session_mappings
      SET session_id = ?, last_active_at = ?
      WHERE discord_thread_id = ?
    `);

    stmt.run(newSessionId, new Date().toISOString(), threadId);
  }

  /**
   * Archive a session
   */
  archiveSession(threadId: string): void {
    const stmt = this.db.prepare(`
      UPDATE session_mappings
      SET status = 'archived'
      WHERE discord_thread_id = ?
    `);

    stmt.run(threadId);
  }

  /**
   * Delete a session mapping
   */
  deleteMapping(threadId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM session_mappings WHERE discord_thread_id = ?
    `);

    stmt.run(threadId);
  }

  /**
   * Get count of active sessions
   */
  getActiveCount(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM session_mappings WHERE status = 'active'
    `);

    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
