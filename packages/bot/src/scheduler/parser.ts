import yaml from 'js-yaml';
import fs from 'fs';

export interface CronJob {
  name: string;
  schedule: string;
  task: string;
  oneTime?: boolean;
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

      return {
        name: job.name,
        schedule: job.schedule,
        task: job.task,
        oneTime: job.oneTime === true, // Optional field, defaults to false
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
  // - A number
  // - An asterisk (*)
  // - A range (e.g., 1-5)
  // - A list (e.g., 1,3,5)
  // - A step (e.g., */2)
  const cronPartRegex = /^(\*|(\d+(-\d+)?(,\d+(-\d+)?)*)(\/\d+)?)$/;

  return parts.every(part => cronPartRegex.test(part));
}
