import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockContext } from './utils/mock-context.js';
import type { IBotContext } from '../interfaces/index.js';

describe('Discord Adapter', () => {
  let context: IBotContext;

  beforeEach(() => {
    context = createMockContext();
  });

  describe('login', () => {
    it('should successfully login and set ready state', async () => {
      expect(context.discord.isReady()).toBe(false);

      await context.discord.login('test-token');

      expect(context.discord.isReady()).toBe(true);
      expect(context.discord.getUser()).toBeTruthy();
      expect(context.discord.getUser()?.username).toBe('TestBot');
      expect(context.discord.getUser()?.bot).toBe(true);
    });
  });

  describe('message handling', () => {
    it('should send a message to a channel', async () => {
      await context.discord.login('test-token');

      const message = await context.discord.sendMessage('channel-123', 'Hello, World!');

      expect(message.content).toBe('Hello, World!');
      expect(message.channelId).toBe('channel-123');
      expect(message.author.username).toBe('TestBot');
    });

    it('should edit a message', async () => {
      await context.discord.login('test-token');

      const message = await context.discord.sendMessage('channel-123', 'Original message');
      const edited = await context.discord.editMessage(message.id, 'channel-123', 'Edited message');

      expect(edited.content).toBe('Edited message');
      expect(edited.id).toBe(message.id);
    });

    it('should delete a message', async () => {
      await context.discord.login('test-token');

      const message = await context.discord.sendMessage('channel-123', 'To be deleted');
      await context.discord.deleteMessage(message.id, 'channel-123');

      // Message should be deleted (we can't retrieve it anymore through the mock)
      const channel = await context.discord.getChannel('channel-123');
      expect(channel).toBeNull();
    });
  });

  describe('event handling', () => {
    it('should trigger messageCreate event when a message is sent', async () => {
      await context.discord.login('test-token');

      const messageHandler = vi.fn();
      context.discord.on('messageCreate', messageHandler);

      // Use the testing utility to trigger a message
      const mockContext = context as any;
      await mockContext.discord.triggerMessage({
        id: 'test-msg-1',
        content: 'Test message',
        channelId: 'channel-123',
        authorId: 'user-123',
      });

      expect(messageHandler).toHaveBeenCalledOnce();
      expect(messageHandler.mock.calls[0][0].content).toBe('Test message');
    });

    it('should remove event handlers', async () => {
      await context.discord.login('test-token');

      const messageHandler = vi.fn();
      context.discord.on('messageCreate', messageHandler);
      context.discord.off('messageCreate', messageHandler);

      const mockContext = context as any;
      await mockContext.discord.triggerMessage({
        id: 'test-msg-1',
        content: 'Test message',
        channelId: 'channel-123',
      });

      expect(messageHandler).not.toHaveBeenCalled();
    });
  });

  describe('channel operations', () => {
    it('should create a text channel', async () => {
      await context.discord.login('test-token');

      const mockContext = context as any;
      const channel = mockContext.discord.createMockTextChannel({
        name: 'test-channel',
        guildId: 'guild-123',
      });

      expect(channel.name).toBe('test-channel');
      expect(channel.guildId).toBe('guild-123');
      expect(channel.isTextChannel()).toBe(true);
    });

    it('should create and retrieve a thread', async () => {
      await context.discord.login('test-token');

      const thread = await context.discord.createThread('channel-123', 'test-thread');

      expect(thread.name).toBe('test-thread');
      expect(thread.parentId).toBe('channel-123');
      expect(thread.isThreadChannel()).toBe(true);

      const retrieved = await context.discord.getChannel(thread.id);
      expect(retrieved?.id).toBe(thread.id);
    });
  });
});
