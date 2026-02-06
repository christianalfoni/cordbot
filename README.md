# Cordbot

An open-source Discord bot powered by the [Claude](https://claude.ai) Agent SDK that enables autonomous AI assistance directly in your Discord server.

Visit [cordbot.io](https://cordbot.io) for the web dashboard and documentation.

## Overview

Cordbot deploys a Claude agent that observes your Discord server, maintains conversation memory, and helps your community with tasks. Bring your own Claude API key and deploy on your own infrastructure for complete control.

## Running on Your Own

### Prerequisites

1. **Claude API Key** - Get your key at [console.anthropic.com](https://console.anthropic.com)
2. **Discord Bot** - Follow the setup instructions below

### Discord Bot Setup

1. **Create a Discord Application**

   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application"
   - Give your application a name (e.g., "My Cordbot")
   - Click "Create"

2. **Create a Bot User**

   - In your application, go to the "Bot" section in the left sidebar
   - Click "Add Bot" and confirm
   - Under the bot's username, click "Reset Token" to reveal your bot token
   - **Copy and save this token securely** - you'll need it later

3. **Enable Required Intents**

   - Scroll down to "Privileged Gateway Intents"
   - Enable **"MESSAGE CONTENT INTENT"** (required)
   - Enable **"SERVER MEMBERS INTENT"** (required)
   - Click "Save Changes"

4. **Get Your Bot's Client ID**

   - In the "OAuth2" section, find your "Client ID"
   - Copy this ID

5. **Invite Bot to Your Server**
   - Use this invite URL, replacing `YOUR_CLIENT_ID` with your bot's Client ID:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=55370986941526&scope=bot
   ```
   - Open the URL in your browser
   - Select the server you want to add the bot to
   - Click "Authorize"

   **Required Permissions (18 total):**
   - General: View Channels, Manage Channels, Manage Roles, Kick Members, Ban Members, Manage Events, Create Events
   - Text: Send Messages, Create Threads (Public/Private), Send in Threads, Manage Messages/Threads, Embed Links, Attach Files, Read History, Add Reactions, Create Polls

### Start the bot

Run the bot directly with npx:

1. **Create a workspace directory**

   Create an empty folder that will serve as the bot's workspace:

   ```bash
   mkdir cordbot-workspace
   cd cordbot-workspace
   ```

2. **Set environment variables**

   Create a `.env` file in this directory:

   ```env
   DISCORD_BOT_TOKEN=your-discord-bot-token
   DISCORD_GUILD_ID=your-server-id
   ANTHROPIC_API_KEY=your-anthropic-api-key
   ```

3. **Run the bot**
   ```bash
   npx @cordbot/agent
   ```

   **Note for local development:** When running the bot on your local machine, set the `HOME` environment variable to the current directory to ensure all bot data (configuration, memory, channels) is scoped to your workspace:

   ```bash
   HOME=$(pwd) npx @cordbot/agent
   ```

   This prevents the bot from using your system's home directory and keeps everything contained in your workspace.

The bot will start observing your Discord server and responding to messages. It will create channel folders and configuration files in this workspace directory.

## Deploy to Fly.io

For 24/7 operation, deploy to [Fly.io](https://fly.io):

1. **Create a project directory**

   ```bash
   mkdir cordbot-deploy
   cd cordbot-deploy
   ```

2. **Create a Dockerfile**

   Create a file named `Dockerfile`:

   ```dockerfile
   FROM node:20-slim

   # Install additional tools that might be needed
   RUN apt-get update && apt-get install -y \
       sqlite3 \
       && rm -rf /var/lib/apt/lists/*

   # Set HOME to workspace for persistent ~/.claude/ directory
   ENV HOME=/workspace

   # Accept version as build argument
   ARG CORDBOT_VERSION=latest

   # Install cordbot package with specified version
   RUN npm install -g @cordbot/agent@${CORDBOT_VERSION}

   # Create workspace directory for persistent storage
   # Use the existing 'node' user from the base image (already UID 1000)
   RUN mkdir -p /workspace && chown node:node /workspace

   # Switch to non-root user
   USER node

   # Set working directory to the volume mount point
   # The volume will be mounted here, making it persistent
   WORKDIR /workspace

   # Run cordbot (will use /workspace as its workspace)
   CMD ["cordbot"]
   ```

3. **Create a fly.toml configuration**

   Create a file named `fly.toml`:

   ```toml
   app = "your-cordbot-name"
   primary_region = "iad"

   [build]

   [env]
     WORKSPACE_DIR = "/workspace"

   [mounts]
     source = "cordbot_data"
     destination = "/workspace"

   [[vm]]
     memory = '2gb'
     cpu_kind = 'shared'
     cpus = 1
   ```

4. **Deploy with Fly CLI**

   ```bash
   # Install Fly CLI
   brew install flyctl  # macOS
   # or: curl -L https://fly.io/install.sh | sh

   # Login to Fly
   fly auth login

   # Create volume for persistent storage
   fly volumes create cordbot_data --size 1

   # Set secrets
   fly secrets set DISCORD_BOT_TOKEN="your-token"
   fly secrets set DISCORD_GUILD_ID="your-guild-id"
   fly secrets set ANTHROPIC_API_KEY="your-api-key"

   # Deploy
   fly deploy
   ```

## Project Structure

This is a monorepo managed with pnpm workspaces:

```
cordbot/
├── packages/
│   ├── bot/                    # Discord bot agent
│   │   ├── src/
│   │   │   ├── agent/          # Claude agent integration
│   │   │   ├── discord/        # Discord API adapter
│   │   │   ├── memory/         # Long-term memory system
│   │   │   ├── permissions/    # Permission management
│   │   │   └── index.ts        # Bot entry point
│   │   └── package.json
│   │
│   └── web-service/            # Web dashboard
│       ├── src/
│       │   ├── components/     # React components
│       │   ├── pages/          # Page components
│       │   ├── hooks/          # React hooks
│       │   └── firebase.ts     # Firebase config
│       └── package.json
│
├── package.json                # Root package.json
├── pnpm-workspace.yaml         # Workspace configuration
└── README.md                   # This file
```

### Key Components

- **`packages/bot/`** - The Discord bot that runs the Claude agent

  - Discord.js integration for server interaction
  - Claude Agent SDK for AI capabilities
  - Memory system for long-term context
  - Permission system for sensitive operations
  - Cron scheduler for autonomous tasks

- **`packages/web-service/`** - Web dashboard for configuration
  - React + Vite + TypeScript
  - Firebase for authentication and storage
  - Bot setup and configuration UI
  - OAuth service integrations

## Contributing

We welcome contributions! Cordbot is open source to enable community collaboration and transparency.

### Development Workflow

1. **Fork the repository** on GitHub

2. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**

   - Write clean, readable code
   - Follow existing code style
   - Add tests for new features
   - Update documentation as needed

4. **Test your changes**

   ```bash
   pnpm test
   pnpm build
   ```

5. **Commit your changes**

   ```bash
   git add .
   git commit -m "Description of your changes"
   ```

6. **Push to your fork**

   ```bash
   git push origin feature/your-feature-name
   ```

7. **Open a Pull Request** on GitHub

### Code Style

- Use TypeScript for type safety
- Follow existing naming conventions
- Write meaningful commit messages
- Keep functions focused and small
- Comment complex logic

### Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @cordbot/bot test
pnpm --filter @cordbot/web-service test
```

### Areas for Contribution

- New Discord API integrations
- Additional OAuth service integrations
- Memory system improvements
- Documentation and examples
- Bug fixes and performance improvements

## Security

Cordbot runs with full system access to provide Claude's complete capabilities. Only use in trusted environments with controlled Discord access. Never share authentication tokens or commit `.env` files to version control.

## License

MIT - See [LICENSE](LICENSE) for details

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/cordbot/issues)
- **Documentation**: [cordbot.io](https://cordbot.io)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/cordbot/discussions)
