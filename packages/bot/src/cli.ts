import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { startBot } from './index.js';

export async function run(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const helpArg = args.find(arg => arg === '--help' || arg === '-h');

  if (helpArg) {
    console.log(chalk.cyan.bold('\n🤖 Cordbot - Discord Bot powered by Claude Code SDK\n'));
    console.log(chalk.white('Usage:'));
    console.log(chalk.gray('  npx @cordbot/agent              Start the bot\n'));
    console.log(chalk.white('Options:'));
    console.log(chalk.gray('  --help, -h          Show this help message\n'));
    console.log(chalk.white('Environment Variables:'));
    console.log(chalk.gray('  DISCORD_BOT_TOKEN     Your Discord bot token'));
    console.log(chalk.gray('  DISCORD_GUILD_ID      Your Discord server ID'));
    console.log(chalk.gray('  ANTHROPIC_API_KEY     Your Anthropic API key\n'));
    console.log(chalk.white('Example:'));
    console.log(chalk.gray('  export DISCORD_BOT_TOKEN=your-token'));
    console.log(chalk.gray('  export DISCORD_GUILD_ID=your-guild-id'));
    console.log(chalk.gray('  export ANTHROPIC_API_KEY=your-api-key'));
    console.log(chalk.gray('  npx @cordbot/agent\n'));
    return;
  }

  console.log(chalk.cyan.bold('\n🤖 Cordbot - Discord Bot powered by Claude Code SDK\n'));

  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');

  // First, try to load from .env file if it exists
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  // Check if we have all required environment variables
  const validation = validateConfig();

  if (!validation.valid) {
    console.log(chalk.red('\n❌ Missing required environment variables:'));
    validation.missing.forEach(key => {
      console.log(chalk.red(`   - ${key}`));
    });
    console.log(chalk.yellow(`\nPlease set these as environment variables${fs.existsSync(envPath) ? ` or update ${envPath}` : ' or create a .env file'}.\n`));
    console.log(chalk.gray('Required environment variables:'));
    console.log(chalk.gray('  - DISCORD_BOT_TOKEN'));
    console.log(chalk.gray('  - DISCORD_GUILD_ID'));
    console.log(chalk.gray('  - ANTHROPIC_API_KEY\n'));
    process.exit(1);
  }

  // Configuration is valid (from env vars or .env file)
  console.log(chalk.green('✓ Configuration valid'));

  // Start the bot
  console.log(chalk.cyan('\n🚀 Starting Cordbot...\n'));
  await startBot(cwd);
}

function validateConfig(): { valid: boolean; missing: string[] } {
  const required = [
    'DISCORD_BOT_TOKEN',
    'DISCORD_GUILD_ID',
    'ANTHROPIC_API_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);

  return {
    valid: missing.length === 0,
    missing,
  };
}
