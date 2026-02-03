import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  eventId: z.string().describe('The event ID to fetch'),
});

export function createGetEventTool(client: Client, getCurrentChannel: () => any) {
  return tool(
    'discord_get_event',
    'Get detailed information about a scheduled event',
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

        const guild = contextChannel.guild;
        if (!guild) {
          return {
            content: [{ type: 'text', text: 'Error: Not in a guild context' }],
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

        const startTime = Math.floor(event.scheduledStartAt!.getTime() / 1000);
        const endTime = event.scheduledEndAt ? Math.floor(event.scheduledEndAt.getTime() / 1000) : null;
        const creator = event.creator ? `${event.creator.tag}` : 'Unknown';

        let location = 'Unknown';
        if (event.channel) {
          location = `<#${event.channel.id}>`;
        } else if (event.entityMetadata?.location) {
          location = event.entityMetadata.location;
        }

        const details = [
          `**${event.name}**`,
          ``,
          `**Description:** ${event.description || 'No description'}`,
          `**Status:** ${event.status}`,
          `**Created by:** ${creator}`,
          `**Location:** ${location}`,
          `**Starts:** <t:${startTime}:F>`,
          endTime ? `**Ends:** <t:${endTime}:F>` : '',
          `**Interested users:** ${event.userCount || 0}`,
          `**Event ID:** ${event.id}`,
        ].filter(Boolean).join('\n');

        return {
          content: [{ type: 'text', text: details }],
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
