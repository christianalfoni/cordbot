import cron from 'node-cron';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Client, TextChannel } from 'discord.js';
import { SessionManager } from '../agent/manager.js';
import { ChannelMapping } from '../discord/sync.js';
import { parseCronFile, CronJob, validateCronSchedule } from './parser.js';
import { streamToDiscord } from '../agent/stream.js';

interface ScheduledTask {
  job: CronJob;
  task: cron.ScheduledTask;
  channelId: string;
  folderPath: string;
}

export class CronRunner {
  private scheduledTasks: Map<string, ScheduledTask[]> = new Map();
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private channelMappings: Map<string, ChannelMapping> = new Map();

  constructor(
    private client: Client,
    private sessionManager: SessionManager
  ) {}

  /**
   * Start watching and scheduling cron jobs for all channels
   */
  start(channelMappings: ChannelMapping[]): void {
    console.log('⏰ Starting cron scheduler...');

    for (const mapping of channelMappings) {
      this.channelMappings.set(mapping.channelId, mapping);
      this.watchCronFile(mapping);
    }

    console.log(`✅ Watching ${channelMappings.length} cron files`);
  }

  /**
   * Add a new channel to watch
   */
  addChannel(mapping: ChannelMapping): void {
    this.channelMappings.set(mapping.channelId, mapping);
    this.watchCronFile(mapping);
    console.log(`✅ Now watching cron file for #${mapping.channelName}`);
  }

  /**
   * Remove a channel from watching
   */
  removeChannel(channelId: string): void {
    // Stop the watcher
    const watcher = this.watchers.get(channelId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(channelId);
    }

    // Stop all scheduled tasks for this channel
    this.stopChannelTasks(channelId);

    // Remove from channel mappings
    this.channelMappings.delete(channelId);

    console.log(`⏸️  Stopped watching channel ${channelId}`);
  }

  /**
   * Watch a cron file for changes and schedule jobs
   */
  private watchCronFile(mapping: ChannelMapping): void {
    const { cronPath, channelId, folderPath } = mapping;

    // Initial load
    this.loadAndScheduleJobs(channelId, cronPath, folderPath);

    // Watch for changes
    const watcher = chokidar.watch(cronPath, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('change', () => {
      console.log(`🔄 Cron file changed: ${cronPath}`);
      this.loadAndScheduleJobs(channelId, cronPath, folderPath);
    });

    watcher.on('error', (error) => {
      console.error(`Failed to watch cron file ${cronPath}:`, error);
    });

    this.watchers.set(channelId, watcher);
  }

  /**
   * Load cron file and schedule jobs
   */
  private loadAndScheduleJobs(
    channelId: string,
    cronPath: string,
    folderPath: string
  ): void {
    // Stop existing tasks for this channel
    this.stopChannelTasks(channelId);

    try {
      // Parse cron file
      const config = parseCronFile(cronPath);

      if (config.jobs.length === 0) {
        console.log(`No jobs configured for channel ${channelId}`);
        return;
      }

      // Schedule each job
      const tasks: ScheduledTask[] = [];

      for (const job of config.jobs) {
        // Validate cron schedule
        if (!validateCronSchedule(job.schedule)) {
          console.error(
            `Invalid cron schedule for job "${job.name}": ${job.schedule}`
          );
          continue;
        }

        // Schedule the job
        const task = cron.schedule(job.schedule, async () => {
          await this.executeJob(job, channelId, folderPath);
        });

        tasks.push({ job, task, channelId, folderPath });

        console.log(
          `📅 Scheduled job "${job.name}" for channel ${channelId}: ${job.schedule}`
        );
      }

      this.scheduledTasks.set(channelId, tasks);
    } catch (error) {
      console.error(`Failed to load cron file ${cronPath}:`, error);
    }
  }

  /**
   * Execute a scheduled job
   */
  private async executeJob(
    job: CronJob,
    channelId: string,
    folderPath: string
  ): Promise<void> {
    console.log(`⏰ Executing scheduled job: ${job.name}`);

    try {
      const channel = this.client.channels.cache.get(channelId) as TextChannel;

      if (!channel) {
        console.error(`Channel ${channelId} not found`);
        return;
      }

      // Create a session for this job
      const sessionId = `cron_${Date.now()}_${job.name}`;

      // Create query for Claude
      const queryResult = this.sessionManager.createQuery(
        job.task,
        null, // New session for each cron job
        folderPath
      );

      // Stream response with trigger message as prefix
      await streamToDiscord(
        queryResult,
        channel,
        this.sessionManager,
        sessionId,
        `⏰ **Scheduled task:** ${job.task}`
      );

      console.log(`✅ Completed scheduled job: ${job.name}`);

      // Store the session so the next message in this channel can continue it
      this.sessionManager.setPendingCronSession(channelId, sessionId, folderPath);

      // If this is a one-time job, remove it from the cron file
      if (job.oneTime) {
        await this.removeOneTimeJob(channelId, job.name, folderPath);
      }
    } catch (error) {
      console.error(`Failed to execute job "${job.name}":`, error);
    }
  }

  /**
   * Stop all tasks for a channel
   */
  private stopChannelTasks(channelId: string): void {
    const tasks = this.scheduledTasks.get(channelId);

    if (tasks) {
      for (const { task, job } of tasks) {
        task.stop();
        console.log(`⏸️  Stopped job: ${job.name}`);
      }

      this.scheduledTasks.delete(channelId);
    }
  }

  /**
   * Remove a one-time job after it executes
   */
  private async removeOneTimeJob(
    channelId: string,
    jobName: string,
    folderPath: string
  ): Promise<void> {
    try {
      const mapping = this.channelMappings.get(channelId);
      if (!mapping) {
        console.error(`Cannot find channel mapping for ${channelId}`);
        return;
      }

      const cronPath = mapping.cronPath;

      // Read and parse the cron file
      const config = parseCronFile(cronPath);

      // Filter out the completed one-time job
      const updatedJobs = config.jobs.filter(job => job.name !== jobName);

      // Write back to file
      const yamlContent = yaml.dump({ jobs: updatedJobs });
      fs.writeFileSync(cronPath, yamlContent, 'utf-8');

      console.log(`🗑️  Removed one-time job: ${jobName}`);
    } catch (error) {
      console.error(`Failed to remove one-time job "${jobName}":`, error);
    }
  }

  /**
   * Stop all scheduled tasks and watchers
   */
  stop(): void {
    console.log('⏸️  Stopping cron scheduler...');

    // Stop all scheduled tasks
    for (const [channelId, tasks] of this.scheduledTasks) {
      this.stopChannelTasks(channelId);
    }

    // Stop all watchers
    for (const [channelId, watcher] of this.watchers) {
      watcher.close();
      console.log(`⏸️  Stopped watching channel ${channelId}`);
    }

    this.watchers.clear();
    console.log('✅ Cron scheduler stopped');
  }
}
