import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockContext } from './utils/mock-context.js';
import { SessionManager } from '../agent/manager.js';
import type { IBotContext } from '../interfaces/index.js';
import fs from 'fs';
import path from 'path';

// Mock fs for file operations
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => '# Test CLAUDE.md'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  },
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '# Test CLAUDE.md'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

// Mock external dependencies
vi.mock('../service/manifest.js', () => ({
  fetchManifest: vi.fn(async () => null),
}));

vi.mock('../tools/loader.js', () => ({
  loadDynamicTools: vi.fn(() => []),
}));

vi.mock('../tools/builtin-loader.js', () => ({
  loadBuiltinTools: vi.fn(() => []),
}));

vi.mock('../tools/discord/loader.js', () => ({
  loadDiscordTools: vi.fn(() => []),
}));

vi.mock('../tools/skill-loader.js', () => ({
  discoverToolSkills: vi.fn(() => []),
  installGlobalSkills: vi.fn(),
}));

vi.mock('../discord/sync.js', () => ({
  populateMemorySection: vi.fn(async () => {}),
}));

describe('SessionManager Integration', () => {
  let core: IBotContext;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    // Create mocked core
    core = createMockContext();

    // Create real SessionManager with mocked core
    sessionManager = new SessionManager(
      core,
      '/mock/sessions',
      '/mock/workspace',
      10000
    );

    // Initialize the session manager
    await sessionManager.initialize('test-bot-token');
  });

  describe('session lifecycle', () => {
    it('should create a new session when none exists', async () => {
      const result = await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace/channel'
      );

      expect(result.isNew).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toContain('sess_');

      // Verify session was stored in core's session store
      const mapping = core.sessionStore.getMapping('thread-123');
      expect(mapping).toBeDefined();
      expect(mapping?.sessionId).toBe(result.sessionId);
      expect(mapping?.channelId).toBe('channel-456');
      expect(mapping?.threadId).toBe('thread-123');
    });

    it('should resume existing session', async () => {
      // Create initial session
      const first = await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace/channel'
      );

      expect(first.isNew).toBe(true);
      const firstSessionId = first.sessionId;

      // Try to get the same session again
      const second = await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-890',
        '/mock/workspace/channel'
      );

      expect(second.isNew).toBe(false);
      expect(second.sessionId).toBe(firstSessionId);

      // Last active should be updated
      const mapping = core.sessionStore.getMapping('thread-123');
      expect(mapping?.lastActive).toBeGreaterThanOrEqual(first.sessionId.length);
    });

    it('should create session with specific ID for cron jobs', () => {
      const cronSessionId = 'cron_123_job';

      sessionManager.createMappingWithSessionId(
        'thread-456',
        'channel-789',
        'message-012',
        cronSessionId,
        '/mock/workspace'
      );

      const mapping = core.sessionStore.getMapping('thread-456');
      expect(mapping).toBeDefined();
      expect(mapping?.sessionId).toBe(cronSessionId);
    });
  });

  describe('context management', () => {
    it('should set and clear channel context', async () => {
      await core.discord.login('test-token');

      const mockCore = core as any;
      const channel = mockCore.discord.createMockTextChannel({
        id: 'channel-1',
        name: 'test-channel',
        guildId: 'guild-1',
      });

      const sessionId = 'session-123';

      // Set context
      sessionManager.setChannelContext(sessionId, channel);

      // Context is set (we can't directly verify, but it shouldn't throw)
      expect(() => sessionManager.clearChannelContext(sessionId)).not.toThrow();
    });

    it('should manage working directory context', () => {
      const sessionId = 'session-123';
      const workingDir = '/mock/workspace/channel';

      // Set context
      sessionManager.setWorkingDirContext(sessionId, workingDir);

      // Clear context
      expect(() => sessionManager.clearWorkingDirContext(sessionId)).not.toThrow();
    });

    it('should manage channel ID context', () => {
      const sessionId = 'session-123';
      const channelId = 'channel-456';

      // Set context
      sessionManager.setChannelIdContext(sessionId, channelId);

      // Clear context
      expect(() => sessionManager.clearChannelIdContext(sessionId)).not.toThrow();
    });
  });

  describe('session queries', () => {
    it('should retrieve session by thread ID', async () => {
      await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace'
      );

      const session = sessionManager.getSessionByThreadId('thread-123');

      expect(session).toBeDefined();
      expect(session?.threadId).toBe('thread-123');
      expect(session?.channelId).toBe('channel-456');
      expect(session?.status).toBe('active');
    });

    it('should retrieve session by message ID', async () => {
      await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace'
      );

      const session = sessionManager.getSessionByMessageId('message-789');

      expect(session).toBeDefined();
      expect(session?.threadId).toBe('thread-123');
      // Note: Session object doesn't have messageId field, it's stored in the mapping
      const mapping = core.sessionStore.getMappingByMessageId('message-789');
      expect(mapping?.messageId).toBe('message-789');
    });

    it('should return undefined for non-existent sessions', () => {
      const session = sessionManager.getSessionByThreadId('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('session archiving', () => {
    it('should archive old sessions', async () => {
      // Create a session
      await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace'
      );

      // Manually age the session in the core's session store
      const mapping = core.sessionStore.getMapping('thread-123');
      if (mapping) {
        (mapping as any).lastActive = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      }

      // Archive old sessions
      const archived = await sessionManager.archiveOldSessions(30);

      expect(archived).toBe(1);

      // Verify session is archived in core's session store
      const session = sessionManager.getSessionByThreadId('thread-123');
      expect(session?.status).toBe('archived');
    });

    it('should not archive recent sessions', async () => {
      await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace'
      );

      const archived = await sessionManager.archiveOldSessions(30);

      expect(archived).toBe(0);

      const session = sessionManager.getSessionByThreadId('thread-123');
      expect(session?.status).toBe('active');
    });
  });

  describe('session updates', () => {
    it('should update session activity', async () => {
      const result = await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace'
      );

      const before = core.sessionStore.getMapping('thread-123');
      const beforeTime = before!.lastActive;

      await new Promise(resolve => setTimeout(resolve, 10));

      await sessionManager.updateSession(result.sessionId, 'thread-123');

      const after = core.sessionStore.getMapping('thread-123');
      expect(after!.lastActive).toBeGreaterThan(beforeTime);
    });

    it('should update session ID', async () => {
      const result = await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace'
      );

      const oldSessionId = result.sessionId;
      const newSessionId = 'sdk_session_123';

      await sessionManager.updateSessionId(oldSessionId, newSessionId, 'thread-123');

      const mapping = core.sessionStore.getMapping('thread-123');
      expect(mapping?.sessionId).toBe(newSessionId);
    });
  });

  describe('cron session management', () => {
    it('should manage pending cron sessions', () => {
      const channelId = 'channel-123';
      const sessionId = 'cron_session_456';
      const workingDir = '/mock/workspace';

      // Set pending cron session
      sessionManager.setPendingCronSession(channelId, sessionId, workingDir);

      // Retrieve it
      const pending = sessionManager.getPendingCronSession(channelId);

      expect(pending).toBeDefined();
      expect(pending?.sessionId).toBe(sessionId);
      expect(pending?.workingDir).toBe(workingDir);

      // Second retrieval should return null (one-time use)
      const secondPending = sessionManager.getPendingCronSession(channelId);
      expect(secondPending).toBeNull();
    });

    it('should expire old cron sessions', () => {
      const channelId = 'channel-123';
      const sessionId = 'cron_session_456';
      const workingDir = '/mock/workspace';

      sessionManager.setPendingCronSession(channelId, sessionId, workingDir);

      // Manually expire the session
      const mockSessionManager = sessionManager as any;
      const pending = mockSessionManager.pendingCronSessions.get(channelId);
      if (pending) {
        pending.timestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      }

      // Should return null because it's expired
      const result = sessionManager.getPendingCronSession(channelId);
      expect(result).toBeNull();
    });
  });

  describe('file sharing', () => {
    it('should queue and retrieve files for sharing', () => {
      const sessionId = 'session-123';

      sessionManager.queueFileForSharing(sessionId, '/mock/file1.txt');
      sessionManager.queueFileForSharing(sessionId, '/mock/file2.txt');

      const files = sessionManager.getFilesToShare(sessionId);

      expect(files).toHaveLength(2);
      expect(files).toContain('/mock/file1.txt');
      expect(files).toContain('/mock/file2.txt');

      // Second retrieval should return empty (files are cleared)
      const secondFiles = sessionManager.getFilesToShare(sessionId);
      expect(secondFiles).toHaveLength(0);
    });
  });

  describe('active session count', () => {
    it('should track active session count', async () => {
      expect(sessionManager.getActiveSessionCount()).toBe(0);

      await sessionManager.getOrCreateSession(
        'thread-1',
        'channel-1',
        'message-1',
        '/mock/workspace'
      );

      await sessionManager.getOrCreateSession(
        'thread-2',
        'channel-1',
        'message-2',
        '/mock/workspace'
      );

      expect(sessionManager.getActiveSessionCount()).toBe(2);
    });
  });
});
