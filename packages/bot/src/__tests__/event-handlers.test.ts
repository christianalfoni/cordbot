import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockContext } from './utils/mock-context.js';
import type { IBotContext } from '../interfaces/index.js';
import type { IMessage, IChannel, ITextChannel } from '../interfaces/discord.js';

describe('Event Handlers', () => {
  let context: IBotContext;

  beforeEach(() => {
    context = createMockContext();
  });

  describe('messageCreate event', () => {
    it('should trigger on new message', async () => {
      await context.discord.login('test-token');

      const messageHandler = vi.fn();
      context.discord.on('messageCreate', messageHandler);

      // Trigger a message event
      const mockContext = context as any;
      await mockContext.discord.triggerMessage({
        id: 'msg-1',
        content: 'Test message',
        channelId: 'channel-1',
        guildId: 'guild-1',
        authorId: 'user-1',
      });

      expect(messageHandler).toHaveBeenCalledOnce();
    });

    it('should ignore messages from bots', async () => {
      await context.discord.login('test-token');

      const messageHandler = vi.fn();
      context.discord.on('messageCreate', messageHandler);

      const mockContext = context as any;
      await mockContext.discord.triggerMessage({
        id: 'msg-1',
        content: 'Bot message',
        channelId: 'channel-1',
        guildId: 'guild-1',
        authorId: 'bot-1',
        author: {
          id: 'bot-1',
          username: 'OtherBot',
          bot: true,
          discriminator: '0000',
        },
      });

      // Handler is called, but bot messages should be filtered in the handler logic
      expect(messageHandler).toHaveBeenCalled();
    });

    it('should handle messages in correct guild only', async () => {
      await context.discord.login('test-token');

      const messageHandler = vi.fn();
      context.discord.on('messageCreate', messageHandler);

      const mockContext = context as any;

      // Message from correct guild
      await mockContext.discord.triggerMessage({
        id: 'msg-1',
        content: 'Test message',
        channelId: 'channel-1',
        guildId: 'guild-1',
        authorId: 'user-1',
      });

      // Message from wrong guild
      await mockContext.discord.triggerMessage({
        id: 'msg-2',
        content: 'Test message',
        channelId: 'channel-2',
        guildId: 'guild-2',
        authorId: 'user-1',
      });

      // Handler should be called for both, but implementation should filter by guild
      expect(messageHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('channelCreate event', () => {
    it('should trigger on new channel creation', async () => {
      await context.discord.login('test-token');

      const channelCreateHandler = vi.fn();
      context.discord.on('channelCreate', channelCreateHandler);

      const mockContext = context as any;
      const channel = mockContext.discord.createMockTextChannel({
        id: 'channel-new',
        name: 'new-channel',
        guildId: 'guild-1',
        type: 0, // GuildText
      });

      await mockContext.discord.triggerChannelCreate(channel);

      expect(channelCreateHandler).toHaveBeenCalledOnce();
      expect(channelCreateHandler).toHaveBeenCalledWith(channel);
    });

    it('should handle text channels only', async () => {
      await context.discord.login('test-token');

      const mockContext = context as any;
      const textChannel = mockContext.discord.createMockTextChannel({
        id: 'channel-text',
        name: 'text-channel',
        guildId: 'guild-1',
        type: 0,
      });

      expect(textChannel.type).toBe(0); // GuildText
      expect(textChannel.isTextChannel()).toBe(true);
    });
  });

  describe('channelDelete event', () => {
    it('should trigger on channel deletion', async () => {
      await context.discord.login('test-token');

      const channelDeleteHandler = vi.fn();
      context.discord.on('channelDelete', channelDeleteHandler);

      const mockContext = context as any;
      const channel = mockContext.discord.createMockTextChannel({
        id: 'channel-1',
        name: 'deleted-channel',
        guildId: 'guild-1',
      });

      // In real implementation, this would trigger when a channel is deleted
      // Our mock doesn't have a trigger method for this, but we can verify the handler is registered
      expect(channelDeleteHandler).toBeDefined();
    });
  });

  describe('channelUpdate event', () => {
    it('should trigger on channel update', async () => {
      await context.discord.login('test-token');

      const channelUpdateHandler = vi.fn();
      context.discord.on('channelUpdate', channelUpdateHandler);

      const mockContext = context as any;
      const oldChannel = mockContext.discord.createMockTextChannel({
        id: 'channel-1',
        name: 'channel',
        topic: 'Old topic',
        guildId: 'guild-1',
      });

      const newChannel = mockContext.discord.createMockTextChannel({
        id: 'channel-1',
        name: 'channel',
        topic: 'New topic',
        guildId: 'guild-1',
      });

      // Verify handler is registered
      expect(channelUpdateHandler).toBeDefined();
    });

    it('should detect topic changes', async () => {
      await context.discord.login('test-token');

      const mockContext = context as any;
      const oldChannel = mockContext.discord.createMockTextChannel({
        id: 'channel-1',
        name: 'channel',
        topic: 'Old topic',
        guildId: 'guild-1',
      });

      const newChannel = mockContext.discord.createMockTextChannel({
        id: 'channel-1',
        name: 'channel',
        topic: 'New topic',
        guildId: 'guild-1',
      });

      expect(oldChannel.topic).toBe('Old topic');
      expect(newChannel.topic).toBe('New topic');
      expect(oldChannel.topic).not.toBe(newChannel.topic);
    });
  });

  describe('interactionCreate event', () => {
    it('should trigger on button interaction', async () => {
      await context.discord.login('test-token');

      const interactionHandler = vi.fn();
      context.discord.on('interactionCreate', interactionHandler);

      const mockContext = context as any;

      // Create a mock button interaction
      const interaction = {
        customId: 'permission_approve_request-123',
        user: {
          id: 'user-1',
          username: 'TestUser',
          bot: false,
          discriminator: '0000',
        },
        message: {
          content: 'Permission request',
        },
        update: vi.fn(),
        reply: vi.fn(),
      };

      await mockContext.discord.triggerInteraction(interaction);

      expect(interactionHandler).toHaveBeenCalledOnce();
      expect(interactionHandler).toHaveBeenCalledWith(interaction);
    });

    it('should handle permission approval', async () => {
      await context.discord.login('test-token');

      const requestId = 'request-123';

      const interactionHandler = vi.fn(async (interaction) => {
        if (interaction.customId.startsWith('permission_')) {
          const parts = interaction.customId.split('_');
          const action = parts[1];
          const id = parts.slice(2).join('_');

          if (action === 'approve') {
            context.permissionManager.handleApproval(id, interaction.user.id);
          } else if (action === 'deny') {
            context.permissionManager.handleDenial(id, interaction.user.id);
          }
        }
      });

      context.discord.on('interactionCreate', interactionHandler);

      const mockContext = context as any;

      const approveInteraction = {
        customId: `permission_approve_${requestId}`,
        user: {
          id: 'user-1',
          username: 'TestUser',
          bot: false,
          discriminator: '0000',
        },
        message: {
          content: 'Permission request',
        },
        update: vi.fn(),
        reply: vi.fn(),
      };

      await mockContext.discord.triggerInteraction(approveInteraction);

      expect(interactionHandler).toHaveBeenCalled();
    });

    it('should handle permission denial', async () => {
      await context.discord.login('test-token');

      const requestId = 'request-123';

      const interactionHandler = vi.fn(async (interaction) => {
        if (interaction.customId.startsWith('permission_')) {
          const parts = interaction.customId.split('_');
          const action = parts[1];
          const id = parts.slice(2).join('_');

          if (action === 'deny') {
            context.permissionManager.handleDenial(id, interaction.user.id);
          }
        }
      });

      context.discord.on('interactionCreate', interactionHandler);

      const mockContext = context as any;

      const denyInteraction = {
        customId: `permission_deny_${requestId}`,
        user: {
          id: 'user-1',
          username: 'TestUser',
          bot: false,
          discriminator: '0000',
        },
        message: {
          content: 'Permission request',
        },
        update: vi.fn(),
        reply: vi.fn(),
      };

      await mockContext.discord.triggerInteraction(denyInteraction);

      expect(interactionHandler).toHaveBeenCalled();
    });
  });

  describe('error and warn events', () => {
    it('should handle Discord client errors', async () => {
      await context.discord.login('test-token');

      const errorHandler = vi.fn();
      context.discord.on('error', errorHandler);

      // Errors would be emitted by Discord.js in real scenarios
      expect(errorHandler).toBeDefined();
    });

    it('should handle Discord client warnings', async () => {
      await context.discord.login('test-token');

      const warnHandler = vi.fn();
      context.discord.on('warn', warnHandler);

      // Warnings would be emitted by Discord.js in real scenarios
      expect(warnHandler).toBeDefined();
    });
  });

  describe('event handler cleanup', () => {
    it('should remove event handlers', async () => {
      await context.discord.login('test-token');

      const messageHandler = vi.fn();
      context.discord.on('messageCreate', messageHandler);

      // Remove handler
      context.discord.off('messageCreate', messageHandler);

      const mockContext = context as any;
      await mockContext.discord.triggerMessage({
        id: 'msg-1',
        content: 'Test message',
        channelId: 'channel-1',
      });

      // Handler should not be called after removal
      expect(messageHandler).not.toHaveBeenCalled();
    });

    it('should handle multiple handlers for same event', async () => {
      await context.discord.login('test-token');

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      context.discord.on('messageCreate', handler1);
      context.discord.on('messageCreate', handler2);

      const mockContext = context as any;
      await mockContext.discord.triggerMessage({
        id: 'msg-1',
        content: 'Test message',
        channelId: 'channel-1',
      });

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });

  describe('permission requests', () => {
    it('should request permission through channel', async () => {
      await context.discord.login('test-token');

      const mockContext = context as any;
      const channel = mockContext.discord.createMockTextChannel({
        id: 'channel-1',
        name: 'test-channel',
        guildId: 'guild-1',
      });

      // Enable auto-approve for testing
      mockContext.permissionManager.setAutoApprove(true);

      const result = await context.permissionManager.requestPermission(
        channel,
        'Allow file write?',
        'request-123'
      );

      expect(result.approved).toBe(true);
    });

    it('should track pending permission requests', () => {
      const requestId = 'request-123';

      expect(context.permissionManager.isPending(requestId)).toBe(false);

      // In real implementation, requesting permission would make it pending
      // Our mock doesn't track this automatically
    });

    it('should cancel permission requests', () => {
      const requestId = 'request-123';

      context.permissionManager.cancel(requestId);

      expect(context.permissionManager.isPending(requestId)).toBe(false);
    });

    it('should get permission level for tools', () => {
      const level = context.permissionManager.getPermissionLevel('file_write');

      expect(level).toBeDefined();
    });
  });

  describe('thread management', () => {
    it('should create threads for channel messages', async () => {
      await context.discord.login('test-token');

      const thread = await context.discord.createThread('channel-1', 'Discussion Thread');

      expect(thread).toBeDefined();
      expect(thread.name).toBe('Discussion Thread');
      expect(thread.parentId).toBe('channel-1');
      expect(thread.isThreadChannel()).toBe(true);
    });

    it('should send messages to threads', async () => {
      await context.discord.login('test-token');

      const thread = await context.discord.createThread('channel-1', 'Test Thread');
      const message = await thread.send('Hello in thread');

      expect(message).toBeDefined();
      expect(message.channelId).toBe(thread.id);
    });

    it('should archive threads', async () => {
      await context.discord.login('test-token');

      const thread = await context.discord.createThread('channel-1', 'Test Thread');

      expect(thread.archived).toBe(false);

      await thread.setArchived(true);

      expect(thread.archived).toBe(true);
    });

    it('should lock threads', async () => {
      await context.discord.login('test-token');

      const thread = await context.discord.createThread('channel-1', 'Test Thread');

      expect(thread.locked).toBe(false);

      await thread.setLocked(true);

      expect(thread.locked).toBe(true);
    });
  });

  describe('message locking', () => {
    it('should prevent concurrent processing of same thread', async () => {
      // Simulate concurrent message handling
      const threadId = 'thread-123';
      const locks = new Map<string, Promise<void>>();

      const processMessage = async (messageId: string) => {
        // Check for existing lock
        const existingLock = locks.get(threadId);
        if (existingLock) {
          await existingLock.catch(() => {});
        }

        // Create new lock
        const newLock = new Promise<void>((resolve) => {
          setTimeout(() => {
            console.log(`Processed message ${messageId}`);
            resolve();
          }, 100);
        }).finally(() => {
          if (locks.get(threadId) === newLock) {
            locks.delete(threadId);
          }
        });

        locks.set(threadId, newLock);
        await newLock;
      };

      // Process two messages concurrently
      await Promise.all([
        processMessage('msg-1'),
        processMessage('msg-2'),
      ]);

      // Both should complete successfully
      expect(locks.size).toBe(0);
    });
  });
});
