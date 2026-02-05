import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  userId: z.string().describe('Discord user ID to kick'),
  reason: z.string().optional().describe('Reason for kicking'),
});

export function createKickMemberTool(
  client: Client,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_kick_member',
    'Kick a member from the Discord server (requires permission)',
    schema.shape,
    async ({ userId, reason }) => {
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

        await member.kick(reason);

        return {
          content: [{
            type: 'text',
            text: `✅ Kicked ${member.user.username} from the server`
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
