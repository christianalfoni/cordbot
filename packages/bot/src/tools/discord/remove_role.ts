import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  userId: z.string().describe('Discord user ID'),
  roleId: z.string().describe('Discord role ID'),
  reason: z.string().optional().describe('Reason for removal'),
});

export function createRemoveRoleTool(
  client: Client,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_remove_role',
    'Remove a role from a guild member',
    schema.shape,
    async ({ userId, roleId, reason }) => {
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
        const role = guild.roles.cache.get(roleId);

        if (!member || !role) {
          return {
            content: [{ type: 'text', text: 'Error: Member or role not found' }],
            isError: true,
          };
        }

        await member.roles.remove(role, reason);

        return {
          content: [{
            type: 'text',
            text: `✅ Removed role ${role.name} from ${member.displayName}`
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
