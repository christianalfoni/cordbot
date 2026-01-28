import { initializeClaudeFolder } from "./init.js";
import { createDiscordClient } from "./discord/client.js";
import { syncChannelsOnStartup } from "./discord/sync.js";
import { setupEventHandlers } from "./discord/events.js";
import { SessionDatabase } from "./storage/database.js";
import { SessionManager } from "./agent/manager.js";
import { CronRunner } from "./scheduler/runner.js";

export async function startBot(cwd: string): Promise<void> {
  console.log("🚀 Initializing Cordbot...\n");

  // Initialize .claude folder and database
  const { dbPath, sessionsDir, claudeDir, isFirstRun } = initializeClaudeFolder(cwd);

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

  // Initialize database
  const db = new SessionDatabase(dbPath);
  console.log(`📊 Active sessions: ${db.getActiveCount()}\n`);

  // Initialize session manager
  const sessionManager = new SessionManager(db, sessionsDir);
  await sessionManager.initialize(token);
  console.log("");

  // Connect to Discord
  console.log("🔌 Connecting to Discord...\n");
  const client = await createDiscordClient({ token, guildId });

  // Sync channels with folders
  const channelMappings = await syncChannelsOnStartup(client, guildId, cwd);
  console.log("");

  // Start cron scheduler
  const cronRunner = new CronRunner(client, sessionManager);
  cronRunner.start(channelMappings);
  console.log("");

  // Setup event handlers (after cron runner is initialized)
  setupEventHandlers(client, sessionManager, channelMappings, cwd, guildId, cronRunner);
  console.log("✅ Event handlers registered\n");

  // Setup graceful shutdown
  const shutdown = async () => {
    console.log("\n⏸️  Shutting down Cordbot...");

    // Stop cron scheduler
    cronRunner.stop();

    // Stop token refresh
    sessionManager.shutdown();

    // Close database
    db.close();
    console.log("🗄️  Database closed");

    // Destroy Discord client
    client.destroy();
    console.log("🔌 Discord client disconnected");

    console.log("\n👋 Cordbot stopped");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

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
