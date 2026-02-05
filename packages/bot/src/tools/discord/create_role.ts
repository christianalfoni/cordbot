import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import type { IPermissionManager } from '../../interfaces/permission.js';

const schema = z.object({
  name: z.string().describe('Role name'),
  color: z.string().optional().describe('Hex color code (e.g., #FF0000)'),
  mentionable: z.boolean().optional().describe('Whether the role can be mentioned'),
});

export function createCreateRoleTool(
  client: Client,
  permissionManager: IPermissionManager,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_create_role',
    'Create a new role in the Discord server',
    schema.shape,
    async ({ name, color, mentionable = false }) => {
      try {
        const channel = getCurrentChannel();
        if (!channel) {
          return {
            content: [{ type: 'text', text: 'Error: No channel context available' }],
            isError: true,
          };
        }

        // Use the configured guild ID from context (NEVER use client.guilds.cache)
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
          return {
            content: [{ type: 'text', text: `Error: Guild ${guildId} not found` }],
            isError: true,
          };
        }

        // Request permission
        try {
          await permissionManager.requestPermission(
            channel,
            `Create new role **${name}**?`,
            `create_role_${Date.now()}`
          );
        } catch (permError) {
          return {
            content: [{ type: 'text', text: `❌ ${permError instanceof Error ? permError.message : 'Permission denied'}` }],
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
