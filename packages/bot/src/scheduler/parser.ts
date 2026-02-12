import yaml from 'js-yaml';
import fs from 'fs';
import type { CronV2Config, OneTimeJob, RecurringJob } from './v2-types.js';

export interface CronJob {
  name: string;
  schedule: string;
  task: string;
  channelId: string; // Channel where this job should execute
  oneTime?: boolean;
  responseThreadId?: string; // Optional: send final message to this thread instead of channel
}

export interface CronConfig {
  jobs: CronJob[];
}

export function parseCronFile(filePath: string): CronConfig {
  if (!fs.existsSync(filePath)) {
    return { jobs: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Handle empty file
  if (!content.trim()) {
    return { jobs: [] };
  }

  try {
    const parsed = yaml.load(content) as any;

    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid YAML structure');
    }

    if (!Array.isArray(parsed.jobs)) {
      throw new Error('jobs must be an array');
    }

    // Validate each job
    const jobs: CronJob[] = parsed.jobs.map((job: any, index: number) => {
      if (!job.name || typeof job.name !== 'string') {
        throw new Error(`Job at index ${index} is missing required field: name`);
      }

      if (!job.schedule || typeof job.schedule !== 'string') {
        throw new Error(`Job at index ${index} is missing required field: schedule`);
      }

      if (!job.task || typeof job.task !== 'string') {
        throw new Error(`Job at index ${index} is missing required field: task`);
      }

      if (!job.channelId || typeof job.channelId !== 'string') {
        throw new Error(`Job at index ${index} is missing required field: channelId`);
      }

      return {
        name: job.name,
        schedule: job.schedule,
        task: job.task,
        channelId: job.channelId,
        oneTime: job.oneTime === true, // Optional field, defaults to false
        responseThreadId: job.responseThreadId || undefined, // Optional field
      };
    });

    return { jobs };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse cron file: ${error.message}`);
    }
    throw new Error('Failed to parse cron file');
  }
}

export function validateCronSchedule(schedule: string): boolean {
  // Basic cron format validation: "* * * * *" (minute hour day month weekday)
  const parts = schedule.trim().split(/\s+/);

  if (parts.length !== 5) {
    return false;
  }

  // Each part should be either:
  // - An asterisk (*) with optional step (e.g., */5)
  // - A number with optional step (e.g., 5/2)
  // - A range with optional step (e.g., 1-5, 1-5/2)
  // - A list with optional step (e.g., 1,3,5)
  const cronPartRegex = /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*)(\/\d+)?$/;

  return parts.every(part => cronPartRegex.test(part));
}

/**
 * Parse cron_v2.yaml file and validate structure
 */
export function parseCronFileV2(filePath: string): CronV2Config {
  if (!fs.existsSync(filePath)) {
    return { oneTimeJobs: [], recurringJobs: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Handle empty file
  if (!content.trim()) {
    return { oneTimeJobs: [], recurringJobs: [] };
  }

  try {
    const parsed = yaml.load(content) as any;

    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid YAML structure');
    }

    // Initialize arrays if missing
    const oneTimeJobs = Array.isArray(parsed.oneTimeJobs) ? parsed.oneTimeJobs : [];
    const recurringJobs = Array.isArray(parsed.recurringJobs) ? parsed.recurringJobs : [];

    // Validate each job
    const validatedOneTimeJobs: OneTimeJob[] = oneTimeJobs.map((job: any, index: number) =>
      validateOneTimeJob(job, index)
    );

    const validatedRecurringJobs: RecurringJob[] = recurringJobs.map((job: any, index: number) =>
      validateRecurringJob(job, index)
    );

    return {
      oneTimeJobs: validatedOneTimeJobs,
      recurringJobs: validatedRecurringJobs,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse cron_v2.yaml: ${error.message}`);
    }
    throw new Error('Failed to parse cron_v2.yaml');
  }
}

/**
 * Write cron_v2.yaml file with updated configuration
 */
export function writeCronV2File(filePath: string, config: CronV2Config): void {
  try {
    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: -1, // Disable line wrapping
      noRefs: true, // Don't use YAML references
    });

    fs.writeFileSync(filePath, yamlContent, 'utf-8');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to write cron_v2.yaml: ${error.message}`);
    }
    throw new Error('Failed to write cron_v2.yaml');
  }
}

/**
 * Validate one-time job structure
 */
export function validateOneTimeJob(job: any, index: number): OneTimeJob {
  if (!job.id || typeof job.id !== 'string') {
    throw new Error(`One-time job at index ${index} is missing required field: id`);
  }

  if (!job.naturalTime || typeof job.naturalTime !== 'string') {
    throw new Error(`One-time job at index ${index} is missing required field: naturalTime`);
  }

  if (!job.targetTime || typeof job.targetTime !== 'string') {
    throw new Error(`One-time job at index ${index} is missing required field: targetTime`);
  }

  if (!job.timezone || typeof job.timezone !== 'string') {
    throw new Error(`One-time job at index ${index} is missing required field: timezone`);
  }

  if (!job.task || typeof job.task !== 'string') {
    throw new Error(`One-time job at index ${index} is missing required field: task`);
  }

  if (!job.channelId || typeof job.channelId !== 'string') {
    throw new Error(`One-time job at index ${index} is missing required field: channelId`);
  }

  if (!job.createdAt || typeof job.createdAt !== 'string') {
    throw new Error(`One-time job at index ${index} is missing required field: createdAt`);
  }

  return {
    id: job.id,
    naturalTime: job.naturalTime,
    targetTime: job.targetTime,
    timezone: job.timezone,
    task: job.task,
    channelId: job.channelId,
    threadId: job.threadId || undefined,
    createdAt: job.createdAt,
  };
}

/**
 * Validate recurring job structure
 */
export function validateRecurringJob(job: any, index: number): RecurringJob {
  if (!job.name || typeof job.name !== 'string') {
    throw new Error(`Recurring job at index ${index} is missing required field: name`);
  }

  if (!job.cronExpression || typeof job.cronExpression !== 'string') {
    throw new Error(`Recurring job at index ${index} is missing required field: cronExpression`);
  }

  if (!job.timezone || typeof job.timezone !== 'string') {
    throw new Error(`Recurring job at index ${index} is missing required field: timezone`);
  }

  if (!job.task || typeof job.task !== 'string') {
    throw new Error(`Recurring job at index ${index} is missing required field: task`);
  }

  if (!job.channelId || typeof job.channelId !== 'string') {
    throw new Error(`Recurring job at index ${index} is missing required field: channelId`);
  }

  if (!job.createdAt || typeof job.createdAt !== 'string') {
    throw new Error(`Recurring job at index ${index} is missing required field: createdAt`);
  }

  return {
    name: job.name,
    cronExpression: job.cronExpression,
    timezone: job.timezone,
    task: job.task,
    channelId: job.channelId,
    threadId: job.threadId || undefined,
    createdAt: job.createdAt,
  };
}
