# Fly.io Volume Setup for Cordbot

This guide explains how to set up persistent storage for your Cordbot on Fly.io.

## Why You Need a Volume

Cordbot creates working directories for each Discord channel to store:
- CLAUDE.md configuration files
- Cron job definitions (.claude-cron)
- Session files and conversation context
- Any files created or shared by Claude

Without a persistent volume, these files are lost when the container restarts (deployments, crashes, scaling).

## Setup Steps

### 1. Create the Volume

Before deploying for the first time, create a persistent volume:

```bash
# Create a 1GB volume in your primary region
fly volumes create cordbot_data --size 1 --region sjc

# Or create in a different region
fly volumes create cordbot_data --size 1 --region iad
```

**Volume size considerations:**
- Start with 1GB (costs ~$0.15/month)
- Monitor usage with `fly volumes list`
- Expand if needed with `fly volumes extend cordbot_data --size 2`

### 2. Verify Configuration

Make sure your `fly.toml` has the volume mount (already configured in template):

```toml
[env]
  DATA_DIR = "/data"

[mounts]
  source = "cordbot_data"
  destination = "/data"
```

### 3. Deploy

```bash
# Deploy the app
fly deploy

# Check logs
fly logs
```

### 4. Verify Volume is Mounted

After deployment, check that the volume is working:

```bash
# SSH into the machine
fly ssh console

# Check mount
df -h | grep /data

# Check if files are being created
ls -la /data

# You should see channel folders: general, other-channel, etc.
```

## How It Works

### Without Volume (Default)
```
Container starts → Creates /app/general → Bot works
Container restarts → /app/general GONE → Bot fails ❌
```

### With Volume (Configured)
```
Container starts → Mounts /data → Creates /data/general → Bot works
Container restarts → Mounts /data → /data/general still exists → Bot works ✅
```

### Directory Structure on Volume

```
/data/
├── .claude/
│   ├── storage/          # Session database
│   ├── sessions/         # Session metadata
│   └── config.json       # Bot configuration
├── CLAUDE.md            # Root configuration
├── general/             # Channel: #general
│   ├── CLAUDE.md
│   ├── .claude-cron
│   └── .claude/
│       └── skills/
├── dev-chat/            # Channel: #dev-chat
│   ├── CLAUDE.md
│   └── .claude-cron
└── ...
```

## Volume Management

### Check Volume Status

```bash
# List volumes
fly volumes list

# Show volume details
fly volumes show cordbot_data
```

### Expand Volume

If you run out of space:

```bash
# Expand to 2GB (you cannot shrink volumes)
fly volumes extend cordbot_data --size 2
```

### Backup Volume (Manual)

```bash
# SSH into machine
fly ssh console

# Create a tar backup
cd /data
tar -czf /tmp/backup.tar.gz .

# Exit and copy to local
fly ssh sftp get /tmp/backup.tar.gz ./cordbot-backup.tar.gz
```

### Delete Volume

⚠️ **Warning:** This will delete all your data!

```bash
# Stop the app first
fly scale count 0

# Delete volume
fly volumes delete cordbot_data

# Scale back up
fly scale count 1
```

## Troubleshooting

### Error: "Working directory does not exist"

This means the volume is not mounted. Check:

1. **Volume exists:**
   ```bash
   fly volumes list
   ```

2. **Volume is configured in fly.toml:**
   ```toml
   [mounts]
     source = "cordbot_data"
     destination = "/data"
   ```

3. **Volume is in the same region as your app:**
   ```bash
   fly status
   fly volumes list
   ```

   If regions don't match, create volume in correct region.

### Error: "Cannot mount volume"

This can happen if:
- Volume doesn't exist (create it first)
- Volume name mismatch (check `fly.toml` matches volume name)
- Region mismatch (volume must be in same region as app)

### Volume Not Persisting

If files still disappear after restart:
1. Verify volume is mounted: `df -h | grep /data` in SSH
2. Check DATA_DIR is set: `echo $DATA_DIR` should show `/data`
3. Check bot logs for working directory path

## Costs

Fly.io volume pricing (as of 2026):
- **$0.15 per GB per month**
- 1GB volume = ~$0.15/month
- 10GB volume = ~$1.50/month

Volumes are billed per GB-month, pro-rated to the second.

## Migration from Ephemeral to Persistent

If you already have a running bot without volumes:

1. Create volume: `fly volumes create cordbot_data --size 1`
2. Deploy updated configuration: `fly deploy`
3. Channels will re-sync and recreate their folders on the volume
4. Old ephemeral data will be lost (expected)

## Best Practices

1. **Regular backups**: SSH in and copy important files
2. **Monitor space**: Check `fly volumes list` periodically
3. **Start small**: Begin with 1GB, expand if needed
4. **One volume per app**: Each fly app needs its own volume
5. **Same region**: Always create volume in same region as app

## Further Reading

- [Fly.io Volumes Documentation](https://fly.io/docs/reference/volumes/)
- [Fly.io Pricing](https://fly.io/docs/about/pricing/)
- [Fly.io Regions](https://fly.io/docs/reference/regions/)
