/**
 * Scheduled task definition
 */
export interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  taskDescription: string;
  channelId: string;
  oneTime: boolean;
  enabled: boolean;
  createdAt: number;
  lastRun?: number;
}

/**
 * Task execution function
 */
export type TaskFunction = () => void | Promise<void>;

/**
 * Scheduler interface - abstracts cron job scheduling
 */
export interface IScheduler {
  /**
   * Schedule a new task
   * @returns Task ID
   */
  schedule(cronExpression: string, taskFn: TaskFunction, metadata?: {
    name?: string;
    channelId?: string;
    oneTime?: boolean;
  }): string;

  /**
   * List all scheduled tasks
   */
  list(): ScheduledTask[];

  /**
   * Get a specific task by ID
   */
  get(taskId: string): ScheduledTask | undefined;

  /**
   * Remove a scheduled task
   */
  remove(taskId: string): void;

  /**
   * Update a task's schedule
   */
  updateSchedule(taskId: string, newSchedule: string): void;

  /**
   * Enable or disable a task
   */
  setEnabled(taskId: string, enabled: boolean): void;

  /**
   * Stop all scheduled tasks
   */
  stopAll(): void;

  /**
   * Validate a cron expression
   */
  validate(cronExpression: string): boolean;
}
