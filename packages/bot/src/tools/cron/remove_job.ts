import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { parseCronFile } from '../../scheduler/parser.js';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

const schema = z.object({
  name: z.string().describe('Name of the cron job to remove')
});

export function createTool(getCwd: () => string) {
  return tool(
    'cron_remove_job',
    'Remove a scheduled cron job from this Discord channel by name. The job will stop running immediately. Use cron_list_jobs first to see available job names.',
    schema.shape,
    async (params) => {
      try {
        const cwd = getCwd();
        const cronPath = path.join(cwd, '.claude-cron');

        // Read existing jobs
        const config = parseCronFile(cronPath);

        // Find the job
        const jobToRemove = config.jobs.find(job => job.name === params.name);

        if (!jobToRemove) {
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

        // Remove the job
        const updatedJobs = config.jobs.filter(job => job.name !== params.name);

        // Write back to file
        const yamlContent = yaml.dump({ jobs: updatedJobs });
        fs.writeFileSync(cronPath, yamlContent, 'utf-8');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `Cron job "${params.name}" removed successfully!`,
                removedJob: jobToRemove,
                remainingJobs: updatedJobs.length
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
                error: `Failed to remove cron job: ${error instanceof Error ? error.message : 'Unknown error'}`
              }, null, 2)
            }
          ]
        };
      }
    }
  );
}
