import { describe, it, expect, beforeEach } from 'vitest';
import { createMockContext } from './utils/mock-context.js';
import type { IBotContext } from '../interfaces/index.js';

describe('Session Store', () => {
  let context: IBotContext;

  beforeEach(() => {
    context = createMockContext();
  });

  describe('session mapping', () => {
    it('should create and retrieve a session mapping', () => {
      context.sessionStore.createMapping({
        threadId: 'thread-123',
        sessionId: 'session-456',
        channelId: 'channel-789',
        guildId: 'guild-012',
        messageId: 'message-345',
        workingDirectory: '/tmp/test',
      });

      const mapping = context.sessionStore.getMapping('thread-123');

      expect(mapping).toBeDefined();
      expect(mapping?.threadId).toBe('thread-123');
      expect(mapping?.sessionId).toBe('session-456');
      expect(mapping?.channelId).toBe('channel-789');
      expect(mapping?.createdAt).toBeTruthy();
      expect(mapping?.lastActive).toBeTruthy();
    });

    it('should retrieve session by message ID', () => {
      context.sessionStore.createMapping({
        threadId: 'thread-123',
        sessionId: 'session-456',
        channelId: 'channel-789',
        guildId: 'guild-012',
        messageId: 'message-345',
        workingDirectory: '/tmp/test',
      });

      const mapping = context.sessionStore.getMappingByMessageId('message-345');

      expect(mapping).toBeDefined();
      expect(mapping?.threadId).toBe('thread-123');
    });

    it('should retrieve session by session ID', () => {
      context.sessionStore.createMapping({
        threadId: 'thread-123',
        sessionId: 'session-456',
        channelId: 'channel-789',
        guildId: 'guild-012',
        messageId: 'message-345',
        workingDirectory: '/tmp/test',
      });

      const mapping = context.sessionStore.getMappingBySessionId('session-456');

      expect(mapping).toBeDefined();
      expect(mapping?.threadId).toBe('thread-123');
    });

    it('should return undefined for non-existent session', () => {
      const mapping = context.sessionStore.getMapping('non-existent');

      expect(mapping).toBeUndefined();
    });
  });

  describe('session management', () => {
    beforeEach(() => {
      context.sessionStore.createMapping({
        threadId: 'thread-1',
        sessionId: 'session-1',
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId: 'message-1',
        workingDirectory: '/tmp/test-1',
      });
    });

    it('should update last active timestamp', () => {
      const before = context.sessionStore.getMapping('thread-1');
      const beforeTime = before?.lastActive || 0;

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        context.sessionStore.updateLastActive('thread-1');

        const after = context.sessionStore.getMapping('thread-1');
        const afterTime = after?.lastActive || 0;

        expect(afterTime).toBeGreaterThan(beforeTime);
      }, 10);
    });

    it('should update session ID', () => {
      context.sessionStore.updateSessionId('thread-1', 'new-session-id');

      const mapping = context.sessionStore.getMapping('thread-1');

      expect(mapping?.sessionId).toBe('new-session-id');
    });

    it('should archive a session', () => {
      context.sessionStore.archiveSession('thread-1');

      const mapping = context.sessionStore.getMapping('thread-1');
      const activeSessions = context.sessionStore.getAllActive();

      expect(mapping?.archived).toBe(true);
      expect(activeSessions).toHaveLength(0);
    });

    it('should delete a session mapping', () => {
      context.sessionStore.deleteMapping('thread-1');

      const mapping = context.sessionStore.getMapping('thread-1');

      expect(mapping).toBeUndefined();
    });
  });

  describe('session queries', () => {
    beforeEach(() => {
      // Create multiple sessions
      context.sessionStore.createMapping({
        threadId: 'thread-1',
        sessionId: 'session-1',
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId: 'message-1',
        workingDirectory: '/tmp/test-1',
      });

      context.sessionStore.createMapping({
        threadId: 'thread-2',
        sessionId: 'session-2',
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId: 'message-2',
        workingDirectory: '/tmp/test-2',
      });

      context.sessionStore.createMapping({
        threadId: 'thread-3',
        sessionId: 'session-3',
        channelId: 'channel-2',
        guildId: 'guild-1',
        messageId: 'message-3',
        workingDirectory: '/tmp/test-3',
      });
    });

    it('should get all sessions for a channel', () => {
      const channel1Sessions = context.sessionStore.getChannelSessions('channel-1');
      const channel2Sessions = context.sessionStore.getChannelSessions('channel-2');

      expect(channel1Sessions).toHaveLength(2);
      expect(channel2Sessions).toHaveLength(1);
    });

    it('should get all active sessions', () => {
      const activeSessions = context.sessionStore.getAllActive();

      expect(activeSessions).toHaveLength(3);
    });

    it('should get active count', () => {
      const count = context.sessionStore.getActiveCount();

      expect(count).toBe(3);

      context.sessionStore.archiveSession('thread-1');

      const newCount = context.sessionStore.getActiveCount();

      expect(newCount).toBe(2);
    });

    it('should archive old sessions', () => {
      // Mock the sessions as old by manipulating lastActive timestamp
      const sessions = context.sessionStore.getAllActive();
      const oldTimestamp = Date.now() - (2 * 24 * 60 * 60 * 1000); // 2 days ago

      sessions.forEach(session => {
        // Update last active to be old
        (session as any).lastActive = oldTimestamp;
      });

      // Archive sessions older than 1 day
      const archivedCount = context.sessionStore.archiveOldSessions(1);

      expect(archivedCount).toBe(3);
      expect(context.sessionStore.getActiveCount()).toBe(0);
    });
  });
});
