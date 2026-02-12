import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  name: z.string().describe('Role name'),
  color: z.string().optional().describe('Hex color code (e.g., #FF0000)'),
  mentionable: z.boolean().optional().describe('Whether the role can be mentioned'),
});

export function createCreateRoleTool(
  client: Client,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_create_role',
    'Create a new role in the Discord server. TIP: For role management best practices and patterns, load the discord_role_management skill.',
    schema.shape,
    async ({ name, color, mentionable = false }) => {
      try {
        // Use the configured guild ID from context (NEVER use client.guilds.cache)
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
          return {
            content: [{ type: 'text', text: `Error: Guild ${guildId} not found` }],
            isError: true,
          };
        }

        const role = await guild.roles.create({
          name,
          color: color as any,
          mentionable,
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Created role: ${role.name} (ID: ${role.id})`
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
