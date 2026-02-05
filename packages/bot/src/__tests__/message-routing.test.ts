import { describe, it, expect, beforeEach } from 'vitest';
import { createMockContext } from './utils/mock-context.js';
import { SessionManager } from '../agent/manager.js';
import type { ITextChannel, IThreadChannel } from '../interfaces/discord.js';

/**
 * Message Routing Tests
 *
 * These tests verify that messages are routed to the correct Discord locations:
 * 1. Scheduled/cron messages go to channels (not threads)
 * 2. User message responses go to threads (lazy creation)
 * 3. Permission requests use the current channel context (thread after creation)
 */
describe('Message Routing', () => {
  let context: ReturnType<typeof createMockContext>;
  let sessionManager: SessionManager;
  let parentChannel: ITextChannel;
  let thread: IThreadChannel;

  beforeEach(async () => {
    context = createMockContext('test-guild-id');
    await context.discord.login('test-token');

    // Create a parent channel
    parentChannel = context.discord.createMockTextChannel({
      id: 'channel-1',
      name: 'general',
      guildId: 'test-guild-id',
    });

    // Create a thread
    thread = context.discord['createMockThreadChannel']({
      id: 'thread-1',
      name: 'conversation',
      parentId: parentChannel.id,
    });

    sessionManager = new SessionManager(
      context,
      '/mock/sessions',
      '/mock/workspace',
      10000
    );

    await sessionManager.initialize();
  });

  describe('channel context management', () => {
    it('should set channel context for a session', () => {
      const sessionId = 'session-1';

      sessionManager.setChannelContext(sessionId, parentChannel);

      expect(sessionManager['currentChannels'].get(sessionId)).toBe(parentChannel);
    });

    it('should update channel context when thread is created', () => {
      const sessionId = 'session-2';

      // Initially set to parent channel
      sessionManager.setChannelContext(sessionId, parentChannel);
      expect(sessionManager['currentChannels'].get(sessionId)).toBe(parentChannel);

      // Update to thread (simulating lazy thread creation)
      sessionManager.setChannelContext(sessionId, thread);
      expect(sessionManager['currentChannels'].get(sessionId)).toBe(thread);
    });

    it('should clear channel context after session ends', () => {
      const sessionId = 'session-3';

      sessionManager.setChannelContext(sessionId, thread);
      expect(sessionManager['currentChannels'].get(sessionId)).toBe(thread);

      sessionManager.clearChannelContext(sessionId);
      expect(sessionManager['currentChannels'].get(sessionId)).toBeUndefined();
    });

    it('should maintain separate contexts for multiple sessions', () => {
      const session1 = 'session-a';
      const session2 = 'session-b';

      sessionManager.setChannelContext(session1, parentChannel);
      sessionManager.setChannelContext(session2, thread);

      expect(sessionManager['currentChannels'].get(session1)).toBe(parentChannel);
      expect(sessionManager['currentChannels'].get(session2)).toBe(thread);
    });
  });

  describe('channel type detection', () => {
    it('should identify text channels correctly', () => {
      expect(parentChannel.isTextChannel()).toBe(true);
      expect(parentChannel.isThreadChannel()).toBe(false);
    });

    it('should identify thread channels correctly', () => {
      expect(thread.isTextChannel()).toBe(false);
      expect(thread.isThreadChannel()).toBe(true);
    });

    it('should track parent channel for threads', () => {
      expect(thread.parentId).toBe(parentChannel.id);
    });
  });

  describe('cron job vs user message distinction', () => {
    it('should handle cron jobs that use channels directly', () => {
      const cronSessionId = 'cron-session-1';

      // Cron jobs set channel context to the target channel
      sessionManager.setChannelContext(cronSessionId, parentChannel);

      // Verify the channel is set (not a thread)
      const currentChannel = sessionManager['currentChannels'].get(cronSessionId);
      expect(currentChannel?.isTextChannel()).toBe(true);
      expect(currentChannel?.isThreadChannel()).toBe(false);
    });

    it('should handle user messages that create threads', () => {
      const userSessionId = 'user-session-1';

      // Initially set to parent channel
      sessionManager.setChannelContext(userSessionId, parentChannel);
      expect(sessionManager['currentChannels'].get(userSessionId)).toBe(parentChannel);

      // After thread is created (lazy creation), context is updated
      sessionManager.setChannelContext(userSessionId, thread);

      // Verify the channel is now the thread
      const currentChannel = sessionManager['currentChannels'].get(userSessionId);
      expect(currentChannel?.isThreadChannel()).toBe(true);
      expect(currentChannel).toBe(thread);
    });
  });

  describe('permission request routing', () => {
    it('should use current channel context for permission requests', () => {
      const sessionId = 'permission-session-1';

      // Set channel context
      sessionManager.setChannelContext(sessionId, thread);

      // Permission requests should use the current channel context
      // This is accessed via the getCurrentChannel callback in loadDiscordTools
      const getCurrentChannel = () => {
        const entries = Array.from(sessionManager['currentChannels'].entries());
        return entries.length > 0 ? entries[0][1] : null;
      };

      const channel = getCurrentChannel();
      expect(channel).toBe(thread);
      expect(channel?.isThreadChannel()).toBe(true);
    });

    it('should send permissions to thread after lazy thread creation', () => {
      const sessionId = 'permission-session-2';

      // Start with parent channel (before thread creation)
      sessionManager.setChannelContext(sessionId, parentChannel);

      let getCurrentChannel = () => {
        return sessionManager['currentChannels'].get(sessionId) || null;
      };

      // Permission request would go to parent channel
      expect(getCurrentChannel()).toBe(parentChannel);

      // Thread is created (lazy creation during message streaming)
      sessionManager.setChannelContext(sessionId, thread);

      // Subsequent permission requests go to the thread
      expect(getCurrentChannel()).toBe(thread);
      expect(getCurrentChannel()?.isThreadChannel()).toBe(true);
    });
  });

  describe('message flow scenarios', () => {
    it('scenario: scheduled task posts to channel', () => {
      const cronSessionId = 'cron-daily-report';

      // Cron job targets a specific channel
      sessionManager.setChannelContext(cronSessionId, parentChannel);

      // Message should go to the channel
      const targetChannel = sessionManager['currentChannels'].get(cronSessionId);
      expect(targetChannel).toBe(parentChannel);
      expect(targetChannel?.isTextChannel()).toBe(true);

      // No thread should be involved
      expect(targetChannel?.isThreadChannel()).toBe(false);
    });

    it('scenario: user asks question, thread is created, permissions go to thread', () => {
      const userSessionId = 'user-question-1';

      // Step 1: User sends message in channel
      sessionManager.setChannelContext(userSessionId, parentChannel);
      expect(sessionManager['currentChannels'].get(userSessionId)).toBe(parentChannel);

      // Step 2: Bot decides to create thread (lazy creation during streaming)
      // Thread name would be derived from message content
      sessionManager.setChannelContext(userSessionId, thread);

      // Step 3: Subsequent messages (including permissions) go to thread
      const currentChannel = sessionManager['currentChannels'].get(userSessionId);
      expect(currentChannel).toBe(thread);
      expect(currentChannel?.isThreadChannel()).toBe(true);
      expect(currentChannel?.parentId).toBe(parentChannel.id);
    });

    it('scenario: user continues conversation in existing thread', () => {
      const sessionId = 'existing-thread-1';

      // User messages directly in an existing thread
      sessionManager.setChannelContext(sessionId, thread);

      // All messages stay in the thread
      const currentChannel = sessionManager['currentChannels'].get(sessionId);
      expect(currentChannel).toBe(thread);
      expect(currentChannel?.isThreadChannel()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle channel context before session is set', () => {
      const sessionId = 'not-set';

      const channel = sessionManager['currentChannels'].get(sessionId);
      expect(channel).toBeUndefined();
    });

    it('should handle multiple context updates for same session', () => {
      const sessionId = 'multi-update';

      sessionManager.setChannelContext(sessionId, parentChannel);
      expect(sessionManager['currentChannels'].get(sessionId)).toBe(parentChannel);

      sessionManager.setChannelContext(sessionId, thread);
      expect(sessionManager['currentChannels'].get(sessionId)).toBe(thread);

      sessionManager.setChannelContext(sessionId, parentChannel);
      expect(sessionManager['currentChannels'].get(sessionId)).toBe(parentChannel);
    });

    it('should handle clearing non-existent context', () => {
      const sessionId = 'does-not-exist';

      // Should not throw
      expect(() => {
        sessionManager.clearChannelContext(sessionId);
      }).not.toThrow();

      expect(sessionManager['currentChannels'].get(sessionId)).toBeUndefined();
    });
  });
});
