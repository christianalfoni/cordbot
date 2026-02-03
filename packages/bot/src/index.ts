import { initializeClaudeFolder } from "./init.js";
import { createProductionBotContext } from "./implementations/factory.js";
import { syncChannelsOnStartup } from "./discord/sync.js";
import { setupEventHandlers } from "./discord/events.js";
import { SessionManager } from "./agent/manager.js";
import { CronRunner } from "./scheduler/runner.js";
import { HealthServer } from "./health/server.js";
import cron from 'node-cron';
import { runDailyMemoryCompression } from "./memory/compress.js";
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { IBotContext } from "./interfaces/core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startBot(cwd: string): Promise<void> {
  // Set HOME environment variable to current working directory
  process.env.HOME = cwd;

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

  // Validate environment variables
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!token || !guildId || !apiKey) {
    throw new Error("Missing required environment variables");
  }

  // Extract bot configuration
  const botMode = (process.env.BOT_MODE || 'personal') as 'personal' | 'shared';
  const botId = process.env.BOT_ID || 'local';
  const botUsername = process.env.DISCORD_BOT_USERNAME || 'Cordbot';
  const memoryContextSize = Math.max(1000, Math.min(100000, parseInt(process.env.MEMORY_CONTEXT_SIZE || '10000')));

  console.log(`🤖 Bot Mode: ${botMode}`);
  console.log(`🆔 Bot ID: ${botId}`);
  console.log(`👤 Bot Username: ${botUsername}`);
  console.log(`💾 Memory Context Size: ${memoryContextSize.toLocaleString()} tokens\n`);

  const botConfig = { mode: botMode, id: botId, username: botUsername };

  // Create bot context with all dependencies
  console.log("🔌 Initializing bot context...\n");
  const context: IBotContext = await createProductionBotContext({
    discordToken: token,
    anthropicApiKey: apiKey,
    guildId,
    workingDirectory: cwd,
    memoryContextSize,
    serviceUrl: process.env.SERVICE_URL,
  });

  // Check active sessions
  const activeSessions = context.sessionStore.getAllActive();
  console.log(`📊 Active sessions: ${activeSessions.length}\n`);

  // Initialize session manager with context
  const sessionManager = new SessionManager(context, sessionsDir, cwd, memoryContextSize);
  await sessionManager.initialize(token);
  console.log("");

  // Sync channels with folders
  const channelMappings = await syncChannelsOnStartup(context.discord, guildId, cwd, botConfig);
  console.log("");

  // Start cron scheduler
  const cronRunner = new CronRunner(context.discord, sessionManager, context.logger);
  cronRunner.start(channelMappings);
  console.log("");

  // Schedule daily memory compression (runs at midnight every day)
  cron.schedule('0 0 * * *', async () => {
    console.log('\n⏰ Running scheduled memory compression');
    const channelIds = channelMappings.map(m => m.channelId);
    try {
      await runDailyMemoryCompression(channelIds);
    } catch (error) {
      console.error('Memory compression failed:', error);
    }
  });
  console.log('📅 Scheduled daily memory compression (midnight)');
  console.log("");

  // Setup event handlers (after cron runner is initialized)
  setupEventHandlers(context, sessionManager, channelMappings, cwd, guildId, cronRunner, context.logger, botConfig);
  console.log("✅ Event handlers registered\n");

  // Start health check server (if port is configured)
  const healthPort = parseInt(process.env.HEALTH_PORT || "8080");
  const healthServer = new HealthServer({
    port: healthPort,
    context,
    startTime: new Date(),
  });
  healthServer.start();
  console.log("");

  // Setup graceful shutdown
  const shutdown = async () => {
    const stack = new Error().stack;
    console.log("\n⏸️  Shutting down Cordbot...");
    console.log("📍 Shutdown triggered from:", stack);

    // Stop health server
    healthServer.stop();

    // Stop cron scheduler
    cronRunner.stop();

    // Stop token refresh
    sessionManager.shutdown();

    // Stop scheduler
    context.scheduler.stopAll();
    console.log("🗄️  Scheduler stopped");

    // Destroy Discord client
    const discordClient = context.discord.getRawClient();
    if (discordClient && discordClient.destroy) {
      discordClient.destroy();
      console.log("🔌 Discord client disconnected");
    }

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
