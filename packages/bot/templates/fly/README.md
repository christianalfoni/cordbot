# Deploy Cordbot to Fly.io

This directory contains templates for deploying Cordbot to Fly.io.

## Prerequisites

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
- Fly.io account

## Initial Setup

1. **Create a new app on Fly.io:**
   ```bash
   fly launch --ha=false --no-deploy
   ```

2. **Set required secrets:**
   ```bash
   fly secrets set DISCORD_BOT_TOKEN="your-discord-bot-token"
   fly secrets set DISCORD_GUILD_ID="your-discord-guild-id"
   fly secrets set ANTHROPIC_API_KEY="your-anthropic-api-key"
   ```

3. **Deploy using the deploy script:**
   ```bash
   ./deploy.sh your-app-name
   ```

   Or deploy manually:
   ```bash
   fly deploy --ha=false -a your-app-name
   ```

## Why --ha=false?

Cordbot uses a SQLite database that is machine-local. To avoid data inconsistency and duplicate bot responses, **only one machine should run at a time**.

The `--ha=false` flag tells Fly.io to create only one machine instead of the default two machines for high availability.

## Deployment

### Using the deploy script (recommended)

```bash
./deploy.sh your-app-name
```

### Manual deployment

```bash
fly deploy --ha=false -a your-app-name
```

## Monitoring

Check machine status:
```bash
fly machines list -a your-app-name
```

View logs:
```bash
fly logs -a your-app-name
```

Check app status:
```bash
fly status -a your-app-name
```

## Troubleshooting

### Multiple machines created

If you accidentally created multiple machines:

```bash
# List machines
fly machines list -a your-app-name

# Destroy extra machines (keep only one)
fly machine destroy MACHINE_ID -a your-app-name --force
```

### Health check failing

The bot exposes a health check endpoint on port 8080. Check the logs to see why it's failing:

```bash
fly logs -a your-app-name
```

Common issues:
- Discord bot token is invalid
- Missing environment variables
- Network connectivity issues

## Configuration

Edit `fly.toml` to configure:

- **Memory**: Currently set to 1GB (required for Claude SDK)
- **Region**: Change `primary_region` to your preferred region
- **Health checks**: Adjust grace period and intervals if needed

## Resources

- [Fly.io Documentation](https://fly.io/docs/)
- [App Availability and Resiliency](https://fly.io/docs/apps/app-availability/)
- [Troubleshoot apps when a host is unavailable](https://fly.io/docs/apps/trouble-host-unavailable/)
