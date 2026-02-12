/**
 * Type definitions for Cron Jobs V2 scheduling system
 */

/**
 * A one-time scheduled job that executes at a specific time
 */
export interface OneTimeJob {
  /** Unique identifier (e.g., "job_1707234567890") */
  id: string;
  /** Natural language time input (e.g., "tomorrow at 9pm") */
  naturalTime: string;
  /** Parsed target time in ISO 8601 format */
  targetTime: string;
  /** IANA timezone identifier (e.g., "America/New_York") */
  timezone: string;
  /** The task/message to execute */
  task: string;
  /** Discord channel ID where the job was created */
  channelId: string;
  /** Optional Discord thread ID if replying in thread */
  threadId?: string;
  /** ISO 8601 timestamp when the job was created */
  createdAt: string;
}

/**
 * A recurring scheduled job that executes based on a cron expression
 */
export interface RecurringJob {
  /** Unique name for the recurring job */
  name: string;
  /** Cron expression (e.g., "0 9 * * *" for 9am daily) */
  cronExpression: string;
  /** IANA timezone identifier (e.g., "America/New_York") */
  timezone: string;
  /** The task/message to execute */
  task: string;
  /** Discord channel ID where the job was created */
  channelId: string;
  /** Optional Discord thread ID if replying in thread */
  threadId?: string;
  /** ISO 8601 timestamp when the job was created */
  createdAt: string;
}

/**
 * Configuration structure for cron_v2.yaml file
 */
export interface CronV2Config {
  /** Array of one-time scheduled jobs */
  oneTimeJobs: OneTimeJob[];
  /** Array of recurring scheduled jobs */
  recurringJobs: RecurringJob[];
}
