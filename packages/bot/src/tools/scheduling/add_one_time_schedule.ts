import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { parseCronFileV2, writeCronV2File } from '../../scheduler/parser.js';
import { getCronV2FilePath, generateJobId } from './utils.js';
import { parseNaturalTime, validateTimezone } from './chrono-parser.js';

const schema = z.object({
  naturalTime: z
    .string()
    .describe(
      'Natural language time when the task should run. Examples: "tomorrow at 9pm", "in 10 minutes", "next Monday at 3pm", "December 25th at noon"'
    ),
  timezone: z
    .string()
    .describe(
      'IANA timezone identifier for interpreting the time. Examples: "America/New_York", "Europe/London", "Asia/Tokyo", "UTC". Use the timezone where the user is located.'
    ),
  task: z
    .string()
    .describe(
      'Description of the task for Claude to execute at the scheduled time (e.g., "Send a reminder about the meeting", "Post the daily summary")'
    ),
  replyInThread: z
    .boolean()
    .optional()
    .describe(
      'Set to true to send the scheduled task response to this thread instead of the channel. Only works when called from a thread. Default: false'
    ),
});

export function createTool(
  getChannelId: () => string,
  getCurrentChannel?: () => any,
  getWorkingDir?: () => string
) {
  return tool(
    'schedule_one_time',
    'Schedule a one-time task using natural language (e.g., "tomorrow at 9pm"). The task will execute once at the specified time and then be automatically removed. For recurring tasks, use schedule_recurring instead.',
    schema.shape,
    async (params) => {
      try {
        const channelId = getChannelId();
        const workingDir = getWorkingDir ? getWorkingDir() : process.cwd();
        const cronV2Path = getCronV2FilePath(workingDir);

        // Validate timezone first
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

        // Parse natural time into ISO 8601
        let targetTime: string;
        try {
          targetTime = parseNaturalTime(params.naturalTime, params.timezone);
        } catch (error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: error instanceof Error ? error.message : 'Failed to parse natural time',
                    input: params.naturalTime,
                    timezone: params.timezone,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Determine threadId if replyInThread is requested
        let threadId: string | undefined;
        if (params.replyInThread && getCurrentChannel) {
          const channel = getCurrentChannel();
          if (channel && channel.isThread && channel.isThread()) {
            threadId = channel.id;
          }
        }

        // Read existing config
        const config = parseCronFileV2(cronV2Path);

        // Generate unique job ID
        const jobId = generateJobId();

        // Create new one-time job
        const newJob = {
          id: jobId,
          naturalTime: params.naturalTime,
          targetTime,
          timezone: params.timezone,
          task: params.task,
          channelId,
          ...(threadId && { threadId }),
          createdAt: new Date().toISOString(),
        };

        // Add to config
        config.oneTimeJobs.push(newJob);

        // Write back to file
        writeCronV2File(cronV2Path, config);

        // Calculate time until execution for user feedback
        const targetDate = new Date(targetTime);
        const now = new Date();
        const msUntil = targetDate.getTime() - now.getTime();
        const minutesUntil = Math.floor(msUntil / 60000);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  message: `One-time task scheduled successfully!`,
                  job: {
                    id: jobId,
                    naturalTime: params.naturalTime,
                    targetTime: targetDate.toISOString(),
                    timezone: params.timezone,
                    task: params.task,
                    ...(threadId && { threadId }),
                  },
                  executionInfo: {
                    targetTime: targetDate.toISOString(),
                    localTime: targetDate.toLocaleString('en-US', { timeZone: params.timezone }),
                    minutesUntil,
                  },
                  note: threadId
                    ? 'The task will execute automatically at the scheduled time and post results to this thread. After execution, the job will be removed automatically.'
                    : 'The task will execute automatically at the scheduled time and post results to this channel. After execution, the job will be removed automatically.',
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
                  error: `Failed to schedule one-time task: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
