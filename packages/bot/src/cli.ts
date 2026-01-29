import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { startBot } from './index.js';
import { authenticateWithWebService } from './auth.js';

interface EnvConfig {
  DISCORD_BOT_TOKEN: string;
  DISCORD_GUILD_ID: string;
  ANTHROPIC_API_KEY: string;
  LOG_LEVEL?: string;
  ARCHIVE_AFTER_DAYS?: string;
}

async function generateTemplate(templateName: string): Promise<void> {
  console.log(chalk.cyan.bold('\n📦 Cordbot Template Generator\n'));

  const availableTemplates = ['fly'];

  if (!availableTemplates.includes(templateName)) {
    console.log(chalk.red(`❌ Unknown template: ${templateName}`));
    console.log(chalk.yellow(`\nAvailable templates:`));
    availableTemplates.forEach(t => console.log(chalk.gray(`   - ${t}`)));
    console.log();
    process.exit(1);
  }

  const cwd = process.cwd();

  // Determine the source template directory
  // When running from dist (built), templates are in ../../templates
  // When running from source (tsx), templates are in ../templates
  const distTemplatesPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'templates', templateName);
  const srcTemplatesPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'templates', templateName);

  const templatePath = fs.existsSync(distTemplatesPath) ? distTemplatesPath : srcTemplatesPath;

  if (!fs.existsSync(templatePath)) {
    console.log(chalk.red(`❌ Template directory not found: ${templatePath}`));
    process.exit(1);
  }

  // Copy all files from the template directory to the current directory
  const spinner = ora(`Generating ${templateName} deployment template...`).start();

  try {
    const files = fs.readdirSync(templatePath);

    for (const file of files) {
      const srcPath = path.join(templatePath, file);
      const destPath = path.join(cwd, file);

      // Check if file already exists
      if (fs.existsSync(destPath)) {
        spinner.warn(chalk.yellow(`${file} already exists, skipping...`));
        continue;
      }

      // Copy file
      fs.copyFileSync(srcPath, destPath);
      spinner.succeed(chalk.green(`Created ${file}`));
      spinner.start();
    }

    spinner.stop();
    console.log(chalk.green.bold(`\n✓ ${templateName} template generated successfully!\n`));

    // Show next steps for fly template
    if (templateName === 'fly') {
      console.log(chalk.cyan('Next steps:'));
      console.log(chalk.gray('  1. Review and customize fly.toml and Dockerfile'));
      console.log(chalk.gray('  2. Install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/'));
      console.log(chalk.gray('  3. Follow the deployment guide in DEPLOYMENT.md\n'));
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to generate template'));
    console.error(error);
    process.exit(1);
  }
}

export async function run(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const templateArg = args.find(arg => arg.startsWith('--template='));
  const helpArg = args.find(arg => arg === '--help' || arg === '-h');

  if (helpArg) {
    console.log(chalk.cyan.bold('\n🤖 Cordbot - Discord Bot powered by Claude Code SDK\n'));
    console.log(chalk.white('Usage:'));
    console.log(chalk.gray('  npx @cordbot/agent              Start the bot'));
    console.log(chalk.gray('  npx @cordbot/agent --template=<name>  Generate deployment template\n'));
    console.log(chalk.white('Options:'));
    console.log(chalk.gray('  --template=<name>   Generate deployment template'));
    console.log(chalk.gray('                      Available: fly\n'));
    console.log(chalk.gray('  --help, -h          Show this help message\n'));
    console.log(chalk.white('Examples:'));
    console.log(chalk.gray('  npx @cordbot/agent --template=fly\n'));
    return;
  }

  if (templateArg) {
    const templateName = templateArg.split('=')[1];
    await generateTemplate(templateName);
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

  // If configuration is incomplete and no .env file exists, run setup
  if (!validation.valid && !fs.existsSync(envPath)) {
    console.log(chalk.yellow('No .env file found and environment variables not set.'));
    console.log(chalk.gray(`Current directory: ${cwd}\n`));

    // Use web service authentication flow
    const authResult = await authenticateWithWebService();

    if (!authResult) {
      console.log(chalk.red('\n❌ Authentication failed. Exiting.\n'));
      process.exit(1);
    }

    // Prompt for Claude API key and other config
    const config = await promptForConfiguration(authResult.botToken, authResult.guildId);

    // Write .env file
    const spinner = ora('Creating .env file...').start();
    writeEnvFile(envPath, config);
    spinner.succeed(chalk.green('.env file created successfully!'));

    console.log(chalk.gray(`\n📄 Configuration saved to: ${envPath}\n`));

    // Load the newly created .env file
    dotenv.config({ path: envPath });
  } else if (!validation.valid) {
    // .env file exists but is incomplete
    console.log(chalk.red('\n❌ Missing required environment variables:'));
    validation.missing.forEach(key => {
      console.log(chalk.red(`   - ${key}`));
    });
    console.log(chalk.yellow(`\nPlease set these as environment variables or update ${envPath}.\n`));
    process.exit(1);
  }

  // Configuration is valid (from env vars or .env file)
  console.log(chalk.green('✓ Configuration valid'));

  // Start the bot
  console.log(chalk.cyan('\n🚀 Starting Cordbot...\n'));
  await startBot(cwd);
}

async function promptForConfiguration(botToken: string, guildId: string): Promise<EnvConfig> {
  console.log(chalk.cyan('\n📝 Please provide your Claude API key:\n'));

  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'ANTHROPIC_API_KEY',
      message: 'Anthropic API Key:',
      mask: '*',
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'Anthropic API Key is required';
        }
        if (!input.startsWith('sk-ant-')) {
          return 'Anthropic API Key should start with "sk-ant-"';
        }
        return true;
      },
    },
    {
      type: 'list',
      name: 'LOG_LEVEL',
      message: 'Log Level:',
      choices: ['info', 'debug', 'warn', 'error'],
      default: 'info',
    },
    {
      type: 'input',
      name: 'ARCHIVE_AFTER_DAYS',
      message: 'Archive inactive sessions after (days):',
      default: '30',
      validate: (input) => {
        const num = parseInt(input);
        if (isNaN(num) || num < 1) {
          return 'Must be a positive number';
        }
        return true;
      },
    },
  ]);

  return {
    DISCORD_BOT_TOKEN: botToken,
    DISCORD_GUILD_ID: guildId,
    ...answers,
  };
}

function writeEnvFile(envPath: string, config: EnvConfig): void {
  const lines = [
    '# Cordbot Configuration',
    '# Generated by cordbot agent',
    '',
    '# Discord Configuration',
    `DISCORD_BOT_TOKEN=${config.DISCORD_BOT_TOKEN}`,
    `DISCORD_GUILD_ID=${config.DISCORD_GUILD_ID}`,
    '',
    '# Anthropic Configuration',
    `ANTHROPIC_API_KEY=${config.ANTHROPIC_API_KEY}`,
    '',
    '# Optional Settings',
    `LOG_LEVEL=${config.LOG_LEVEL || 'info'}`,
    `ARCHIVE_AFTER_DAYS=${config.ARCHIVE_AFTER_DAYS || '30'}`,
    '',
    '# Security Note:',
    '# This file contains sensitive credentials. Never commit it to git!',
    '# It should be in your .gitignore file.',
  ];

  fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
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
