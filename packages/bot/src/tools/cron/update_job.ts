import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { parseCronFile, validateCronSchedule } from '../../scheduler/parser.js';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

const schema = z.object({
  name: z.string().describe('Name of the cron job to update'),
  schedule: z.string().optional().describe('New cron schedule (leave empty to keep current)'),
  task: z.string().optional().describe('New task description (leave empty to keep current)'),
  oneTime: z.boolean().optional().describe('Update one-time flag (leave empty to keep current)')
});

export function createTool(getCwd: () => string) {
  return tool(
    'cron_update_job',
    'Update an existing cron job\'s schedule, task, or one-time setting. You can update one or more fields. Use cron_list_jobs first to see current job details.',
    schema.shape,
    async (params) => {
      try {
        // Validate new schedule if provided
        if (params.schedule && !validateCronSchedule(params.schedule)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Invalid cron schedule format: "${params.schedule}". Must be 5 fields: minute hour day month weekday.`,
                  validFormat: 'minute hour day month weekday',
                  examples: [
                    '0 9 * * * - Every day at 9:00 AM',
                    '0 9 * * 1 - Every Monday at 9:00 AM',
                    '*/30 * * * * - Every 30 minutes'
                  ]
                }, null, 2)
              }
            ]
          };
        }

        const cwd = getCwd();
        const cronPath = path.join(cwd, '.claude-cron');

        // Read existing jobs
        const config = parseCronFile(cronPath);

        // Find the job
        const jobIndex = config.jobs.findIndex(job => job.name === params.name);

        if (jobIndex === -1) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Job "${params.name}" not found.`,
                  availableJobs: config.jobs.map(j => j.name)
                }, null, 2)
              }
            ]
          };
        }

        const oldJob = { ...config.jobs[jobIndex] };

        // Update fields
        if (params.schedule) {
          config.jobs[jobIndex].schedule = params.schedule;
        }
        if (params.task) {
          config.jobs[jobIndex].task = params.task;
        }
        if (params.oneTime !== undefined) {
          config.jobs[jobIndex].oneTime = params.oneTime;
        }

        // Write back to file
        const yamlContent = yaml.dump({ jobs: config.jobs });
        fs.writeFileSync(cronPath, yamlContent, 'utf-8');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Cron job "${params.name}" updated successfully!`,
                changes: {
                  before: oldJob,
                  after: config.jobs[jobIndex]
                }
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
                error: `Failed to update cron job: ${error instanceof Error ? error.message : 'Unknown error'}`
              }, null, 2)
            }
          ]
        };
      }
    }
  );
}
