# Cordbot

A Discord bot powered by the Claude Agent SDK that enables autonomous AI assistance directly in your Discord server.

## Overview

Cordbot is a directory-based Discord bot that syncs Discord channels to local folders, maintains persistent conversation sessions in threads, and supports scheduled autonomous tasks. It uses the Claude Agent SDK with full system access (dangerous mode) to read files, run commands, and make code changes.

## Key Features

- **🤖 Autonomous AI Agent**: Full Claude Code SDK capabilities with dangerous mode enabled
- **💬 Thread-Based Sessions**: Each Discord thread maintains persistent conversation history
- **📁 Directory-Based**: Each workspace directory has its own configuration and synced channels
- **📎 File Attachments**: Upload files to Claude or receive generated files back through Discord
- **⏰ Scheduled Tasks**: Configure autonomous tasks with `.claude-cron` files
- **🔌 Service Integrations**: Connect Gmail, Google Calendar, and other services via OAuth
- **🔄 Hot Reload**: Watches for configuration changes and reloads automatically

## Getting Started

### Quick Start (Manual Setup)

You can run the agent locally by setting environment variables:

```bash
export DISCORD_BOT_TOKEN="your-discord-bot-token"
export DISCORD_GUILD_ID="your-server-id"
export WORKSPACE_DIR="./workspace"  # Optional, defaults to ./workspace

npx @cordbot/agent
```

The agent will sync Discord channels to folders in your workspace directory, where you can interact with Claude through Discord messages and threads.

### Enhanced Setup (With Service Integrations)

For additional capabilities like Gmail, Google Calendar, and other integrations, visit **[cordbot.io](https://cordbot.io)** to:

1. Sign in with your Discord account
2. Configure your bot token and server
3. Connect service integrations (Gmail, Google Calendar, etc.)
4. Run the agent with automatic authentication

When signed in to the service, the agent can access connected integrations as tools that Claude can use. For example:
- **Gmail**: Send and read emails
- **Google Calendar**: Create and manage calendar events
- **More integrations**: Additional services coming soon

Run with authentication:

```bash
npx @cordbot/agent
```

The agent will automatically authenticate with your cordbot.io account and gain access to your connected services.

## How It Works

1. **Authentication**: Sign in at cordbot.io to configure your bot and get authenticated
2. **Channel Sync**: Discord channels are synced to local folders in your workspace directory
3. **Contextual Instructions**: Each channel folder has a `CLAUDE.md` file providing context to Claude
4. **Thread Sessions**: Start a conversation in Discord and the bot maintains context throughout the thread
5. **File Attachments**: Send files to Claude by attaching them to Discord messages, or receive files Claude generates
6. **Scheduled Jobs**: Configure `.claude-cron` files to run autonomous tasks on a schedule
7. **Service Tools**: Connected services (Gmail, etc.) become available as tools Claude can use

### Working with Files

**Sending files to Claude:**

- Attach files to any Discord message (images, code, documents, etc.)
- Files are automatically downloaded to the channel folder
- Claude can read, edit, and process them using its standard tools
- Existing files with the same name are overwritten

**Receiving files from Claude:**

- Claude can use the `shareFile` tool to send files back to you
- Files are attached to Discord after Claude's response
- Works with any file type: generated code, diagrams, reports, etc.

Example:

```
You: [Attach config.json] "Can you update the timeout to 30 seconds?"
Claude: [Reads config.json, edits it, uses shareFile to send back]
Discord: 📎 Shared files: config.json
```

## Project Structure

This is a monorepo containing:

- **`packages/bot/`** - The agent process and Discord bot
- **`packages/web-service/`** - Web dashboard for configuration and OAuth flows

## Documentation

- **Agent Documentation**: See [packages/bot/README.md](packages/bot/README.md) for detailed agent usage
- **Web Service**: Visit [cordbot.io](https://cordbot.io) for setup and configuration
- **How It Works**: See the documentation section at [cordbot.io](https://cordbot.io) for details on channels, threads, messages, and cron jobs

## Security Warning

Cordbot runs in "dangerous mode" with full system access:

- Full filesystem read/write
- Bash command execution
- Network operations
- Package management

**Only use in trusted environments with controlled Discord access.** Never share your authentication tokens or commit `.env` files to git.

## Development

```bash
# Install dependencies
npm install

# Build packages
npm run build

# Run tests
npm test
```

## License

MIT

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/yourusername/cordbot).
