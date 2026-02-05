import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  eventId: z.string().describe('The event ID to fetch users for'),
  limit: z.number().optional().describe('Maximum number of users to return (default: 100)'),
});

export function createGetEventUsersTool(client: Client, getCurrentChannel: () => any, guildId: string) {
  return tool(
    'discord_get_event_users',
    'Get list of users interested in/attending an event',
    schema.shape,
    async ({ eventId, limit = 100 }) => {
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

        const subscribers = await event.fetchSubscribers({ limit });

        if (subscribers.size === 0) {
          return {
            content: [{ type: 'text', text: `No users are interested in "${event.name}" yet` }],
          };
        }

        const userList = subscribers.map((subscriber: any) =>
          `• ${subscriber.user.tag} (ID: ${subscriber.user.id})`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `**Users interested in "${event.name}"** (${subscribers.size} total):\n\n${userList}`
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
