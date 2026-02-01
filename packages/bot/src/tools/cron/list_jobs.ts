import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { parseCronFile } from '../../scheduler/parser.js';
import { getCronFilePath } from './utils.js';

const schema = z.object({});

export function createTool(getChannelId: () => string) {
  return tool(
    'cron_list_jobs',
    'List all scheduled cron jobs for this Discord channel. Shows job names, schedules, tasks, and whether they are one-time. Use this to see what jobs are currently configured before adding, updating, or removing jobs.',
    schema.shape,
    async () => {
      try {
        const channelId = getChannelId();
        const cronPath = getCronFilePath(channelId);

        const config = parseCronFile(cronPath);

        if (config.jobs.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  jobs: [],
                  message: 'No cron jobs configured for this channel.'
                }, null, 2)
              }
            ]
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                jobs: config.jobs.map(job => ({
                  name: job.name,
                  schedule: job.schedule,
                  task: job.task,
                  oneTime: job.oneTime || false
                })),
                count: config.jobs.length
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Failed to list cron jobs: ${error instanceof Error ? error.message : 'Unknown error'}`
              }, null, 2)
            }
          ]
        };
      }
    }
  );
}
