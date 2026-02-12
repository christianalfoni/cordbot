import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { parseCronFileV2, writeCronV2File, validateCronSchedule } from '../../scheduler/parser.js';
import { getCronV2FilePath } from './utils.js';
import { validateTimezone } from './chrono-parser.js';

const schema = z.object({
  name: z
    .string()
    .describe(
      'Unique name for this recurring task in this channel (e.g., "Daily standup reminder", "Weekly report")'
    ),
  cronExpression: z
    .string()
    .describe(
      'Cron expression in 5-field format: "minute hour day month weekday". Examples: "0 9 * * *" (daily at 9am), "0 9 * * 1" (Mondays at 9am), "*/30 * * * *" (every 30 minutes)'
    ),
  timezone: z
    .string()
    .describe(
      'IANA timezone identifier for the cron schedule. Examples: "America/New_York", "Europe/London", "Asia/Tokyo", "UTC". The cron expression will be evaluated in this timezone.'
    ),
  task: z
    .string()
    .describe(
      'Description of the task for Claude to execute on each execution (e.g., "Post daily standup reminder", "Generate weekly summary")'
    ),
});

export function createTool(getChannelId: () => string, getWorkingDir?: () => string) {
  return tool(
    'schedule_recurring',
    'Schedule a recurring task using cron expressions. The task will execute repeatedly according to the schedule until removed. For one-time tasks, use schedule_one_time instead. TIP: For examples and patterns, load the discord_scheduling skill.',
    schema.shape,
    async (params) => {
      try {
        const channelId = getChannelId();
        const workingDir = getWorkingDir ? getWorkingDir() : process.cwd();
        const cronV2Path = getCronV2FilePath(workingDir);

        // Validate cron expression
        if (!validateCronSchedule(params.cronExpression)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `Invalid cron expression: "${params.cronExpression}". Must be 5 fields: minute hour day month weekday.`,
                    validFormat: 'minute hour day month weekday',
                    examples: [
                      '0 9 * * * - Every day at 9:00 AM',
                      '0 9 * * 1 - Every Monday at 9:00 AM',
                      '*/30 * * * * - Every 30 minutes',
                      '0 0 1 * * - First day of every month at midnight',
                      '0 17 * * 5 - Every Friday at 5:00 PM',
                    ],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Validate timezone
        if (!validateTimezone(params.timezone)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `Invalid timezone: "${params.timezone}". Must be a valid IANA timezone.`,
                    examples: [
                      'America/New_York',
                      'America/Los_Angeles',
                      'America/Chicago',
                      'Europe/London',
                      'Europe/Paris',
                      'Asia/Tokyo',
                      'Australia/Sydney',
                      'UTC',
                    ],
                    tip: 'Use the IANA timezone database format (Continent/City)',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Read existing config
        const config = parseCronFileV2(cronV2Path);

        // Check for duplicate name in this channel
        const existingJob = config.recurringJobs.find(
          (job) => job.name === params.name && job.channelId === channelId
        );

        if (existingJob) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `A recurring task named "${params.name}" already exists in this channel. Use a different name or remove the existing task first.`,
                    existingJob: {
                      name: existingJob.name,
                      cronExpression: existingJob.cronExpression,
                      timezone: existingJob.timezone,
                      task: existingJob.task,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Create new recurring job
        const newJob = {
          name: params.name,
          cronExpression: params.cronExpression,
          timezone: params.timezone,
          task: params.task,
          channelId,
          createdAt: new Date().toISOString(),
        };

        // Add to config
        config.recurringJobs.push(newJob);

        // Write back to file
        writeCronV2File(cronV2Path, config);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: `Recurring task "${params.name}" scheduled successfully!`,
                  job: {
                    name: params.name,
                    cronExpression: params.cronExpression,
                    timezone: params.timezone,
                    task: params.task,
                  },
                  note: 'The task will execute automatically according to the cron schedule and post results to this channel. The task will continue running until you remove it.',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: `Failed to schedule recurring task: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}
