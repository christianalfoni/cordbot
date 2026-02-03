import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { IPermissionManager } from '../../interfaces/permission.js';

const schema = z.object({
  name: z.string().describe('Channel name'),
  type: z.enum(['text', 'voice']).optional().describe('Channel type (default: text)'),
  topic: z.string().optional().describe('Channel topic/description'),
});

export function createCreateChannelTool(
  client: Client,
  permissionManager: IPermissionManager,
  getCurrentChannel: () => any
) {
  return tool(
    'discord_create_channel',
    'Create a new channel in the Discord server',
    schema.shape,
    async ({ name, type = 'text', topic }) => {
      try {
        const channel = getCurrentChannel();
        if (!channel) {
          return {
            content: [{ type: 'text', text: 'Error: No channel context available' }],
            isError: true,
          };
        }

        // Request permission
        try {
          await permissionManager.requestPermission(
            channel,
            `Create ${type} channel **${name}**?`,
            `create_channel_${Date.now()}`
          );
        } catch (permError) {
          return {
            content: [{ type: 'text', text: '❌ Permission denied' }],
            isError: true,
          };
        }

        const guild = client.guilds.cache.first();
        if (!guild) {
          return {
            content: [{ type: 'text', text: 'Error: No guild found' }],
            isError: true,
          };
        }

        const channelType = type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const newChannel = await guild.channels.create({
          name,
          type: channelType,
          topic: topic || undefined,
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Created ${type} channel: <#${newChannel.id}>`
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
