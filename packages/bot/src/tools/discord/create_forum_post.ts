import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, ForumChannel } from 'discord.js';
import { ChannelType } from 'discord.js';

const schema = z.object({
  channelId: z.string().describe('The forum channel ID'),
  title: z.string().describe('Post title'),
  message: z.string().describe('Post content/message'),
  tags: z.array(z.string()).optional().describe('Tag names to apply to the post'),
});

export function createCreateForumPostTool(client: Client) {
  return tool(
    'discord_create_forum_post',
    'Create a new forum post (thread) in a forum channel',
    schema.shape,
    async ({ channelId, title, message, tags }) => {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || channel.type !== ChannelType.GuildForum) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid forum channel' }],
            isError: true,
          };
        }

        const forumChannel = channel as ForumChannel;

        // Find tag IDs from tag names
        const appliedTags: string[] = [];
        if (tags && tags.length > 0) {
          const availableTags = forumChannel.availableTags;
          for (const tagName of tags) {
            const tag = availableTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
            if (tag) {
              appliedTags.push(tag.id);
            }
          }
        }

        const thread = await forumChannel.threads.create({
          name: title,
          message: { content: message },
          appliedTags: appliedTags.length > 0 ? appliedTags : undefined,
        });

        const tagsList = appliedTags.length > 0
          ? `\n**Tags:** ${tags?.join(', ')}`
          : '';

        return {
          content: [{
            type: 'text',
            text: `✅ Forum post created: **${title}**\nPost ID: ${thread.id}\nURL: https://discord.com/channels/${thread.guildId}/${thread.id}${tagsList}`
          }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
