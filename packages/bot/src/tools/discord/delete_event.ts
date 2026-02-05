import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import type { IPermissionManager } from '../../interfaces/permission.js';

const schema = z.object({
  eventId: z.string().describe('The event ID to delete'),
});

export function createDeleteEventTool(
  client: Client,
  permissionManager: IPermissionManager,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_delete_event',
    'Cancel/delete a scheduled event (requires permission)',
    schema.shape,
    async ({ eventId }) => {
      try {
        const contextChannel = getCurrentChannel();
        if (!contextChannel) {
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

        const event = await guild.scheduledEvents.fetch(eventId);
        if (!event) {
          return {
            content: [{ type: 'text', text: 'Error: Event not found' }],
            isError: true,
          };
        }

        // Request permission
        try {
          await permissionManager.requestPermission(
            contextChannel,
            `Delete event "${event.name}"? This cannot be undone.`,
            `delete_event_${Date.now()}`
          );
        } catch (permError) {
          return {
            content: [{ type: 'text', text: `❌ ${permError instanceof Error ? permError.message : 'Permission denied'}` }],
            isError: true,
          };
        }

        const eventName = event.name;
        await event.delete();

        return {
          content: [{ type: 'text', text: `✅ Deleted event: ${eventName}` }],
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
