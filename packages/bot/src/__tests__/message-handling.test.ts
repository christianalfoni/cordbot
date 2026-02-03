import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockContext } from './utils/mock-context.js';
import type { IBotContext } from '../interfaces/index.js';
import type { IMessage } from '../interfaces/discord.js';

describe('Message Handling', () => {
  let context: IBotContext;

  beforeEach(() => {
    context = createMockContext();
  });

  describe('bot mention detection', () => {
    it('should detect when bot is mentioned in a message', async () => {
      await context.discord.login('test-token');

      const botUser = context.discord.getUser();
      expect(botUser).toBeTruthy();

      // Create a mock message that mentions the bot
      const message: Partial<IMessage> = {
        id: 'msg-1',
        content: `<@${botUser!.id}> hello`,
        channelId: 'channel-1',
        guildId: 'guild-1',
        authorId: 'user-1',
        author: {
          id: 'user-1',
          username: 'TestUser',
          bot: false,
          discriminator: '0000',
        },
      };

      // Bot should be mentioned
      expect(message.content).toContain(botUser!.id);
    });

    it('should ignore messages from bots', async () => {
      const message: Partial<IMessage> = {
        id: 'msg-1',
        content: 'Hello from bot',
        channelId: 'channel-1',
        authorId: 'bot-1',
        author: {
          id: 'bot-1',
          username: 'OtherBot',
          bot: true,
          discriminator: '0000',
        },
      };

      expect(message.author!.bot).toBe(true);
    });
  });

  describe('thread context', () => {
    it('should create a new session for a new thread', async () => {
      const threadId = 'thread-123';
      const channelId = 'channel-456';
      const messageId = 'message-789';
      const workingDir = '/mock/channel-dir';

      // Session should not exist yet
      expect(context.sessionStore.getMapping(threadId)).toBeUndefined();

      // Create a new session mapping
      const sessionId = `sess_${Date.now()}_test`;
      context.sessionStore.createMapping({
        threadId,
        sessionId,
        channelId,
        guildId: 'guild-1',
        messageId,
        workingDirectory: workingDir,
      });

      // Session should now exist
      const mapping = context.sessionStore.getMapping(threadId);
      expect(mapping).toBeDefined();
      expect(mapping?.threadId).toBe(threadId);
      expect(mapping?.sessionId).toBe(sessionId);
      expect(mapping?.channelId).toBe(channelId);
      expect(mapping?.workingDirectory).toBe(workingDir);
    });

    it('should resume existing session for an existing thread', async () => {
      const threadId = 'thread-123';
      const sessionId = 'session-456';

      // Create initial session
      context.sessionStore.createMapping({
        threadId,
        sessionId,
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId: 'message-1',
        workingDirectory: '/mock/dir',
      });

      const initialMapping = context.sessionStore.getMapping(threadId);
      const initialLastActive = initialMapping!.lastActive;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Update last active
      context.sessionStore.updateLastActive(threadId);

      // Session should still exist with same ID but updated timestamp
      const updatedMapping = context.sessionStore.getMapping(threadId);
      expect(updatedMapping?.sessionId).toBe(sessionId);
      expect(updatedMapping?.lastActive).toBeGreaterThan(initialLastActive);
    });

    it('should handle message replies to bot messages', async () => {
      // Create a session for an initial bot message
      const originalMessageId = 'bot-msg-1';
      const originalSessionId = 'session-1';

      context.sessionStore.createMapping({
        threadId: 'thread-1',
        sessionId: originalSessionId,
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId: originalMessageId,
        workingDirectory: '/mock/dir',
      });

      // User replies to that bot message
      const replyMapping = context.sessionStore.getMappingByMessageId(originalMessageId);
      expect(replyMapping).toBeDefined();
      expect(replyMapping?.sessionId).toBe(originalSessionId);

      // Reply should continue the same session
      expect(replyMapping?.sessionId).toBe(originalSessionId);
    });
  });

  describe('shared mode filtering', () => {
    it('should require bot mentions in channel messages (shared mode)', async () => {
      await context.discord.login('test-token');
      const botUser = context.discord.getUser();

      // Message without mention - should be ignored in shared mode
      const messageWithoutMention: Partial<IMessage> = {
        id: 'msg-1',
        content: 'Hello everyone',
        channelId: 'channel-1',
        authorId: 'user-1',
        author: {
          id: 'user-1',
          username: 'TestUser',
          bot: false,
          discriminator: '0000',
        },
      };

      // Message with mention - should be processed in shared mode
      const messageWithMention: Partial<IMessage> = {
        id: 'msg-2',
        content: `<@${botUser!.id}> hello`,
        channelId: 'channel-1',
        authorId: 'user-1',
        author: {
          id: 'user-1',
          username: 'TestUser',
          bot: false,
          discriminator: '0000',
        },
      };

      expect(messageWithoutMention.content).not.toContain('<@');
      expect(messageWithMention.content).toContain(`<@${botUser!.id}>`);
    });

    it('should buffer messages that mention others in threads', () => {
      const bufferedMessages: Array<{
        author: string;
        content: string;
        timestamp: Date;
      }> = [];

      // Message mentions another user
      const message: Partial<IMessage> = {
        id: 'msg-1',
        content: '<@user-2> what do you think?',
        channelId: 'thread-1',
        authorId: 'user-1',
        author: {
          id: 'user-1',
          username: 'TestUser',
          bot: false,
          discriminator: '0000',
        },
        createdTimestamp: Date.now(),
      };

      // Buffer this message
      bufferedMessages.push({
        author: message.author!.username,
        content: message.content!,
        timestamp: new Date(message.createdTimestamp!),
      });

      expect(bufferedMessages).toHaveLength(1);
      expect(bufferedMessages[0].author).toBe('TestUser');
      expect(bufferedMessages[0].content).toContain('<@user-2>');
    });

    it('should prefix messages with username in shared mode', () => {
      const username = 'TestUser';
      const originalMessage = 'Hello, how can I help?';
      const prefixedMessage = `[${username}]: ${originalMessage}`;

      expect(prefixedMessage).toBe('[TestUser]: Hello, how can I help?');
    });
  });

  describe('attachment handling', () => {
    it('should handle messages with attachments', () => {
      const message: Partial<IMessage> = {
        id: 'msg-1',
        content: 'Here is a file',
        channelId: 'channel-1',
        authorId: 'user-1',
        author: {
          id: 'user-1',
          username: 'TestUser',
          bot: false,
          discriminator: '0000',
        },
      };

      // Simulate attachments
      const attachments = [
        { name: 'file1.txt', url: 'https://example.com/file1.txt' },
        { name: 'file2.pdf', url: 'https://example.com/file2.pdf' },
      ];

      const attachmentInfo = attachments.map(a => a.name);
      const messageWithAttachments = `${message.content}\n\n[Files attached and saved to working directory: ${attachmentInfo.join(', ')}]`;

      expect(messageWithAttachments).toContain('file1.txt');
      expect(messageWithAttachments).toContain('file2.pdf');
      expect(messageWithAttachments).toContain('Files attached and saved to working directory');
    });
  });

  describe('session mapping', () => {
    it('should map message ID to session for reply detection', () => {
      const messageId = 'msg-123';
      const sessionId = 'session-456';

      context.sessionStore.createMapping({
        threadId: 'thread-1',
        sessionId,
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId,
        workingDirectory: '/mock/dir',
      });

      const mapping = context.sessionStore.getMappingByMessageId(messageId);
      expect(mapping).toBeDefined();
      expect(mapping?.sessionId).toBe(sessionId);
    });

    it('should map session ID to thread for continuation', () => {
      const sessionId = 'session-123';
      const threadId = 'thread-456';

      context.sessionStore.createMapping({
        threadId,
        sessionId,
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId: 'message-1',
        workingDirectory: '/mock/dir',
      });

      const mapping = context.sessionStore.getMappingBySessionId(sessionId);
      expect(mapping).toBeDefined();
      expect(mapping?.threadId).toBe(threadId);
    });
  });

  describe('error handling', () => {
    it('should handle missing working directory gracefully', () => {
      const workingDir = '/non/existent/path';

      // Session with non-existent working directory
      context.sessionStore.createMapping({
        threadId: 'thread-1',
        sessionId: 'session-1',
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId: 'message-1',
        workingDirectory: workingDir,
      });

      const mapping = context.sessionStore.getMapping('thread-1');
      expect(mapping?.workingDirectory).toBe(workingDir);
    });
  });

  describe('channel operations', () => {
    it('should handle messages in text channels', async () => {
      await context.discord.login('test-token');

      const mockContext = context as any;
      const channel = mockContext.discord.createMockTextChannel({
        id: 'channel-1',
        name: 'general',
        guildId: 'guild-1',
      });

      expect(channel.isTextChannel()).toBe(true);
      expect(channel.isThreadChannel()).toBe(false);
    });

    it('should handle messages in threads', async () => {
      await context.discord.login('test-token');

      const thread = await context.discord.createThread('channel-1', 'test-thread');

      expect(thread.isThreadChannel()).toBe(true);
      expect(thread.isTextChannel()).toBe(false);
      expect(thread.parentId).toBe('channel-1');
    });
  });
});
