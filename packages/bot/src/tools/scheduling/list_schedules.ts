import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { parseCronFileV2 } from '../../scheduler/parser.js';
import { getCronV2FilePath, formatTimeUntil } from './utils.js';

const schema = z.object({
  type: z
    .enum(['onetime', 'recurring', 'all'])
    .optional()
    .describe('Filter by schedule type: "onetime" for one-time schedules, "recurring" for recurring schedules, "all" for both. Default: "all"'),
});

export function createTool(getChannelId: () => string, getWorkingDir?: () => string) {
  return tool(
    'schedule_list',
    'List all scheduled tasks for this Discord channel. Shows both one-time and recurring schedules with their details.',
    schema.shape,
    async (params) => {
      try {
        const channelId = getChannelId();
        const workingDir = getWorkingDir ? getWorkingDir() : process.cwd();
        const cronV2Path = getCronV2FilePath(workingDir);

        const type = params.type || 'all';

        // Read config
        const config = parseCronFileV2(cronV2Path);

        // Filter by channel
        const channelOneTimeJobs = config.oneTimeJobs.filter((job) => job.channelId === channelId);
        const channelRecurringJobs = config.recurringJobs.filter(
          (job) => job.channelId === channelId
        );

        // Format one-time jobs with time remaining
        const formattedOneTimeJobs = channelOneTimeJobs.map((job) => {
          const targetDate = new Date(job.targetTime);
          const timeUntil = formatTimeUntil(targetDate);

          return {
            id: job.id,
            naturalTime: job.naturalTime,
            targetTime: job.targetTime,
            localTime: targetDate.toLocaleString('en-US', { timeZone: job.timezone }),
            timezone: job.timezone,
            timeUntil,
            task: job.task,
            ...(job.threadId && { threadId: job.threadId }),
            createdAt: job.createdAt,
          };
        });

        // Format recurring jobs
        const formattedRecurringJobs = channelRecurringJobs.map((job) => ({
          name: job.name,
          cronExpression: job.cronExpression,
          timezone: job.timezone,
          task: job.task,
          ...(job.threadId && { threadId: job.threadId }),
          createdAt: job.createdAt,
        }));

        // Build response based on type filter
        const response: any = {
          channelId,
        };

        if (type === 'all' || type === 'onetime') {
          response.oneTimeSchedules = {
            count: formattedOneTimeJobs.length,
            jobs: formattedOneTimeJobs,
          };
        }

        if (type === 'all' || type === 'recurring') {
          response.recurringSchedules = {
            count: formattedRecurringJobs.length,
            jobs: formattedRecurringJobs,
          };
        }

        // Add summary message
        const totalJobs =
          (type === 'all' || type === 'onetime' ? formattedOneTimeJobs.length : 0) +
          (type === 'all' || type === 'recurring' ? formattedRecurringJobs.length : 0);

        if (totalJobs === 0) {
          response.message = 'No scheduled tasks found for this channel.';
        } else {
          response.message = `Found ${totalJobs} scheduled ${totalJobs === 1 ? 'task' : 'tasks'} for this channel.`;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
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
                  error: `Failed to list schedules: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
