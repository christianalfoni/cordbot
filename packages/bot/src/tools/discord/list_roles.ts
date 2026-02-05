import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({});

export function createListRolesTool(client: Client, guildId: string) {
  return tool(
    'discord_list_roles',
    'List all roles in the Discord server',
    schema.shape,
    async () => {
      try {
        // Use the configured guild ID from context (NEVER use client.guilds.cache)
        const guild = await client.guilds.fetch(guildId);

        if (!guild) {
          return {
            content: [{ type: 'text', text: `Error: Guild ${guildId} not found` }],
            isError: true,
          };
        }

        const roles = guild.roles.cache
          .filter(role => role.name !== '@everyone')
          .map(role => ({
            id: role.id,
            name: role.name,
            color: role.hexColor,
            memberCount: role.members.size,
          }))
          .sort((a, b) => b.memberCount - a.memberCount);

        const roleList = roles
          .map(r => `- **${r.name}** - ${r.memberCount} members - ID: ${r.id}`)
          .join('\n');

        return {
          content: [{
            type: 'text',
            text: `**Roles in ${guild.name}**\n\n${roleList}`
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
