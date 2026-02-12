import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, GuildScheduledEventEntityType } from 'discord.js';
import { GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType as EntityType } from 'discord.js';
import { parseNaturalTime, validateTimezone } from '../scheduling/chrono-parser.js';

const schema = z.object({
  name: z.string().describe('Event name'),
  description: z.string().describe('Event description'),
  startTime: z.string().describe(
    'Event start time in natural language. Examples: "tomorrow at 9pm", "next Monday at 3pm", "in 2 hours", "February 20th at 8pm"'
  ),
  timezone: z.string().describe(
    'IANA timezone identifier for interpreting the time. Examples: "America/New_York", "Europe/London", "Asia/Tokyo", "UTC". Use the timezone where the event will take place.'
  ),
  duration: z.number().optional().describe('Event duration in hours (optional). If provided, end time will be calculated automatically. Examples: 1 (1 hour), 2.5 (2.5 hours), 0.5 (30 minutes)'),
  location: z.string().describe('Channel name or external location URL'),
  entityType: z.enum(['voice', 'external']).optional().describe('Event type: voice (channel-based) or external (default: voice)'),
});

export function createCreateEventTool(
  client: Client,
  getCurrentChannel: () => any,
  guildId: string
) {
  return tool(
    'discord_create_event',
    'Schedule a Discord server event using natural language time (e.g., "tomorrow at 9pm", "next Monday at 3pm"). Automatically handles date parsing and timezone conversion. Requires Manage Events permission. TIP: For examples and best practices, load the discord_event_management skill.',
    schema.shape,
    async ({ name, description, startTime, timezone, duration, location, entityType = 'voice' }) => {
      try {
        // Validate timezone first
        if (!validateTimezone(timezone)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `Invalid timezone: "${timezone}". Must be a valid IANA timezone.`,
                examples: [
                  'America/New_York',
                  'America/Los_Angeles',
                  'Europe/London',
                  'Asia/Tokyo',
                  'UTC'
                ]
              }, null, 2)
            }],
            isError: true,
          };
        }

        // Parse natural language start time using chrono-node
        let parsedStartTime: string;
        try {
          parsedStartTime = parseNaturalTime(startTime, timezone);
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Failed to parse start time',
                input: startTime,
                timezone,
                hint: 'Try formats like: "tomorrow at 9pm", "next Monday at 3pm", "in 2 hours", "February 20th at 8pm"'
              }, null, 2)
            }],
            isError: true,
          };
        }

        const scheduledStartTime = new Date(parsedStartTime);

        // Calculate end time if duration provided
        let scheduledEndTime: Date | undefined;
        if (duration !== undefined) {
          const durationMs = duration * 60 * 60 * 1000; // Convert hours to milliseconds
          scheduledEndTime = new Date(scheduledStartTime.getTime() + durationMs);
        }

        // Use the configured guild ID from context (NEVER use client.guilds.cache)
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
          return {
            content: [{ type: 'text', text: `Error: Guild ${guildId} not found` }],
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
