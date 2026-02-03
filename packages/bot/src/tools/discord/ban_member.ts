import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import type { IPermissionManager } from '../../interfaces/permission.js';

const schema = z.object({
  userId: z.string().describe('Discord user ID to ban'),
  reason: z.string().optional().describe('Reason for banning'),
  deleteMessageDays: z.number().optional().describe('Days of message history to delete (0-7)'),
});

export function createBanMemberTool(
  client: Client,
  permissionManager: IPermissionManager,
  getCurrentChannel: () => any
) {
  return tool(
    'discord_ban_member',
    'Ban a member from the Discord server (requires permission)',
    schema.shape,
    async ({ userId, reason, deleteMessageDays = 0 }) => {
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
        if (!member) {
          return {
            content: [{ type: 'text', text: 'Error: Member not found' }],
            isError: true,
          };
        }

        // Request permission
        try {
          await permissionManager.requestPermission(
            channel,
            `Ban member **${member.displayName}** (@${member.user.username})?\nReason: ${reason || 'None provided'}\nThis cannot be undone easily.`,
            `ban_member_${Date.now()}`
          );
        } catch (permError) {
          return {
            content: [{ type: 'text', text: '❌ Permission denied' }],
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
