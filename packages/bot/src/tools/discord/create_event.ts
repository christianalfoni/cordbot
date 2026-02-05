import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, GuildScheduledEventEntityType } from 'discord.js';
import { GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType as EntityType } from 'discord.js';
import type { IPermissionManager } from '../../interfaces/permission.js';

const schema = z.object({
  name: z.string().describe('Event name'),
  description: z.string().describe('Event description'),
  startTime: z.string().describe('Event start time (ISO 8601 format)'),
  endTime: z.string().optional().describe('Event end time (ISO 8601 format, optional)'),
  location: z.string().describe('Channel name or external location URL'),
  entityType: z.enum(['voice', 'external']).optional().describe('Event type: voice (channel-based) or external (default: voice)'),
});

export function createCreateEventTool(
  client: Client,
  permissionManager: IPermissionManager,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_create_event',
    'Schedule a Discord server event (requires permission)',
    schema.shape,
    async ({ name, description, startTime, endTime, location, entityType = 'voice' }) => {
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

        // Request permission
        try {
          await permissionManager.requestPermission(
            contextChannel,
            `Create event "${name}" scheduled for ${startTime}?`,
            `create_event_${Date.now()}`
          );
        } catch (permError) {
          return {
            content: [{ type: 'text', text: '❌ Permission denied' }],
            isError: true,
          };
        }

        // Parse dates
        const scheduledStartTime = new Date(startTime);
        const scheduledEndTime = endTime ? new Date(endTime) : undefined;

        // Validate dates
        if (isNaN(scheduledStartTime.getTime())) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid start time format. Use ISO 8601 format (e.g., 2024-03-20T20:00:00)' }],
            isError: true,
          };
        }

        if (scheduledEndTime && isNaN(scheduledEndTime.getTime())) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid end time format. Use ISO 8601 format' }],
            isError: true,
          };
        }

        // Create event options
        const eventOptions: any = {
          name,
          description,
          scheduledStartTime,
          scheduledEndTime,
          privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        };

        if (entityType === 'external') {
          eventOptions.entityType = EntityType.External;
          eventOptions.entityMetadata = { location };
        } else {
          // Find voice channel by name
          const voiceChannel = guild.channels.cache.find(
            (ch: any) => ch.name === location && ch.isVoiceBased()
          );

          if (!voiceChannel) {
            return {
              content: [{ type: 'text', text: `Error: Voice channel "${location}" not found. For external events, set entityType to "external"` }],
              isError: true,
            };
          }

          eventOptions.entityType = EntityType.Voice;
          eventOptions.channel = voiceChannel.id;
        }

        const event = await guild.scheduledEvents.create(eventOptions);

        return {
          content: [{
            type: 'text',
            text: `✅ Event created: **${event.name}**\nID: ${event.id}\nStarts: <t:${Math.floor(scheduledStartTime.getTime() / 1000)}:F>`
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
