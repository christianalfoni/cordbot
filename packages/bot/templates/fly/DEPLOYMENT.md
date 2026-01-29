# Deployment Guide

## Fly.io Deployment

This guide explains how to deploy cordbot as a persistent Discord bot on Fly.io.

### Generating This Template

If you haven't already generated these files, run:

```bash
npx @cordbot/agent --template=fly
```

This will create:
- `Dockerfile` - Container configuration
- `fly.toml` - Fly.io app configuration
- `DEPLOYMENT.md` - This guide
- `.dockerignore` - Files to exclude from Docker build

### Prerequisites

1. Install the Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
2. Create a Fly.io account and authenticate: `fly auth login`
3. Have your Discord bot credentials ready:
   - Discord Bot Token
   - Discord Guild (Server) ID
   - Anthropic API Key

### Required Environment Variables

- `DISCORD_BOT_TOKEN` - Your Discord bot token from the Discord Developer Portal
- `DISCORD_GUILD_ID` - Your Discord server (guild) ID
- `ANTHROPIC_API_KEY` - Your Claude API key (must start with `sk-ant-`)

### Optional Environment Variables

- `ARCHIVE_AFTER_DAYS` - Days before archiving inactive sessions (default: 30)
- `LOG_LEVEL` - Logging level: `info`, `debug`, `warn`, `error` (default: `info`)
- `HEALTH_PORT` - Health check server port (default: 8080)
- `WEB_SERVICE_URL` - Web service URL (default: `https://cordbot.io`)
- `SERVICE_URL` - Backend service URL (default: `https://us-central1-claudebot-34c42.cloudfunctions.net`)

### Deployment Steps

#### 1. Initialize Fly.io App

```bash
# Launch without deploying (to configure first)
fly launch --no-deploy

# Follow prompts to select region and configure app
# This will create a fly.toml file if you don't have one
```

#### 2. Set Environment Variables

Set the required secrets (sensitive data):

```bash
# Set Discord bot token
fly secrets set DISCORD_BOT_TOKEN=your_discord_token_here

# Set Discord guild ID
fly secrets set DISCORD_GUILD_ID=your_guild_id_here

# Set Anthropic API key
fly secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Optional: Set other configuration:

```bash
# Set custom archive days
fly secrets set ARCHIVE_AFTER_DAYS=60

# Set log level
fly secrets set LOG_LEVEL=debug
```

#### 3. Deploy

```bash
# Deploy the app
fly deploy

# Monitor the deployment
fly logs
```

#### 4. Verify Deployment

Check the bot status:

```bash
# View logs
fly logs

# Check app status
fly status

# Check health endpoint
curl https://cordbot-agent-old-pine-2010.fly.dev/health

# SSH into the machine (if needed)
fly ssh console
```

The health endpoint returns bot status including:
- Discord connection status
- Active session count
- Uptime information

### Managing the Bot

#### View Logs

```bash
# Tail logs in real-time
fly logs

# Filter by level
fly logs --level error
```

#### Restart the Bot

```bash
# Restart the app
fly apps restart cordbot-agent
```

#### Scale Resources

```bash
# Scale memory
fly scale memory 1024

# Scale VM count (for redundancy)
fly scale count 2
```

#### Update Environment Variables

```bash
# Update a secret
fly secrets set ARCHIVE_AFTER_DAYS=90

# List all secrets (values hidden)
fly secrets list

# Remove a secret
fly secrets unset SECRET_NAME
```

### Troubleshooting

#### Bot Not Starting

1. Check logs for errors: `fly logs`
2. Verify all required secrets are set: `fly secrets list`
3. Check if Discord token is valid
4. Verify Anthropic API key format (must start with `sk-ant-`)

#### Connection Issues

1. Verify Discord bot has proper permissions in your server
2. Check Discord Guild ID matches your server
3. Ensure bot token hasn't expired or been regenerated

### Useful Commands

```bash
# Open Fly.io dashboard
fly open

# View app info
fly info

# List all apps
fly apps list

# Destroy app (careful!)
fly apps destroy cordbot-agent
```

### Cost Optimization

- The default configuration uses minimal resources (512MB RAM, shared CPU)
- Fly.io includes free allowances that may cover a single bot instance
- Monitor usage: https://fly.io/dashboard/personal/billing
- Scale down when not needed: `fly scale count 0` (stops all machines)

### Updating the Bot

The bot uses `npx @cordbot/agent` which automatically fetches the latest published version on container restart.

To update to the latest version:

```bash
# Option 1: Restart the app (npx will fetch latest version)
fly apps restart cordbot-agent

# Option 2: Redeploy (rebuilds container and fetches latest)
fly deploy

# Watch logs to verify update
fly logs
```

Note: The Dockerfile uses `npx @cordbot/agent`, so each deployment or restart will automatically use the latest published version from npm.

### Data Storage

The bot stores session data in the `.claude/storage/` directory using JSON files. This data is ephemeral on Fly.io by default. If you need persistent session data across deployments, you can mount a volume at `/app/.claude`:

```bash
# Optional: Create volume for persistent session data
fly volumes create cordbot_sessions --size 1

# Add to fly.toml:
[mounts]
  source = "cordbot_sessions"
  destination = "/app/.claude"
```

Note: For most use cases, ephemeral storage is sufficient as sessions can be recreated.

## Alternative: Local Development

To run the bot locally:

```bash
# Run directly with npx (simplest option)
npx @cordbot/agent

# The bot will:
# 1. Guide you through Discord authentication via cordbot.io
# 2. Prompt for your Anthropic API key
# 3. Create a .env file with your configuration
# 4. Start the bot

# On subsequent runs, it will use the saved .env configuration
```

## Getting Help

- Fly.io Documentation: https://fly.io/docs/
- Discord.js Guide: https://discordjs.guide/
- Anthropic API Docs: https://docs.anthropic.com/
- Cordbot Issues: https://github.com/yourusername/cordbot/issues
