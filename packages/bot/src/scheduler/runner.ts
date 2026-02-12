import chokidar from 'chokidar';
import path from 'path';
import yaml from 'js-yaml';
import { SessionManager } from '../agent/manager.js';
import { ChannelMapping } from '../discord/sync.js';
import { parseCronFile, CronJob, validateCronSchedule, parseCronFileV2, writeCronV2File } from './parser.js';
import type { OneTimeJob, RecurringJob, CronV2Config } from './v2-types.js';
import { streamToDiscord } from '../agent/stream.js';
import { QueryLimitManager } from '../service/query-limit-manager.js';
import type { IDiscordAdapter, ITextChannel, IThreadChannel } from '../interfaces/discord.js';
import type { ILogger } from '../interfaces/logger.js';
import type { IScheduler } from '../interfaces/scheduler.js';
import type { IFileStore } from '../interfaces/file.js';

interface ScheduledTask {
  job: CronJob;
  taskId: string; // Scheduler task ID instead of direct cron.ScheduledTask
  channelId: string;
  folderPath: string;
}

export class CronRunner {
  private scheduledTasks: Map<string, ScheduledTask[]> = new Map();
  private watcher: chokidar.FSWatcher | null = null;
  private channelMappings: Map<string, ChannelMapping> = new Map();
  private cronPath: string = '';

  // V2 scheduling properties
  private cronV2Path: string = '';
  private watcherV2: chokidar.FSWatcher | null = null;
  private oneTimeCheckerTaskId: string | null = null;
  private recurringJobTaskIds: Map<string, string> = new Map(); // jobKey -> taskId

  constructor(
    private discord: IDiscordAdapter,
    private sessionManager: SessionManager,
    private logger: ILogger,
    private scheduler: IScheduler,
    private fileStore: IFileStore,
    private queryLimitManager?: QueryLimitManager
  ) {}

  /**
   * Start watching and scheduling cron jobs from single file
   */
  start(channelMappings: ChannelMapping[], cronPath: string): void {
    this.logger.info('⏰ Starting cron scheduler...');
    this.cronPath = cronPath;

    // Calculate V2 path (parallel to cron.yaml)
    const dir = path.dirname(cronPath);
    this.cronV2Path = path.join(dir, 'cron_v2.yaml');

    for (const mapping of channelMappings) {
      this.channelMappings.set(mapping.channelId, mapping);
    }

    // Watch the single shared cron file
    this.watchCronFile();

    // Watch the V2 cron file
    this.watchCronV2File();

    this.logger.info(`✅ Watching shared cron file at ${cronPath}`);
    this.logger.info(`✅ Watching V2 cron file at ${this.cronV2Path}`);
  }

  /**
   * Add a new channel mapping
   */
  addChannel(mapping: ChannelMapping): void {
    this.channelMappings.set(mapping.channelId, mapping);
    this.logger.info(`✅ Added channel mapping for #${mapping.channelName}`);

    // Reload jobs to pick up any jobs for this new channel
    this.loadAndScheduleJobs();
  }

  /**
   * Remove a channel mapping
   */
  removeChannel(channelId: string): void {
    // Stop all scheduled tasks for this channel
    this.stopChannelTasks(channelId);

    // Remove from channel mappings
    this.channelMappings.delete(channelId);

    this.logger.info(`⏸️  Removed channel mapping ${channelId}`);
  }

  /**
   * Watch the single shared cron file for changes
   */
  private watchCronFile(): void {
    // Initial load
    this.loadAndScheduleJobs();

    // Watch for changes
    this.watcher = chokidar.watch(this.cronPath, {
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('change', () => {
      this.logger.info(`🔄 Cron file changed: ${this.cronPath}`);
      this.loadAndScheduleJobs();
    });

    this.watcher.on('add', () => {
      this.logger.info(`📄 Cron file added: ${this.cronPath}`);
      this.loadAndScheduleJobs();
    });

    this.watcher.on('error', (error) => {
      this.logger.error(`Failed to watch cron file ${this.cronPath}:`, error);
    });
  }

  /**
   * Load cron file and schedule jobs for all channels
   */
  private loadAndScheduleJobs(): void {
    // Stop all existing tasks
    for (const channelId of this.scheduledTasks.keys()) {
      this.stopChannelTasks(channelId);
    }

    try {
      // Parse the single cron file
      const config = parseCronFile(this.cronPath);

      if (config.jobs.length === 0) {
        this.logger.info(`No jobs configured in ${this.cronPath}`);
        return;
      }

      // Group jobs by channel
      const jobsByChannel = new Map<string, CronJob[]>();
      for (const job of config.jobs) {
        if (!jobsByChannel.has(job.channelId)) {
          jobsByChannel.set(job.channelId, []);
        }
        jobsByChannel.get(job.channelId)!.push(job);
      }

      // Schedule jobs for each channel
      for (const [channelId, jobs] of jobsByChannel) {
        const mapping = this.channelMappings.get(channelId);
        if (!mapping) {
          this.logger.warn(`⚠️  No mapping found for channel ${channelId}, skipping jobs`);
          continue;
        }

        const tasks: ScheduledTask[] = [];

        for (const job of jobs) {
          // Validate cron schedule
          if (!validateCronSchedule(job.schedule)) {
            this.logger.error(
              `Invalid cron schedule for job "${job.name}": ${job.schedule}`
            );
            continue;
          }

          // Schedule the job
          const taskId = this.scheduler.schedule(job.schedule, async () => {
            await this.executeJob(job, mapping.folderPath);
          }, {
            name: job.name,
            channelId,
          });

          tasks.push({ job, taskId, channelId: job.channelId, folderPath: mapping.folderPath });

          this.logger.info(
            `📅 Scheduled job "${job.name}" for channel ${channelId}: ${job.schedule}`
          );
        }

        this.scheduledTasks.set(channelId, tasks);
      }
    } catch (error) {
      this.logger.error(`Failed to load cron file ${this.cronPath}:`, error);
    }
  }

  /**
   * Execute a scheduled job
   */
  private async executeJob(
    job: CronJob,
    folderPath: string
  ): Promise<void> {
    this.logger.info(`⏰ Executing scheduled job: ${job.name}`);

    // Check query limit BEFORE execution
    if (this.queryLimitManager) {
      const canProceed = await this.queryLimitManager.canProceedWithQuery();
      if (!canProceed) {
        this.logger.info(`[Cron] Skipping "${job.name}" - query limit reached`);
        return;
      }
    }

    let success = false;
    let cost = 0;

    try {
      // Determine where to send the final response
      // If job has responseThreadId, use that; otherwise use the channel
      const responseChannelId = job.responseThreadId || job.channelId;
      const channel = await this.discord.getChannel(responseChannelId);

      if (!channel) {
        this.logger.error(`Channel/Thread ${responseChannelId} not found`);
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
      this.sessionManager.setChannelIdContext(sessionId, job.channelId);

      try {
        // Get CLAUDE.md path from mapping
        const mapping = this.channelMappings.get(job.channelId);
        if (!mapping) {
          this.logger.error(`❌ No channel mapping found for ${job.channelId}`);
          return;
        }

        const claudeMdPath = mapping.claudeMdPath;
        let systemPrompt: string | undefined;

        if (this.fileStore.exists(claudeMdPath)) {
          try {
            // Get all channel info
            const allChannels = Array.from(this.channelMappings.values()).map(m => ({
              channelId: m.channelId,
              channelName: m.channelName,
            }));

            // Populate memory before reading
            await this.sessionManager.populateMemory(
              claudeMdPath,
              job.channelId,
              mapping.channelName,
              allChannels,
              sessionId
            );

            // Read server description if it exists
            const workspaceRoot = path.dirname(path.dirname(claudeMdPath)); // Go up from .claude/channels/{id} to workspace root
            const serverDescPath = path.join(workspaceRoot, '.claude', 'SERVER_DESCRIPTION.md');
            let serverDescContent = '';
            if (this.fileStore.exists(serverDescPath)) {
              serverDescContent = this.fileStore.readFile(serverDescPath, 'utf-8');
              this.logger.info(`📖 Read SERVER_DESCRIPTION.md for cron job`);
            }

            // Read CLAUDE.md
            const claudeMdContent = this.fileStore.readFile(claudeMdPath, 'utf-8');

            // Inject server description at the top of the system prompt
            if (serverDescContent) {
              systemPrompt = `${serverDescContent}\n\n---\n\n${claudeMdContent}`;
            } else {
              systemPrompt = claudeMdContent;
            }

            this.logger.info(`📖 Read CLAUDE.md for cron job (${claudeMdContent.length} chars)`);
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

        // Pass channel to streamToDiscord (already interface type)
        const streamResult = await streamToDiscord(
          queryResult,
          channel,
          this.sessionManager,
          sessionId,
          folderPath,
          this.logger,
          undefined, // botConfig
          undefined, // messagePrefix (not used for cron jobs)
          undefined, // parentChannelId
          true, // isCronJob - only sends final message with clock emoji suffix
          undefined, // thinkingMessageToDelete
          mapping.channelName // NEW: parentChannelName for server-wide memory
        );

        success = true;
        cost = this.estimateCost(streamResult);

        this.logger.info(`✅ Completed scheduled job: ${job.name}`);

        // Note: Cron sessions are standalone and not continuable
        // Each cron job creates a fresh session

        // If this is a one-time job, remove it from the cron file
        if (job.oneTime) {
          await this.removeOneTimeJob(job.name);
        }
      } finally {
        // Clear contexts after execution
        this.sessionManager.clearChannelContext(sessionId);
        this.sessionManager.clearWorkingDirContext(sessionId);
        this.sessionManager.clearChannelIdContext(sessionId);
      }
    } catch (error) {
      this.logger.error(`Failed to execute job "${job.name}":`, error);
    } finally {
      // Track query usage
      if (this.queryLimitManager) {
        await this.queryLimitManager.trackQuery('scheduled_task', cost, success);
      }
    }
  }

  /**
   * Estimate query cost from response
   */
  private estimateCost(response: any): number {
    if (response?.usage?.total_cost) {
      return response.usage.total_cost;
    }

    const inputTokens = response?.usage?.input_tokens || 0;
    const outputTokens = response?.usage?.output_tokens || 0;

    const inputCost = inputTokens * 0.000003;
    const outputCost = outputTokens * 0.000015;

    return inputCost + outputCost;
  }

  /**
   * Stop all tasks for a channel
   */
  private stopChannelTasks(channelId: string): void {
    const tasks = this.scheduledTasks.get(channelId);

    if (tasks) {
      for (const { taskId, job } of tasks) {
        this.scheduler.remove(taskId);
        this.logger.info(`⏸️  Stopped job: ${job.name}`);
      }

      this.scheduledTasks.delete(channelId);
    }
  }

  /**
   * Remove a one-time job after it executes
   */
  private async removeOneTimeJob(jobName: string): Promise<void> {
    try {
      // Read and parse the single cron file
      const config = parseCronFile(this.cronPath);

      // Filter out the completed one-time job
      const updatedJobs = config.jobs.filter(job => job.name !== jobName);

      // Write back to file
      const yamlContent = yaml.dump({ jobs: updatedJobs });
      this.fileStore.writeFile(this.cronPath, yamlContent, 'utf-8');

      this.logger.info(`🗑️  Removed one-time job: ${jobName}`);
    } catch (error) {
      this.logger.error(`Failed to remove one-time job "${jobName}":`, error);
    }
  }

  /**
   * Stop all scheduled tasks and watcher
   */
  stop(): void {
    this.logger.info('⏸️  Stopping cron scheduler...');

    // Stop all scheduled tasks
    for (const [channelId, tasks] of this.scheduledTasks) {
      this.stopChannelTasks(channelId);
    }

    // Stop the watcher
    if (this.watcher) {
      this.watcher.close();
      this.logger.info(`⏸️  Stopped watching ${this.cronPath}`);
      this.watcher = null;
    }

    // Stop V2 one-time checker
    if (this.oneTimeCheckerTaskId) {
      this.scheduler.remove(this.oneTimeCheckerTaskId);
      this.oneTimeCheckerTaskId = null;
      this.logger.info('⏸️  Stopped one-time job checker');
    }

    // Stop all V2 recurring jobs
    for (const [jobKey, taskId] of this.recurringJobTaskIds) {
      this.scheduler.remove(taskId);
      this.logger.info(`⏸️  Stopped recurring job: ${jobKey}`);
    }
    this.recurringJobTaskIds.clear();

    // Stop V2 watcher
    if (this.watcherV2) {
      this.watcherV2.close();
      this.logger.info(`⏸️  Stopped watching ${this.cronV2Path}`);
      this.watcherV2 = null;
    }

    this.logger.info('✅ Cron scheduler stopped');
  }

  /**
   * Watch the V2 cron file for changes
   */
  private watchCronV2File(): void {
    // Initial load
    this.loadAndScheduleV2Jobs();

    // Watch for changes
    this.watcherV2 = chokidar.watch(this.cronV2Path, {
      persistent: true,
      ignoreInitial: true,
    });

    this.watcherV2.on('change', () => {
      this.logger.info(`🔄 V2 cron file changed: ${this.cronV2Path}`);
      this.loadAndScheduleV2Jobs();
    });

    this.watcherV2.on('add', () => {
      this.logger.info(`📄 V2 cron file added: ${this.cronV2Path}`);
      this.loadAndScheduleV2Jobs();
    });

    this.watcherV2.on('error', (error) => {
      this.logger.error(`Failed to watch V2 cron file ${this.cronV2Path}:`, error);
    });
  }

  /**
   * Load V2 cron file and schedule all jobs
   */
  private loadAndScheduleV2Jobs(): void {
    try {
      const config = parseCronFileV2(this.cronV2Path);

      // Manage one-time checker based on job count
      this.ensureOneTimeChecker(config);

      // Schedule recurring jobs
      this.scheduleRecurringJobs(config);
    } catch (error) {
      this.logger.error(`Failed to load V2 cron file ${this.cronV2Path}:`, error);
    }
  }

  /**
   * Start or stop the one-time checker based on job count
   */
  private ensureOneTimeChecker(config: CronV2Config): void {
    const hasJobs = config.oneTimeJobs.length > 0;

    if (hasJobs && !this.oneTimeCheckerTaskId) {
      // Start checker - runs every minute
      this.oneTimeCheckerTaskId = this.scheduler.schedule(
        '* * * * *',
        () => this.checkOneTimeJobs(),
        {
          name: 'one-time-checker',
          timezone: 'UTC',
        }
      );
      this.logger.info('✅ Started one-time job checker');
    } else if (!hasJobs && this.oneTimeCheckerTaskId) {
      // Stop checker - no jobs to check
      this.scheduler.remove(this.oneTimeCheckerTaskId);
      this.oneTimeCheckerTaskId = null;
      this.logger.info('⏸️  Stopped one-time job checker (no jobs)');
    }
  }

  /**
   * Check and execute one-time jobs that are due
   * Runs every minute via the checker
   */
  private async checkOneTimeJobs(): Promise<void> {
    try {
      const config = parseCronFileV2(this.cronV2Path);
      const now = new Date();

      if (config.oneTimeJobs.length > 0) {
        this.logger.info(`⏱️  Checking ${config.oneTimeJobs.length} one-time job(s) at ${now.toISOString()}`);
      }

      const jobsToExecute: OneTimeJob[] = [];
      const jobsToKeep: OneTimeJob[] = [];

      // Find jobs that are due (targetTime <= now)
      for (const job of config.oneTimeJobs) {
        const targetDate = new Date(job.targetTime);
        this.logger.info(`  Job ${job.id}: target=${targetDate.toISOString()}, now=${now.toISOString()}, due=${targetDate <= now}`);

        if (targetDate <= now) {
          jobsToExecute.push(job);
        } else {
          jobsToKeep.push(job);
        }
      }

      // Execute due jobs
      for (const job of jobsToExecute) {
        this.logger.info(`▶️  Executing one-time job: ${job.id}`);
        await this.executeV2Job(job, 'onetime');
      }

      // Remove executed jobs from config
      if (jobsToExecute.length > 0) {
        config.oneTimeJobs = jobsToKeep;
        writeCronV2File(this.cronV2Path, config);
        this.logger.info(`🗑️  Removed ${jobsToExecute.length} executed one-time job(s)`);
      }
    } catch (error) {
      this.logger.error('Failed to check one-time jobs:', error);
    }
  }

  /**
   * Schedule all recurring jobs from config
   */
  private scheduleRecurringJobs(config: CronV2Config): void {
    // Stop all existing recurring jobs
    for (const [jobKey, taskId] of this.recurringJobTaskIds) {
      this.scheduler.remove(taskId);
    }
    this.recurringJobTaskIds.clear();

    // Schedule new recurring jobs
    for (const job of config.recurringJobs) {
      const mapping = this.channelMappings.get(job.channelId);
      if (!mapping) {
        this.logger.warn(`⚠️  No mapping found for channel ${job.channelId}, skipping recurring job "${job.name}"`);
        continue;
      }

      // Create unique key for this job
      const jobKey = `${job.channelId}:${job.name}`;

      // Schedule with timezone support
      const taskId = this.scheduler.schedule(
        job.cronExpression,
        () => this.executeV2Job(job, 'recurring'),
        {
          name: job.name,
          channelId: job.channelId,
          timezone: job.timezone,
        }
      );

      this.recurringJobTaskIds.set(jobKey, taskId);
      this.logger.info(`📅 Scheduled recurring job "${job.name}" for channel ${job.channelId}: ${job.cronExpression} (${job.timezone})`);
    }
  }

  /**
   * Execute a V2 job (one-time or recurring)
   */
  private async executeV2Job(
    job: OneTimeJob | RecurringJob,
    type: 'onetime' | 'recurring'
  ): Promise<void> {
    const jobName = type === 'onetime' ? (job as OneTimeJob).id : (job as RecurringJob).name;
    this.logger.info(`⏰ Executing V2 ${type} job: ${jobName}`);

    // Check query limit BEFORE execution
    if (this.queryLimitManager) {
      const canProceed = await this.queryLimitManager.canProceedWithQuery();
      if (!canProceed) {
        this.logger.info(`[Cron V2] Skipping "${jobName}" - query limit reached`);
        return;
      }
    }

    let success = false;
    let cost = 0;

    try {
      // Determine where to send the response
      const responseChannelId = job.threadId || job.channelId;
      const channel = await this.discord.getChannel(responseChannelId);

      if (!channel) {
        this.logger.error(`Channel/Thread ${responseChannelId} not found`);
        return;
      }

      // Create session for this job
      const sessionId = `cronv2_${type}_${Date.now()}_${jobName}`;

      // Set channel and working directory context
      if (channel.isTextChannel() || channel.isThreadChannel()) {
        this.sessionManager.setChannelContext(sessionId, channel);
      }

      const mapping = this.channelMappings.get(job.channelId);
      if (!mapping) {
        this.logger.error(`❌ No channel mapping found for ${job.channelId}`);
        return;
      }

      this.sessionManager.setWorkingDirContext(sessionId, mapping.folderPath);
      this.sessionManager.setChannelIdContext(sessionId, job.channelId);

      try {
        const claudeMdPath = mapping.claudeMdPath;
        let systemPrompt: string | undefined;

        if (this.fileStore.exists(claudeMdPath)) {
          try {
            const allChannels = Array.from(this.channelMappings.values()).map(m => ({
              channelId: m.channelId,
              channelName: m.channelName,
            }));

            await this.sessionManager.populateMemory(
              claudeMdPath,
              job.channelId,
              mapping.channelName,
              allChannels,
              sessionId
            );

            // Read server description if it exists
            const workspaceRoot = path.dirname(path.dirname(claudeMdPath)); // Go up from .claude/channels/{id} to workspace root
            const serverDescPath = path.join(workspaceRoot, '.claude', 'SERVER_DESCRIPTION.md');
            let serverDescContent = '';
            if (this.fileStore.exists(serverDescPath)) {
              serverDescContent = this.fileStore.readFile(serverDescPath, 'utf-8');
              this.logger.info(`📖 Read SERVER_DESCRIPTION.md for V2 cron job`);
            }

            // Read CLAUDE.md
            const claudeMdContent = this.fileStore.readFile(claudeMdPath, 'utf-8');

            // Inject server description at the top of the system prompt
            if (serverDescContent) {
              systemPrompt = `${serverDescContent}\n\n---\n\n${claudeMdContent}`;
            } else {
              systemPrompt = claudeMdContent;
            }

            this.logger.info(`📖 Read CLAUDE.md for V2 cron job (${claudeMdContent.length} chars)`);
          } catch (error) {
            this.logger.error('Failed to read CLAUDE.md for V2 cron job:', error);
          }
        } else {
          this.logger.warn(`⚠️  CLAUDE.md not found at ${claudeMdPath}`);
        }

        // Create query prompt
        const cronTaskPrompt = `Execute this scheduled task. Perform the actions using available tools, then report what was done.

Task: ${job.task}`;

        const queryResult = this.sessionManager.createQuery(
          cronTaskPrompt,
          null,
          mapping.folderPath,
          systemPrompt
        );

        // Stream response
        if (!(channel.isTextChannel() || channel.isThreadChannel())) {
          this.logger.error('V2 cron jobs can only run on text or thread channels');
          return;
        }

        const streamResult = await streamToDiscord(
          queryResult,
          channel,
          this.sessionManager,
          sessionId,
          mapping.folderPath,
          this.logger,
          undefined,
          undefined,
          undefined,
          true, // isCronJob
          undefined,
          mapping.channelName
        );

        success = true;
        cost = this.estimateCost(streamResult);

        this.logger.info(`✅ Completed V2 ${type} job: ${jobName}`);
      } finally {
        this.sessionManager.clearChannelContext(sessionId);
        this.sessionManager.clearWorkingDirContext(sessionId);
        this.sessionManager.clearChannelIdContext(sessionId);
      }
    } catch (error) {
      this.logger.error(`Failed to execute V2 ${type} job "${jobName}":`, error);
    } finally {
      if (this.queryLimitManager) {
        await this.queryLimitManager.trackQuery('scheduled_task', cost, success);
      }
    }
  }
}
