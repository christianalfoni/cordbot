import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  userId: z.string().describe('Discord user ID to ban'),
  reason: z.string().optional().describe('Reason for banning'),
  deleteMessageDays: z.number().optional().describe('Days of message history to delete (0-7)'),
});

export function createBanMemberTool(
  client: Client,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_ban_member',
    'Ban a member from the Discord server (requires permission)',
    schema.shape,
    async ({ userId, reason, deleteMessageDays = 0 }) => {
      try {
        // Use the configured guild ID from context (NEVER use client.guilds.cache)
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
          return {
            content: [{ type: 'text', text: `Error: Guild ${guildId} not found` }],
            isError: true,
          };
        }

        const member = await guild.members.fetch(userId);
        if (!member) {
          return {
            content: [{ type: 'text', text: 'Error: Member not found' }],
            isError: true,
          };
        }

        await member.ban({
          reason,
          deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60,
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Banned ${member.user.username} from the server`
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
