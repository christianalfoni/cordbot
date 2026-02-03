import cron from 'node-cron';
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { SessionManager } from '../agent/manager.js';
import { ChannelMapping } from '../discord/sync.js';
import { parseCronFile, CronJob, validateCronSchedule } from './parser.js';
import { streamToDiscord } from '../agent/stream.js';
import type { IDiscordAdapter, ITextChannel, IThreadChannel } from '../interfaces/discord.js';
import type { ILogger } from '../interfaces/logger.js';

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
    private discord: IDiscordAdapter,
    private sessionManager: SessionManager,
    private logger: ILogger
  ) {}

  /**
   * Start watching and scheduling cron jobs for all channels
   */
  start(channelMappings: ChannelMapping[]): void {
    this.logger.info('⏰ Starting cron scheduler...');

    for (const mapping of channelMappings) {
      this.channelMappings.set(mapping.channelId, mapping);
      this.watchCronFile(mapping);
    }

    this.logger.info(`✅ Watching ${channelMappings.length} cron files`);
  }

  /**
   * Add a new channel to watch
   */
  addChannel(mapping: ChannelMapping): void {
    this.channelMappings.set(mapping.channelId, mapping);
    this.watchCronFile(mapping);
    this.logger.info(`✅ Now watching cron file for #${mapping.channelName}`);
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

    this.logger.info(`⏸️  Stopped watching channel ${channelId}`);
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
      this.logger.info(`🔄 Cron file changed: ${cronPath}`);
      this.loadAndScheduleJobs(channelId, cronPath, folderPath);
    });

    watcher.on('error', (error) => {
      this.logger.error(`Failed to watch cron file ${cronPath}:`, error);
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
        this.logger.info(`No jobs configured for channel ${channelId}`);
        return;
      }

      // Schedule each job
      const tasks: ScheduledTask[] = [];

      for (const job of config.jobs) {
        // Validate cron schedule
        if (!validateCronSchedule(job.schedule)) {
          this.logger.error(
            `Invalid cron schedule for job "${job.name}": ${job.schedule}`
          );
          continue;
        }

        // Schedule the job
        const task = cron.schedule(job.schedule, async () => {
          await this.executeJob(job, channelId, folderPath);
        });

        tasks.push({ job, task, channelId, folderPath });

        this.logger.info(
          `📅 Scheduled job "${job.name}" for channel ${channelId}: ${job.schedule}`
        );
      }

      this.scheduledTasks.set(channelId, tasks);
    } catch (error) {
      this.logger.error(`Failed to load cron file ${cronPath}:`, error);
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
    this.logger.info(`⏰ Executing scheduled job: ${job.name}`);

    try {
      const channel = await this.discord.getChannel(channelId);

      if (!channel) {
        this.logger.error(`Channel ${channelId} not found`);
        return;
      }

      // Create a session for this job
      const sessionId = `cron_${Date.now()}_${job.name}`;

      // Set channel and working directory context for tools
      // Only set channel context if it's a text or thread channel
      if (channel.isTextChannel() || channel.isThreadChannel()) {
        this.sessionManager.setChannelContext(sessionId, channel);
      }
      this.sessionManager.setWorkingDirContext(sessionId, folderPath);
      this.sessionManager.setChannelIdContext(sessionId, channelId);

      try {
        // Get CLAUDE.md path from mapping
        const mapping = this.channelMappings.get(channelId);
        if (!mapping) {
          this.logger.error(`❌ No channel mapping found for ${channelId}`);
          return;
        }

        const claudeMdPath = mapping.claudeMdPath;
        let systemPrompt: string | undefined;

        if (fs.existsSync(claudeMdPath)) {
          try {
            // Populate memory before reading
            await this.sessionManager.populateMemory(claudeMdPath, channelId, sessionId);
            systemPrompt = fs.readFileSync(claudeMdPath, 'utf-8');
            this.logger.info(`📖 Read CLAUDE.md for cron job (${systemPrompt.length} chars)`);
          } catch (error) {
            this.logger.error('Failed to read CLAUDE.md for cron job:', error);
          }
        } else {
          this.logger.warn(`⚠️  CLAUDE.md not found at ${claudeMdPath}`);
        }

        // Create query for Claude with special instructions for scheduled tasks
        const cronTaskPrompt = `Execute this scheduled task. Perform the actions using available tools, then report what was done.

Task: ${job.task}`;

        const queryResult = this.sessionManager.createQuery(
          cronTaskPrompt,
          null, // New session for each cron job
          folderPath,
          systemPrompt
        );

        // Stream response - only send final message for cron jobs
        // Cron jobs should only run on text or thread channels, not forum channels
        if (!(channel.isTextChannel() || channel.isThreadChannel())) {
          this.logger.error('Cron jobs can only run on text or thread channels');
          return;
        }

        // streamToDiscord expects raw Discord.js types (TextChannel or ThreadChannel only)
        const rawChannel = channel._raw;
        if (!rawChannel) {
          this.logger.error('Channel does not have raw Discord.js type');
          return;
        }

        await streamToDiscord(
          queryResult,
          rawChannel as import('discord.js').TextChannel | import('discord.js').ThreadChannel,
          this.sessionManager,
          sessionId,
          folderPath,
          this.logger,
          undefined, // botConfig
          undefined, // messagePrefix (not used for cron jobs)
          undefined, // parentChannelId
          true // isCronJob - only sends final message with clock emoji suffix
        );

        this.logger.info(`✅ Completed scheduled job: ${job.name}`);

        // Note: Cron sessions are standalone and not continuable
        // Each cron job creates a fresh session

        // If this is a one-time job, remove it from the cron file
        if (job.oneTime) {
          await this.removeOneTimeJob(channelId, job.name, folderPath);
        }
      } finally {
        // Clear contexts after execution
        this.sessionManager.clearChannelContext(sessionId);
        this.sessionManager.clearWorkingDirContext(sessionId);
        this.sessionManager.clearChannelIdContext(sessionId);
      }
    } catch (error) {
      this.logger.error(`Failed to execute job "${job.name}":`, error);
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
        this.logger.info(`⏸️  Stopped job: ${job.name}`);
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
        this.logger.error(`Cannot find channel mapping for ${channelId}`);
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

      this.logger.info(`🗑️  Removed one-time job: ${jobName}`);
    } catch (error) {
      this.logger.error(`Failed to remove one-time job "${jobName}":`, error);
    }
  }

  /**
   * Stop all scheduled tasks and watchers
   */
  stop(): void {
    this.logger.info('⏸️  Stopping cron scheduler...');

    // Stop all scheduled tasks
    for (const [channelId, tasks] of this.scheduledTasks) {
      this.stopChannelTasks(channelId);
    }

    // Stop all watchers
    for (const [channelId, watcher] of this.watchers) {
      watcher.close();
      this.logger.info(`⏸️  Stopped watching channel ${channelId}`);
    }

    this.watchers.clear();
    this.logger.info('✅ Cron scheduler stopped');
  }
}
