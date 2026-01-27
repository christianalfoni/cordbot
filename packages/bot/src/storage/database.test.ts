import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionDatabase } from './database.js';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const TEST_DB_PATH = path.join(process.cwd(), 'test-sessions.test.db');

function initTestDatabase(dbPath: string): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_mappings (
      discord_thread_id TEXT PRIMARY KEY,
      discord_channel_id TEXT NOT NULL,
      discord_message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      working_directory TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'archived'))
    );

    CREATE INDEX IF NOT EXISTS idx_session_id ON session_mappings(session_id);
    CREATE INDEX IF NOT EXISTS idx_channel_id ON session_mappings(discord_channel_id);
  `);
  db.close();
}

describe('SessionDatabase', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    // Remove existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize fresh database
    initTestDatabase(TEST_DB_PATH);
    db = new SessionDatabase(TEST_DB_PATH);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('createMapping', () => {
    it('should create a new session mapping', () => {
      db.createMapping({
        discord_thread_id: 'thread_123',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_789',
        session_id: 'sess_abc',
        working_directory: '/path/to/project',
        status: 'active',
      });

      const mapping = db.getMapping('thread_123');
      expect(mapping).toBeDefined();
      expect(mapping?.discord_thread_id).toBe('thread_123');
      expect(mapping?.session_id).toBe('sess_abc');
      expect(mapping?.status).toBe('active');
    });

    it('should set created_at and last_active_at timestamps', () => {
      db.createMapping({
        discord_thread_id: 'thread_123',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_789',
        session_id: 'sess_abc',
        working_directory: '/path/to/project',
        status: 'active',
      });

      const mapping = db.getMapping('thread_123');
      expect(mapping?.created_at).toBeTruthy();
      expect(mapping?.last_active_at).toBeTruthy();
      expect(new Date(mapping!.created_at)).toBeInstanceOf(Date);
    });
  });

  describe('getMapping', () => {
    it('should return undefined for non-existent thread', () => {
      const mapping = db.getMapping('nonexistent');
      expect(mapping).toBeUndefined();
    });

    it('should retrieve existing mapping', () => {
      db.createMapping({
        discord_thread_id: 'thread_123',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_789',
        session_id: 'sess_abc',
        working_directory: '/path/to/project',
        status: 'active',
      });

      const mapping = db.getMapping('thread_123');
      expect(mapping).toBeDefined();
      expect(mapping?.session_id).toBe('sess_abc');
    });
  });

  describe('getMappingBySessionId', () => {
    it('should retrieve mapping by session ID', () => {
      db.createMapping({
        discord_thread_id: 'thread_123',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_789',
        session_id: 'sess_abc',
        working_directory: '/path/to/project',
        status: 'active',
      });

      const mapping = db.getMappingBySessionId('sess_abc');
      expect(mapping).toBeDefined();
      expect(mapping?.discord_thread_id).toBe('thread_123');
    });
  });

  describe('getChannelSessions', () => {
    it('should return all sessions for a channel', () => {
      db.createMapping({
        discord_thread_id: 'thread_1',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_1',
        session_id: 'sess_1',
        working_directory: '/path/to/project',
        status: 'active',
      });

      db.createMapping({
        discord_thread_id: 'thread_2',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_2',
        session_id: 'sess_2',
        working_directory: '/path/to/project',
        status: 'active',
      });

      db.createMapping({
        discord_thread_id: 'thread_3',
        discord_channel_id: 'channel_789',
        discord_message_id: 'msg_3',
        session_id: 'sess_3',
        working_directory: '/path/to/project',
        status: 'active',
      });

      const sessions = db.getChannelSessions('channel_456');
      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.session_id)).toContain('sess_1');
      expect(sessions.map(s => s.session_id)).toContain('sess_2');
    });

    it('should return empty array for channel with no sessions', () => {
      const sessions = db.getChannelSessions('nonexistent');
      expect(sessions).toEqual([]);
    });
  });

  describe('getAllActive', () => {
    it('should return only active sessions', () => {
      db.createMapping({
        discord_thread_id: 'thread_1',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_1',
        session_id: 'sess_1',
        working_directory: '/path/to/project',
        status: 'active',
      });

      db.createMapping({
        discord_thread_id: 'thread_2',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_2',
        session_id: 'sess_2',
        working_directory: '/path/to/project',
        status: 'archived',
      });

      const activeSessions = db.getAllActive();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].session_id).toBe('sess_1');
    });
  });

  describe('updateLastActive', () => {
    it('should update last_active_at timestamp', async () => {
      db.createMapping({
        discord_thread_id: 'thread_123',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_789',
        session_id: 'sess_abc',
        working_directory: '/path/to/project',
        status: 'active',
      });

      const before = db.getMapping('thread_123')!.last_active_at;

      // Wait a bit to ensure timestamp differs
      await new Promise(resolve => setTimeout(resolve, 10));

      db.updateLastActive('thread_123');

      const after = db.getMapping('thread_123')!.last_active_at;
      expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    });
  });

  describe('archiveSession', () => {
    it('should change status to archived', () => {
      db.createMapping({
        discord_thread_id: 'thread_123',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_789',
        session_id: 'sess_abc',
        working_directory: '/path/to/project',
        status: 'active',
      });

      db.archiveSession('thread_123');

      const mapping = db.getMapping('thread_123');
      expect(mapping?.status).toBe('archived');
    });
  });

  describe('deleteMapping', () => {
    it('should remove mapping from database', () => {
      db.createMapping({
        discord_thread_id: 'thread_123',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_789',
        session_id: 'sess_abc',
        working_directory: '/path/to/project',
        status: 'active',
      });

      db.deleteMapping('thread_123');

      const mapping = db.getMapping('thread_123');
      expect(mapping).toBeUndefined();
    });
  });

  describe('getActiveCount', () => {
    it('should return correct count of active sessions', () => {
      db.createMapping({
        discord_thread_id: 'thread_1',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_1',
        session_id: 'sess_1',
        working_directory: '/path/to/project',
        status: 'active',
      });

      db.createMapping({
        discord_thread_id: 'thread_2',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_2',
        session_id: 'sess_2',
        working_directory: '/path/to/project',
        status: 'active',
      });

      db.createMapping({
        discord_thread_id: 'thread_3',
        discord_channel_id: 'channel_456',
        discord_message_id: 'msg_3',
        session_id: 'sess_3',
        working_directory: '/path/to/project',
        status: 'archived',
      });

      expect(db.getActiveCount()).toBe(2);
    });

    it('should return 0 when no active sessions exist', () => {
      expect(db.getActiveCount()).toBe(0);
    });
  });
});
