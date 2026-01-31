# Cordbot Docker Image

This directory contains the Dockerfile and related files for building the production Cordbot Docker image.

## What's Here

- **Dockerfile**: Production Dockerfile that installs the `@cordbot/agent` NPM package
- **.dockerignore**: Files to exclude from the Docker build context

## Building the Image

The image is built automatically when you run the deployment script from the root:

```bash
./deploy-docker-image.sh
```

This script:
1. Reads the version from `packages/bot/package.json`
2. Builds the Docker image with that version
3. Tags it with both the version and `latest`
4. Pushes to Docker Hub

## Manual Build

You can also build the image manually:

```bash
# Build with a specific version
docker build \
  --build-arg CORDBOT_VERSION=1.4.2 \
  -t christianalfoni/cordbot-agent:1.4.2 \
  .

# Build with latest
docker build \
  --build-arg CORDBOT_VERSION=latest \
  -t christianalfoni/cordbot-agent:latest \
  .
```

## Image Details

- **Base**: `node:20-slim`
- **Package**: Installs `@cordbot/agent` from NPM
- **User**: Runs as non-root `node` user
- **Working Directory**: `/workspace` (mount your data here)
- **Command**: Runs `cordbot`

## Usage

```bash
docker run -d \
  -e DISCORD_BOT_TOKEN=your-token \
  -e DISCORD_GUILD_ID=your-guild-id \
  -e ANTHROPIC_API_KEY=your-api-key \
  -v ./workspace:/workspace \
  christianalfoni/cordbot-agent:latest
```

## Fly.io Integration

This image is used by the Fly.io hosting service for managed bots. The image reference is configured in `packages/functions/src/fly-hosting.ts`.
