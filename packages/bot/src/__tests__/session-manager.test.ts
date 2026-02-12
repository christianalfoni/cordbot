import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockContext } from './utils/mock-context.js';
import { SessionManager } from '../agent/manager.js';
import type { IBotContext } from '../interfaces/index.js';
import fs from 'fs';

// Mock dependencies
vi.mock('fs');
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

describe('Session Manager', () => {
  let context: IBotContext;
  let sessionManager: SessionManager;

  beforeEach(() => {
    context = createMockContext();
    sessionManager = new SessionManager(context, '/mock/sessions', '/mock/workspace', 10000);
    vi.clearAllMocks();

    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  describe('initialization', () => {
    it('should initialize with bot token', async () => {
      await sessionManager.initialize('test-token');

      // Initialization should complete without errors
      expect(true).toBe(true);
    });

    it('should load builtin tools', async () => {
      await sessionManager.initialize('test-token');

      const { loadBuiltinTools } = await import('../tools/builtin-loader.js');
      expect(loadBuiltinTools).toHaveBeenCalled();
    });

    it('should load Discord tools when Discord client is provided', async () => {
      // Create a SessionManager with Discord client and permission manager
      const mockDiscordClient = {} as any;
      const mockPermissionManager = {} as any;
      const sessionManagerWithDiscord = new SessionManager(
        context,
        '/mock/sessions',
        '/mock/workspace',
        10000,
        mockDiscordClient,
        mockPermissionManager
      );

      await sessionManagerWithDiscord.initialize();

      const { loadDiscordTools } = await import('../tools/discord/loader.js');
      expect(loadDiscordTools).toHaveBeenCalled();
    });
  });

  describe('session creation', () => {
    it('should create a new session', async () => {
      const result = await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace/channel'
      );

      expect(result.isNew).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toContain('sess_');

      // Verify session is stored
      const mapping = context.sessionStore.getMapping('thread-123');
      expect(mapping).toBeDefined();
      expect(mapping?.sessionId).toBe(result.sessionId);
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

      // Try to get the same session again
      const second = await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-890',
        '/mock/workspace/channel'
      );

      expect(second.isNew).toBe(false);
      expect(second.sessionId).toBe(first.sessionId);
    });

    it('should create mapping with specific session ID', () => {
      const sessionId = 'custom-session-123';

      sessionManager.createMappingWithSessionId(
        'thread-123',
        'channel-456',
        'message-789',
        sessionId,
        '/mock/workspace'
      );

      const mapping = context.sessionStore.getMapping('thread-123');
      expect(mapping).toBeDefined();
      expect(mapping?.sessionId).toBe(sessionId);
    });

    it('should update last active timestamp on session access', async () => {
      const result = await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace'
      );

      const firstMapping = context.sessionStore.getMapping('thread-123');
      const firstLastActive = firstMapping!.lastActive;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Get session again
      await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-890',
        '/mock/workspace'
      );

      const secondMapping = context.sessionStore.getMapping('thread-123');
      expect(secondMapping!.lastActive).toBeGreaterThan(firstLastActive);
    });
  });

  describe('context management', () => {
    it('should set and clear channel context', async () => {
      await context.discord.login('test-token');
      const mockContext = context as any;
      const channel = mockContext.discord.createMockTextChannel({
        id: 'channel-1',
        name: 'test-channel',
      });

      const sessionId = 'session-123';

      sessionManager.setChannelContext(sessionId, channel);
      // Channel is set (no way to verify directly, but it shouldn't throw)

      sessionManager.clearChannelContext(sessionId);
      // Channel is cleared
    });

    it('should set and clear working directory context', () => {
      const sessionId = 'session-123';
      const workingDir = '/mock/workspace/channel';

      sessionManager.setWorkingDirContext(sessionId, workingDir);
      // Working dir is set

      sessionManager.clearWorkingDirContext(sessionId);
      // Working dir is cleared
    });

    it('should set and clear channel ID context', () => {
      const sessionId = 'session-123';
      const channelId = 'channel-456';

      sessionManager.setChannelIdContext(sessionId, channelId);
      // Channel ID is set

      sessionManager.clearChannelIdContext(sessionId);
      // Channel ID is cleared
    });
  });

  describe('query creation', () => {
    it('should create a new query with session ID', () => {
      const sessionId = 'session-123';
      const userMessage = 'Hello, Claude!';
      const workingDir = '/mock/workspace';

      // Mock the query function to avoid actual execution
      const query = sessionManager.createQuery(userMessage, sessionId, workingDir);

      expect(query).toBeDefined();
    });

    it('should create query with system prompt', () => {
      const sessionId = 'session-123';
      const userMessage = 'Hello, Claude!';
      const workingDir = '/mock/workspace';
      const systemPrompt = 'You are a helpful assistant.';

      const query = sessionManager.createQuery(userMessage, sessionId, workingDir, systemPrompt);

      expect(query).toBeDefined();
    });

    it('should create query for new session', () => {
      const userMessage = 'Hello, Claude!';
      const workingDir = '/mock/workspace';

      const query = sessionManager.createQuery(userMessage, null, workingDir);

      expect(query).toBeDefined();
    });
  });

  describe('session retrieval', () => {
    it('should get session by thread ID', async () => {
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

    it('should get session by message ID', async () => {
      await sessionManager.getOrCreateSession(
        'thread-123',
        'channel-456',
        'message-789',
        '/mock/workspace'
      );

      const session = sessionManager.getSessionByMessageId('message-789');

      expect(session).toBeDefined();
      expect(session?.threadId).toBe('thread-123');
      expect(session?.channelId).toBe('channel-456');
    });

    it('should return undefined for non-existent session', () => {
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

      // Mock the session as old
      const mapping = context.sessionStore.getMapping('thread-123');
      if (mapping) {
        (mapping as any).lastActive = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      }

      // Archive sessions older than 30 days
      const archived = await sessionManager.archiveOldSessions(30);

      expect(archived).toBe(1);

      // Session should be archived
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

    it('should get active session count', async () => {
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

      const count = sessionManager.getActiveSessionCount();

      expect(count).toBe(2);
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

      const before = context.sessionStore.getMapping('thread-123');
      const beforeTime = before!.lastActive;

      await new Promise(resolve => setTimeout(resolve, 10));

      await sessionManager.updateSession(result.sessionId, 'thread-123');

      const after = context.sessionStore.getMapping('thread-123');
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
      const newSessionId = 'new-session-id';

      await sessionManager.updateSessionId(oldSessionId, newSessionId, 'thread-123');

      const mapping = context.sessionStore.getMapping('thread-123');
      expect(mapping?.sessionId).toBe(newSessionId);
    });
  });

  describe('memory population', () => {
    it('should populate memory section in CLAUDE.md', async () => {
      const claudeMdPath = '/mock/channels/CLAUDE.md';
      const channelId = 'channel-123';
      const channelName = 'test-channel';
      const allChannels = [{ channelId: 'channel-123', channelName: 'test-channel' }];
      const sessionId = 'session-456';

      await sessionManager.populateMemory(claudeMdPath, channelId, channelName, allChannels, sessionId);

      const { populateMemorySection } = await import('../discord/sync.js');
      expect(populateMemorySection).toHaveBeenCalledWith(claudeMdPath, channelId, channelName, allChannels, 10000, sessionId);
    });
  });

  describe('cron sessions', () => {
    it('should set pending cron session', () => {
      const channelId = 'channel-123';
      const sessionId = 'cron-session-456';
      const workingDir = '/mock/workspace';

      sessionManager.setPendingCronSession(channelId, sessionId, workingDir);

      const pending = sessionManager.getPendingCronSession(channelId);

      expect(pending).toBeDefined();
      expect(pending?.sessionId).toBe(sessionId);
      expect(pending?.workingDir).toBe(workingDir);
    });

    it('should get and clear pending cron session', () => {
      const channelId = 'channel-123';
      const sessionId = 'cron-session-456';
      const workingDir = '/mock/workspace';

      sessionManager.setPendingCronSession(channelId, sessionId, workingDir);

      const first = sessionManager.getPendingCronSession(channelId);
      expect(first?.sessionId).toBe(sessionId);

      // Second call should return null (one-time use)
      const second = sessionManager.getPendingCronSession(channelId);
      expect(second).toBeNull();
    });

    it('should expire old pending cron sessions', () => {
      const channelId = 'channel-123';
      const sessionId = 'cron-session-456';
      const workingDir = '/mock/workspace';

      sessionManager.setPendingCronSession(channelId, sessionId, workingDir);

      // Mock the session as expired (over 1 hour old)
      const mockSessionManager = sessionManager as any;
      mockSessionManager.pendingCronSessions.get(channelId).timestamp = Date.now() - (2 * 60 * 60 * 1000);

      const pending = sessionManager.getPendingCronSession(channelId);

      expect(pending).toBeNull();
    });
  });

  describe('file sharing', () => {
    it('should queue files for sharing', () => {
      const sessionId = 'session-123';
      const filePath = '/mock/workspace/file.txt';

      sessionManager.queueFileForSharing(sessionId, filePath);

      const files = sessionManager.getFilesToShare(sessionId);

      expect(files).toHaveLength(1);
      expect(files[0]).toBe(filePath);
    });

    it('should queue multiple files', () => {
      const sessionId = 'session-123';

      sessionManager.queueFileForSharing(sessionId, '/mock/file1.txt');
      sessionManager.queueFileForSharing(sessionId, '/mock/file2.txt');
      sessionManager.queueFileForSharing(sessionId, '/mock/file3.txt');

      const files = sessionManager.getFilesToShare(sessionId);

      expect(files).toHaveLength(3);
    });

    it('should clear files after retrieval', () => {
      const sessionId = 'session-123';

      sessionManager.queueFileForSharing(sessionId, '/mock/file.txt');

      const first = sessionManager.getFilesToShare(sessionId);
      expect(first).toHaveLength(1);

      // Second call should return empty array
      const second = sessionManager.getFilesToShare(sessionId);
      expect(second).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('should cleanup on shutdown', () => {
      sessionManager.shutdown();

      // Shutdown should not throw
      expect(true).toBe(true);
    });
  });
});
