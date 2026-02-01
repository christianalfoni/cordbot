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
- **🏥 Health Monitoring**: Built-in health check endpoint for production deployments

## Getting Started

### Prerequisites

1. **Visit [cordbot.io](https://cordbot.io)** to configure your bot and server
2. **Create a Discord Bot**: Follow the instructions on cordbot.io to create your bot application
3. **Get your Anthropic API Key**: Sign up at [console.anthropic.com](https://console.anthropic.com)

### Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and add a bot
3. **Enable Privileged Gateway Intents** (REQUIRED):
   - Go to the **Bot** section
   - Scroll down to **Privileged Gateway Intents**
   - Enable **MESSAGE CONTENT INTENT**
   - Click **Save Changes**
4. Copy your bot token
5. Invite the bot to your server using this URL (replace `YOUR_CLIENT_ID` with your bot's client ID):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=309237763136&scope=bot%20applications.commands
```

**Important:** The bot requires the Message Content privileged intent to read message content. Without this enabled, the bot will fail to connect with a "Used disallowed intents" error.

### Running Cordbot

Run the bot using npx with the required environment variables:

```bash
export DISCORD_BOT_TOKEN="your-discord-bot-token"
export DISCORD_GUILD_ID="your-server-id"
export ANTHROPIC_API_KEY="your-anthropic-api-key"
export WORKSPACE_DIR="./workspace"  # Optional, defaults to ./workspace

npx @cordbot/agent
```

Or create a `.env` file in your project directory:

```env
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-server-id
ANTHROPIC_API_KEY=your-anthropic-api-key
WORKSPACE_DIR=./workspace
```

Then run:

```bash
npx @cordbot/agent
```

### Service Integrations

For additional capabilities like Gmail and Google Calendar, visit **[cordbot.io](https://cordbot.io)** to connect service integrations. When connected, these services become available as tools that Claude can use:
- **Gmail**: Send and read emails
- **Google Calendar**: Create and manage calendar events
- **More integrations**: Additional services coming soon

## How It Works

### Workspace Structure

When Cordbot starts, it creates a workspace-based architecture:

```
workspace/                    # Your workspace directory (where the bot runs)
├── .claude/                 # Bot management folder (created automatically)
│   ├── config.json          # Bot configuration
│   ├── storage/             # Session state and mappings
│   ├── sessions/            # Active conversation sessions
│   ├── skills/              # Global skills (cron, skill-creator)
│   │   ├── cron/            # Cron job management skill
│   │   └── skill-creator/   # Skill creation tool
│   └── channels/            # Channel-specific data
│       └── {channel-id}/    # One directory per Discord channel
│           ├── CLAUDE.md    # Channel-specific instructions
│           └── cron.yaml    # Scheduled jobs for this channel
├── channel-name-1/          # Work folder for Discord channel #1
│   └── (files uploaded to or created for this channel)
└── channel-name-2/          # Work folder for Discord channel #2
    └── (files uploaded to or created for this channel)
```

### How Channels Work

1. **Configure**: Set up your bot on [cordbot.io](https://cordbot.io) and get your credentials
2. **Channel Sync**: Each Discord channel gets:
   - A **work folder** in the workspace (e.g., `workspace/general/`) for files
   - A **data folder** in `.claude/channels/{channel-id}/` for configuration
3. **Contextual Instructions**: Each channel's `CLAUDE.md` in `.claude/channels/{channel-id}/` provides context to Claude
4. **Thread Sessions**: Conversations in Discord threads maintain persistent context stored in `.claude/sessions/`
5. **File Attachments**: Files attached to Discord messages are saved to the channel's work folder
6. **Scheduled Jobs**: Configure `cron.yaml` files in `.claude/channels/{channel-id}/` to run autonomous tasks
7. **Service Tools**: Connected services (Gmail, etc.) become available as tools Claude can use
8. **Skills**: Global skills in `~/.claude/skills/` are available across all channels

### Working with Files

**Sending files to Claude:**

- Attach files to any Discord message (images, code, documents, etc.)
- Files are automatically downloaded to the channel's work folder
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

## Deployment

### Deployment Templates

Generate deployment configurations for various platforms:

```bash
# Generate Fly.io deployment template
npx @cordbot/agent --template=fly
```

This creates:
- `Dockerfile` - Simple container using `npx @cordbot/agent`
- `fly.toml` - Fly.io configuration with persistent volume
- `DEPLOYMENT.md` - Complete deployment guide
- `.dockerignore` - Docker build exclusions

The generated `DEPLOYMENT.md` includes:
- Step-by-step deployment instructions
- Environment variable configuration
- Troubleshooting guides
- Backup and recovery procedures

**Available templates:**
- `fly` - Deploy to Fly.io with filesystem-based session storage

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
