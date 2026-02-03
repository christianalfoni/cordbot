import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import type { IPermissionManager } from '../../interfaces/permission.js';

const schema = z.object({
  userId: z.string().describe('Discord user ID'),
  roleId: z.string().describe('Discord role ID'),
  reason: z.string().optional().describe('Reason for assignment'),
});

export function createAssignRoleTool(
  client: Client,
  permissionManager: IPermissionManager,
  getCurrentChannel: () => any
) {
  return tool(
    'discord_assign_role',
    'Assign a role to a guild member',
    schema.shape,
    async ({ userId, roleId, reason }) => {
      try {
        const channel = getCurrentChannel();
        if (!channel) {
          return {
            content: [{ type: 'text', text: 'Error: No channel context available' }],
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

        const member = await guild.members.fetch(userId);
        const role = guild.roles.cache.get(roleId);

        if (!member || !role) {
          return {
            content: [{ type: 'text', text: 'Error: Member or role not found' }],
            isError: true,
          };
        }

        // Request permission
        try {
          await permissionManager.requestPermission(
            channel,
            `Assign role **${role.name}** to **${member.displayName}**?`,
            `assign_role_${Date.now()}`
          );
        } catch (permError) {
          return {
            content: [{ type: 'text', text: '❌ Permission denied' }],
            isError: true,
          };
        }

        await member.roles.add(role, reason);

        return {
          content: [{
            type: 'text',
            text: `✅ Assigned role ${role.name} to ${member.displayName}`
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
