import fs from 'fs';
import path from 'path';

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

interface IndexMap {
  [key: string]: string; // Maps session_id or channel_id to thread_id
}

interface ChannelIndexMap {
  [key: string]: string[]; // Maps channel_id to array of thread_ids
}

export class SessionDatabase {
  private sessionsDir: string;
  private indexesDir: string;
  private sessionIndexPath: string;
  private channelIndexPath: string;

  constructor(storageDir: string) {
    this.sessionsDir = path.join(storageDir, 'sessions');
    this.indexesDir = path.join(storageDir, 'indexes');
    this.sessionIndexPath = path.join(this.indexesDir, 'by-session.json');
    this.channelIndexPath = path.join(this.indexesDir, 'by-channel.json');

    // Ensure directories exist
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    fs.mkdirSync(this.indexesDir, { recursive: true });

    // Initialize index files if they don't exist
    if (!fs.existsSync(this.sessionIndexPath)) {
      fs.writeFileSync(this.sessionIndexPath, '{}', 'utf-8');
    }
    if (!fs.existsSync(this.channelIndexPath)) {
      fs.writeFileSync(this.channelIndexPath, '{}', 'utf-8');
    }
  }

  private getSessionPath(threadId: string): string {
    return path.join(this.sessionsDir, `${threadId}.json`);
  }

  private readSessionIndex(): IndexMap {
    try {
      const data = fs.readFileSync(this.sessionIndexPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private writeSessionIndex(index: IndexMap): void {
    fs.writeFileSync(this.sessionIndexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  private readChannelIndex(): ChannelIndexMap {
    try {
      const data = fs.readFileSync(this.channelIndexPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private writeChannelIndex(index: ChannelIndexMap): void {
    fs.writeFileSync(this.channelIndexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  private updateIndexes(mapping: SessionMapping, remove = false): void {
    // Update session index
    const sessionIndex = this.readSessionIndex();
    if (remove) {
      delete sessionIndex[mapping.session_id];
    } else {
      sessionIndex[mapping.session_id] = mapping.discord_thread_id;
    }
    this.writeSessionIndex(sessionIndex);

    // Update channel index
    const channelIndex = this.readChannelIndex();
    if (remove) {
      const threadIds = channelIndex[mapping.discord_channel_id] || [];
      channelIndex[mapping.discord_channel_id] = threadIds.filter(
        (id) => id !== mapping.discord_thread_id
      );
      if (channelIndex[mapping.discord_channel_id].length === 0) {
        delete channelIndex[mapping.discord_channel_id];
      }
    } else {
      if (!channelIndex[mapping.discord_channel_id]) {
        channelIndex[mapping.discord_channel_id] = [];
      }
      if (!channelIndex[mapping.discord_channel_id].includes(mapping.discord_thread_id)) {
        channelIndex[mapping.discord_channel_id].push(mapping.discord_thread_id);
      }
    }
    this.writeChannelIndex(channelIndex);
  }

  /**
   * Create a new session mapping
   */
  createMapping(mapping: NewSessionMapping): void {
    const now = new Date().toISOString();

    const sessionMapping: SessionMapping = {
      ...mapping,
      created_at: now,
      last_active_at: now,
    };

    const sessionPath = this.getSessionPath(mapping.discord_thread_id);
    fs.writeFileSync(sessionPath, JSON.stringify(sessionMapping, null, 2), 'utf-8');

    this.updateIndexes(sessionMapping);
  }

  /**
   * Get a session mapping by Discord thread ID
   */
  getMapping(threadId: string): SessionMapping | undefined {
    const sessionPath = this.getSessionPath(threadId);

    if (!fs.existsSync(sessionPath)) {
      return undefined;
    }

    try {
      const data = fs.readFileSync(sessionPath, 'utf-8');
      return JSON.parse(data) as SessionMapping;
    } catch {
      return undefined;
    }
  }

  /**
   * Get session mapping by session ID
   */
  getMappingBySessionId(sessionId: string): SessionMapping | undefined {
    const sessionIndex = this.readSessionIndex();
    const threadId = sessionIndex[sessionId];

    if (!threadId) {
      return undefined;
    }

    return this.getMapping(threadId);
  }

  /**
   * Get session mapping by Discord message ID
   * Useful for detecting replies to bot messages
   */
  getMappingByMessageId(messageId: string): SessionMapping | undefined {
    // Read all session files to find matching message ID
    const files = fs.readdirSync(this.sessionsDir);

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      try {
        const sessionPath = path.join(this.sessionsDir, file);
        const data = fs.readFileSync(sessionPath, 'utf-8');
        const mapping = JSON.parse(data) as SessionMapping;

        if (mapping.discord_message_id === messageId && mapping.status === 'active') {
          return mapping;
        }
      } catch {
        // Skip invalid files
        continue;
      }
    }

    return undefined;
  }

  /**
   * Get all sessions for a channel
   */
  getChannelSessions(channelId: string): SessionMapping[] {
    const channelIndex = this.readChannelIndex();
    const threadIds = channelIndex[channelId] || [];

    const sessions = threadIds
      .map((threadId) => this.getMapping(threadId))
      .filter((mapping): mapping is SessionMapping => mapping !== undefined);

    // Sort by last_active_at DESC
    return sessions.sort(
      (a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime()
    );
  }

  /**
   * Get all active sessions
   */
  getAllActive(): SessionMapping[] {
    const sessions: SessionMapping[] = [];

    // Read all session files
    const files = fs.readdirSync(this.sessionsDir);

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      try {
        const sessionPath = path.join(this.sessionsDir, file);
        const data = fs.readFileSync(sessionPath, 'utf-8');
        const mapping = JSON.parse(data) as SessionMapping;

        if (mapping.status === 'active') {
          sessions.push(mapping);
        }
      } catch {
        // Skip invalid files
        continue;
      }
    }

    // Sort by last_active_at DESC
    return sessions.sort(
      (a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime()
    );
  }

  /**
   * Update last active timestamp for a session
   */
  updateLastActive(threadId: string): void {
    const mapping = this.getMapping(threadId);

    if (!mapping) {
      return;
    }

    mapping.last_active_at = new Date().toISOString();

    const sessionPath = this.getSessionPath(threadId);
    fs.writeFileSync(sessionPath, JSON.stringify(mapping, null, 2), 'utf-8');
  }

  /**
   * Update session ID for a thread
   */
  updateSessionId(threadId: string, newSessionId: string): void {
    const mapping = this.getMapping(threadId);

    if (!mapping) {
      return;
    }

    // Remove old session index entry
    const sessionIndex = this.readSessionIndex();
    delete sessionIndex[mapping.session_id];

    // Update mapping
    mapping.session_id = newSessionId;
    mapping.last_active_at = new Date().toISOString();

    // Add new session index entry
    sessionIndex[newSessionId] = threadId;
    this.writeSessionIndex(sessionIndex);

    // Write updated mapping
    const sessionPath = this.getSessionPath(threadId);
    fs.writeFileSync(sessionPath, JSON.stringify(mapping, null, 2), 'utf-8');
  }

  /**
   * Archive a session
   */
  archiveSession(threadId: string): void {
    const mapping = this.getMapping(threadId);

    if (!mapping) {
      return;
    }

    mapping.status = 'archived';

    const sessionPath = this.getSessionPath(threadId);
    fs.writeFileSync(sessionPath, JSON.stringify(mapping, null, 2), 'utf-8');
  }

  /**
   * Delete a session mapping
   */
  deleteMapping(threadId: string): void {
    const mapping = this.getMapping(threadId);

    if (!mapping) {
      return;
    }

    // Remove indexes
    this.updateIndexes(mapping, true);

    // Delete session file
    const sessionPath = this.getSessionPath(threadId);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  }

  /**
   * Get count of active sessions
   */
  getActiveCount(): number {
    let count = 0;

    const files = fs.readdirSync(this.sessionsDir);

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      try {
        const sessionPath = path.join(this.sessionsDir, file);
        const data = fs.readFileSync(sessionPath, 'utf-8');
        const mapping = JSON.parse(data) as SessionMapping;

        if (mapping.status === 'active') {
          count++;
        }
      } catch {
        // Skip invalid files
        continue;
      }
    }

    return count;
  }

  /**
   * Close the database connection (no-op for filesystem storage)
   */
  close(): void {
    // No cleanup needed for filesystem storage
  }
}
