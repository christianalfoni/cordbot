import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { parseCronFileV2, writeCronV2File } from '../../scheduler/parser.js';
import { getCronV2FilePath } from './utils.js';

const schema = z.object({
  identifier: z
    .string()
    .describe(
      'Job ID (for one-time schedules, e.g., "job_1707234567890") or job name (for recurring schedules, e.g., "Daily standup")'
    ),
});

export function createTool(getChannelId: () => string, getWorkingDir?: () => string) {
  return tool(
    'schedule_remove',
    'Remove a scheduled task from this Discord channel. Use the job ID for one-time schedules or the job name for recurring schedules.',
    schema.shape,
    async (params) => {
      try {
        const channelId = getChannelId();
        const workingDir = getWorkingDir ? getWorkingDir() : process.cwd();
        const cronV2Path = getCronV2FilePath(workingDir);

        // Read config
        const config = parseCronFileV2(cronV2Path);

        // Try to find and remove from one-time jobs first (by ID)
        const oneTimeIndex = config.oneTimeJobs.findIndex(
          (job) => job.id === params.identifier && job.channelId === channelId
        );

        if (oneTimeIndex !== -1) {
          const removedJob = config.oneTimeJobs[oneTimeIndex];
          config.oneTimeJobs.splice(oneTimeIndex, 1);

          // Write back to file
          writeCronV2File(cronV2Path, config);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `One-time schedule removed successfully!`,
                    removed: {
                      type: 'onetime',
                      id: removedJob.id,
                      naturalTime: removedJob.naturalTime,
                      targetTime: removedJob.targetTime,
                      task: removedJob.task,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Try to find and remove from recurring jobs (by name)
        const recurringIndex = config.recurringJobs.findIndex(
          (job) => job.name === params.identifier && job.channelId === channelId
        );

        if (recurringIndex !== -1) {
          const removedJob = config.recurringJobs[recurringIndex];
          config.recurringJobs.splice(recurringIndex, 1);

          // Write back to file
          writeCronV2File(cronV2Path, config);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Recurring schedule removed successfully!`,
                    removed: {
                      type: 'recurring',
                      name: removedJob.name,
                      cronExpression: removedJob.cronExpression,
                      task: removedJob.task,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Not found
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: `Schedule not found: "${params.identifier}"`,
                  tip: 'Use schedule_list to see all scheduled tasks in this channel. For one-time schedules, use the job ID (e.g., "job_1707234567890"). For recurring schedules, use the job name.',
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
                  error: `Failed to remove schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
