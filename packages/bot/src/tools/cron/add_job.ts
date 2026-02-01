import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { parseCronFile, validateCronSchedule } from '../../scheduler/parser.js';
import { getCronFilePath } from './utils.js';
import yaml from 'js-yaml';
import fs from 'fs';

const schema = z.object({
  name: z.string().describe('Unique name for this cron job (e.g., "Daily summary", "Weekly report")'),
  schedule: z.string().describe('Cron schedule in 5-field format: "minute hour day month weekday". Examples: "0 9 * * *" (daily at 9am), "0 9 * * 1" (Mondays at 9am), "*/30 * * * *" (every 30 minutes)'),
  task: z.string().describe('Description of the task for Claude to execute when this job runs (e.g., "Summarize recent changes", "Generate weekly report")'),
  oneTime: z.boolean().optional().describe('Set to true for one-time tasks that should be removed after execution. Default: false')
});

export function createTool(getChannelId: () => string) {
  return tool(
    'cron_add_job',
    'Add a new scheduled cron job to this Discord channel. Use this instead of bash cron/at commands - jobs will execute autonomously and post results directly to the Discord channel. Always list jobs first to avoid duplicate names.',
    schema.shape,
    async (params) => {
      try {
        // Validate cron schedule format
        if (!validateCronSchedule(params.schedule)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Invalid cron schedule format: "${params.schedule}". Must be 5 fields: minute hour day month weekday. Example: "0 9 * * *" for daily at 9am.`,
                  validFormat: 'minute hour day month weekday',
                  examples: [
                    '0 9 * * * - Every day at 9:00 AM',
                    '0 9 * * 1 - Every Monday at 9:00 AM',
                    '*/30 * * * * - Every 30 minutes',
                    '0 0 1 * * - First day of every month at midnight'
                  ]
                }, null, 2)
              }
            ]
          };
        }

        const channelId = getChannelId();
        const cronPath = getCronFilePath(channelId);

        // Read existing jobs
        const config = parseCronFile(cronPath);

        // Check for duplicate name
        if (config.jobs.some(job => job.name === params.name)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `A job named "${params.name}" already exists. Use a different name or remove the existing job first.`,
                  existingJob: config.jobs.find(job => job.name === params.name)
                }, null, 2)
              }
            ]
          };
        }

        // Add new job
        config.jobs.push({
          name: params.name,
          schedule: params.schedule,
          task: params.task,
          oneTime: params.oneTime || false
        });

        // Write back to file
        const yamlContent = yaml.dump({ jobs: config.jobs });
        fs.writeFileSync(cronPath, yamlContent, 'utf-8');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Cron job "${params.name}" added successfully!`,
                job: {
                  name: params.name,
                  schedule: params.schedule,
                  task: params.task,
                  oneTime: params.oneTime || false
                },
                note: 'The job will be automatically scheduled and will start running according to the schedule. Results will be posted to this Discord channel.'
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
                error: `Failed to add cron job: ${error instanceof Error ? error.message : 'Unknown error'}`
              }, null, 2)
            }
          ]
        };
      }
    }
  );
}
