import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({});

export function createListEventsTool(client: Client, getCurrentChannel: () => any, guildId: string) {
  return tool(
    'discord_list_events',
    'List all scheduled events in the Discord server',
    schema.shape,
    async () => {
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

        await guild.scheduledEvents.fetch();
        const events = guild.scheduledEvents.cache;

        if (events.size === 0) {
          return {
            content: [{ type: 'text', text: 'No scheduled events found' }],
          };
        }

        const eventList = events.map((event: any) => {
          const startTime = Math.floor(event.scheduledStartAt!.getTime() / 1000);
          const status = event.status;
          const userCount = event.userCount || 0;

          return `• **${event.name}** (ID: ${event.id})\n  Status: ${status}\n  Starts: <t:${startTime}:F>\n  Interested: ${userCount} users`;
        }).join('\n\n');

        return {
          content: [{ type: 'text', text: `**Scheduled Events:**\n\n${eventList}` }],
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
