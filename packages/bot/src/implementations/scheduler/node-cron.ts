import cron from 'node-cron';
import type {
  IScheduler,
  ScheduledTask,
  TaskFunction,
} from '../../interfaces/scheduler.js';

interface InternalTask {
  id: string;
  name: string;
  schedule: string;
  taskDescription: string;
  channelId: string;
  oneTime: boolean;
  enabled: boolean;
  createdAt: number;
  lastRun?: number;
  cronTask: cron.ScheduledTask;
  taskFn: TaskFunction;
}

/**
 * Node-cron scheduler implementation
 */
export class NodeCronScheduler implements IScheduler {
  private tasks: Map<string, InternalTask> = new Map();
  private nextId = 1;

  schedule(cronExpression: string, taskFn: TaskFunction, metadata?: {
    name?: string;
    channelId?: string;
    oneTime?: boolean;
  }): string {
    const id = `task_${this.nextId++}`;

    // Wrap the task function to handle one-time execution
    const wrappedFn = async () => {
      try {
        await taskFn();
        const task = this.tasks.get(id);
        if (task) {
          task.lastRun = Date.now();

          // If one-time task, disable and stop it
          if (task.oneTime) {
            task.enabled = false;
            task.cronTask.stop();
          }
        }
      } catch (error) {
        console.error(`Error executing scheduled task ${id}:`, error);
      }
    };

    // Create the cron task
    const cronTask = cron.schedule(cronExpression, wrappedFn, {
      scheduled: true,
    });

    // Store the task
    const task: InternalTask = {
      id,
      name: metadata?.name || `Task ${id}`,
      schedule: cronExpression,
      taskDescription: metadata?.name || 'Scheduled task',
      channelId: metadata?.channelId || '',
      oneTime: metadata?.oneTime || false,
      enabled: true,
      createdAt: Date.now(),
      cronTask,
      taskFn,
    };

    this.tasks.set(id, task);
    return id;
  }

  list(): ScheduledTask[] {
    return Array.from(this.tasks.values()).map(task => ({
      id: task.id,
      name: task.name,
      schedule: task.schedule,
      taskDescription: task.taskDescription,
      channelId: task.channelId,
      oneTime: task.oneTime,
      enabled: task.enabled,
      createdAt: task.createdAt,
      lastRun: task.lastRun,
    }));
  }

  get(taskId: string): ScheduledTask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    return {
      id: task.id,
      name: task.name,
      schedule: task.schedule,
      taskDescription: task.taskDescription,
      channelId: task.channelId,
      oneTime: task.oneTime,
      enabled: task.enabled,
      createdAt: task.createdAt,
      lastRun: task.lastRun,
    };
  }

  remove(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.cronTask.stop();
      this.tasks.delete(taskId);
    }
  }

  updateSchedule(taskId: string, newSchedule: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Stop old task
    task.cronTask.stop();

    // Create new task with same function
    const newCronTask = cron.schedule(newSchedule, async () => {
      try {
        await task.taskFn();
        task.lastRun = Date.now();

        if (task.oneTime) {
          task.enabled = false;
          task.cronTask.stop();
        }
      } catch (error) {
        console.error(`Error executing scheduled task ${taskId}:`, error);
      }
    }, {
      scheduled: task.enabled,
    });

    // Update task
    task.schedule = newSchedule;
    task.cronTask = newCronTask;
  }

  setEnabled(taskId: string, enabled: boolean): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.enabled = enabled;
    if (enabled) {
      task.cronTask.start();
    } else {
      task.cronTask.stop();
    }
  }

  stopAll(): void {
    for (const task of this.tasks.values()) {
      task.cronTask.stop();
    }
  }

  validate(cronExpression: string): boolean {
    return cron.validate(cronExpression);
  }
}
