import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  userId: z.string().describe('Discord user ID'),
});

export function createGetMemberTool(client: Client, guildId: string) {
  return tool(
    'discord_get_member',
    'Get detailed information about a Discord server member',
    schema.shape,
    async ({ userId }) => {
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

        const roles = member.roles.cache
          .filter(role => role.name !== '@everyone')
          .map(role => role.name)
          .join(', ') || 'None';

        const info = [
          `**User:** ${member.displayName} (@${member.user.username})`,
          `**ID:** ${member.id}`,
          `**Joined:** ${member.joinedAt?.toISOString() || 'unknown'}`,
          `**Roles:** ${roles}`,
          `**Bot:** ${member.user.bot ? 'Yes' : 'No'}`,
        ].join('\n');

        return {
          content: [{ type: 'text', text: info }],
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
