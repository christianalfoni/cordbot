import { initializeClaudeFolder } from "./init.js";
import { createProductionBotContext } from "./implementations/factory.js";
import { syncChannelsOnStartup } from "./discord/sync.js";
import { setupEventHandlers } from "./discord/events.js";
import { registerCommands } from "./discord/commands.js";
import { SessionManager } from "./agent/manager.js";
import { CronRunner } from "./scheduler/runner.js";
import { HeartbeatRunner } from "./heartbeat/runner.js";
import { HealthServer } from "./health/server.js";
import { QueryLimitManager } from "./service/query-limit-manager.js";
import { installGlobalSkills } from "./tools/skill-loader.js";
import cron from 'node-cron';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { IBotContext } from "./interfaces/core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startBot(cwd: string): Promise<void> {
  // Read version from package.json
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const version = packageJson.version || 'unknown';

  console.log(`🚀 Initializing Cordbot v${version}...\n`);

  // Initialize .claude folder and storage
  const { storageDir, sessionsDir, claudeDir, isFirstRun } = initializeClaudeFolder(cwd);

  if (isFirstRun) {
    console.log("\n✨ First run detected - initialized project structure\n");
  }

  // Create dedicated 'cordbot' working directory for the bot
  const cordbotWorkingDir = path.join(cwd, 'cordbot');
  if (!existsSync(cordbotWorkingDir)) {
    const fs = await import('fs/promises');
    await fs.mkdir(cordbotWorkingDir, { recursive: true });
    console.log(`📁 Created cordbot working directory: ${cordbotWorkingDir}\n`);
  }

  // Validate environment variables
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!token || !guildId || !apiKey) {
    throw new Error("Missing required environment variables");
  }

  // Extract bot configuration
  const botId = process.env.BOT_ID || 'local';
  const botUsername = process.env.DISCORD_BOT_USERNAME || 'Cordbot';
  const memoryContextSize = Math.max(1000, Math.min(100000, parseInt(process.env.MEMORY_CONTEXT_SIZE || '10000')));

  console.log(`🆔 Bot ID: ${botId}`);
  console.log(`👤 Bot Username: ${botUsername}`);
  console.log(`💾 Memory Context Size: ${memoryContextSize.toLocaleString()} tokens\n`);

  const botConfig = { id: botId, username: botUsername };

  // Create bot context with all dependencies
  console.log("🔌 Initializing bot context...\n");
  const { context, discordClient } = await createProductionBotContext({
    discordToken: token,
    anthropicApiKey: apiKey,
    guildId,
    workingDirectory: cordbotWorkingDir,
    memoryContextSize,
    serviceUrl: process.env.SERVICE_URL,
  });

  // Install Discord management skills (after context is created)
  console.log("🔧 Installing Discord management skills...");
  const toolsDir = path.join(__dirname, 'tools');
  const discordToolsDir = path.join(toolsDir, 'discord');

  const skillFiles = [
    { name: 'document_workflow', path: path.join(toolsDir, 'document_workflow.md') },
    { name: 'poll_management', path: path.join(discordToolsDir, 'poll_management.md') },
    { name: 'channel_management', path: path.join(discordToolsDir, 'channel_management.md') },
    { name: 'forum_management', path: path.join(discordToolsDir, 'forum_management.md') },
    { name: 'role_management', path: path.join(discordToolsDir, 'role_management.md') },
    { name: 'event_management', path: path.join(discordToolsDir, 'event_management.md') },
    { name: 'scheduling', path: path.join(discordToolsDir, 'scheduling.md') },
  ];

  const skills = skillFiles
    .filter(skill => existsSync(skill.path))
    .map(skill => ({
      domain: 'discord',
      toolName: skill.name,
      sourcePath: skill.path,
    }));

  if (skills.length > 0) {
    installGlobalSkills(skills, context.homeDirectory);
    console.log(`✅ Installed ${skills.length} Discord management skills\n`);
  } else {
    console.log("⚠️  No Discord management skills found\n");
  }

  // Check active sessions
  const activeSessions = context.sessionStore.getAllActive();
  console.log(`📊 Active sessions: ${activeSessions.length}\n`);

  // Use provided BASE_URL or fallback to web-workspace dev server for local development
  const baseUrl = process.env.BASE_URL || `http://localhost:5174`;
  console.log(`🌐 Base URL: ${baseUrl}`);

  // Initialize session manager with context and Discord client
  // workspace root (cwd) = configuration files (e.g., cron_v2.yaml)
  // cordbot working dir = where cordbot writes its files
  const sessionManager = new SessionManager(context, sessionsDir, cwd, memoryContextSize, discordClient, cordbotWorkingDir, baseUrl);
  await sessionManager.initialize();
  console.log("");

  // Sync channels with folders
  const { mappings: channelMappings, cronPath } = await syncChannelsOnStartup(context.discord, guildId, cwd, cordbotWorkingDir, botConfig);
  console.log("");

  // Provide channel names to the retrieve_conversations tool
  const channelNamesMap = new Map(channelMappings.map(m => [m.channelId, m.channelName]));
  sessionManager.setChannelNames(channelNamesMap);

  // Load memories from disk (for crash recovery)
  console.log("💾 Loading memories from disk...");
  const { memoryManager } = await import("./memory/manager.js");
  await memoryManager.loadFromDisk();
  console.log("");

  // Initialize query limit manager (optional - only if SERVICE_URL is set)
  let queryLimitManager: QueryLimitManager | undefined;

  if (process.env.SERVICE_URL) {
    try {
      queryLimitManager = new QueryLimitManager(guildId, process.env.SERVICE_URL);
      await queryLimitManager.initialize();
      console.log('✅ Query limit manager initialized\n');
    } catch (error) {
      console.error('⚠️  Failed to initialize query limit manager:', error);
      console.log('   Continuing without query limits\n');
    }
  } else {
    console.log('ℹ️  SERVICE_URL not set - running without query limits\n');
  }

  // Start cron scheduler
  const cronRunner = new CronRunner(
    context.discord,
    sessionManager,
    context.logger,
    context.scheduler,
    context.fileStore,
    queryLimitManager
  );
  cronRunner.start(channelMappings, cronPath);
  console.log("");

  // Start heartbeat runner (if configured)
  const heartbeatMinutes = parseInt(process.env.HEARTBEAT_MINUTES || '0');
  let heartbeatRunner: HeartbeatRunner | undefined;

  if (heartbeatMinutes > 0) {
    heartbeatRunner = new HeartbeatRunner(
      sessionManager,
      cordbotWorkingDir,
      cwd,
      channelMappings,
      memoryContextSize,
      context.fileStore,
      context.logger,
      queryLimitManager
    );
    heartbeatRunner.start(heartbeatMinutes);
    console.log(`💓 Heartbeat runner started (every ${heartbeatMinutes} minutes)\n`);
  } else {
    console.log('ℹ️  HEARTBEAT_MINUTES not set - heartbeat disabled\n');
  }


  // Setup event handlers (after cron runner is initialized)
  setupEventHandlers(
    context,
    sessionManager,
    channelMappings,
    cwd,
    cordbotWorkingDir,
    guildId,
    cronRunner,
    context.logger,
    baseUrl,
    botConfig,
    queryLimitManager
  );
  console.log("✅ Event handlers registered\n");

  // Register slash commands
  const clientUser = context.discord.getUser();
  if (clientUser) {
    try {
      await registerCommands(token, clientUser.id, guildId);
      console.log("✅ Slash commands registered\n");
    } catch (error) {
      console.error("⚠️  Failed to register slash commands:", error);
      console.log("   Bot will continue without slash commands\n");
    }
  } else {
    console.error("⚠️  Unable to get bot user ID - skipping slash command registration\n");
  }

  // Start health check server (if port is configured)
  // Note: baseUrl already declared above for SessionManager
  const healthPort = parseInt(process.env.HEALTH_PORT || "8080");
  const healthServer = new HealthServer({
    port: healthPort,
    context,
    startTime: new Date(),
    baseUrl,
  });
  healthServer.start();
  console.log("");

  // Setup graceful shutdown
  const shutdown = async () => {
    const stack = new Error().stack;
    console.log("\n⏸️  Shutting down Cordbot...");
    console.log("📍 Shutdown triggered from:", stack);

    // Flush memories to disk
    console.log("💾 Flushing memories to disk...");
    const { memoryManager } = await import("./memory/manager.js");
    await memoryManager.flushAll();
    console.log("✅ Memories flushed");

    // Stop health server
    healthServer.stop();

    // Stop heartbeat runner
    if (heartbeatRunner) {
      heartbeatRunner.stop();
    }

    // Stop cron scheduler
    cronRunner.stop();

    // Stop token refresh
    sessionManager.shutdown();

    // Stop scheduler
    context.scheduler.stopAll();
    console.log("🗄️  Scheduler stopped");

    // Destroy Discord client
    context.discord.destroy();
    console.log("🔌 Discord client disconnected");

    console.log("\n👋 Cordbot stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => {
    console.log("🔴 Received SIGINT signal");
    shutdown();
  });
  process.on("SIGTERM", () => {
    console.log("🔴 Received SIGTERM signal");
    shutdown();
  });

  // Handle unhandled promise rejections to prevent silent crashes
  process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Promise Rejection:", reason);
    console.error("Promise:", promise);
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
  });

  // Detect unexpected exits
  process.on("beforeExit", (code) => {
    console.log("⚠️  Process beforeExit event with code:", code);
  });

  process.on("exit", (code) => {
    console.log("⚠️  Process exiting with code:", code);
  });

  // Archive old sessions periodically (every 24 hours)
  const archiveDays = parseInt(process.env.ARCHIVE_AFTER_DAYS || "30");
  setInterval(async () => {
    const archived = await sessionManager.archiveOldSessions(archiveDays);
    if (archived > 0) {
      console.log(`🗄️  Archived ${archived} inactive sessions`);
    }
  }, 24 * 60 * 60 * 1000);

  console.log("✅ Cordbot is now running!\n");
  console.log(`📊 Watching ${channelMappings.length} channels`);
  console.log(`💬 Bot is ready to receive messages\n`);
  console.log("Press Ctrl+C to stop\n");
}
