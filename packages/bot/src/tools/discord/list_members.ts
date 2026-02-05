import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  limit: z.number().optional().describe('Maximum number of members to return (default: 50)'),
});

export function createListMembersTool(client: Client, guildId: string) {
  return tool(
    'discord_list_members',
    'List members in the Discord server',
    schema.shape,
    async ({ limit = 50 }) => {
      try {
        // Use the configured guild ID from context (NEVER use client.guilds.cache)
        const guild = await client.guilds.fetch(guildId);

        if (!guild) {
          return {
            content: [{ type: 'text', text: `Error: Guild ${guildId} not found` }],
            isError: true,
          };
        }

        // Fetch members
        await guild.members.fetch({ limit });

        const members = guild.members.cache
          .filter(member => !member.user.bot)
          .map(member => ({
            id: member.id,
            username: member.user.username,
            displayName: member.displayName,
            joinedAt: member.joinedAt?.toISOString() || 'unknown',
          }))
          .slice(0, limit);

        const memberList = members
          .map(m => `- **${m.displayName}** (@${m.username}) - ID: ${m.id}`)
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `**Members in ${guild.name}** (showing ${members.length})\n\n${memberList}`
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
