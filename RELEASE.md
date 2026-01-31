# Release Process

This document describes the release process for Cordbot.

## Overview

When you publish a new version of the `@cordbot/agent` NPM package, you also need to build and publish a Docker image with the same version tag.

## Prerequisites

1. **Docker installed** and running locally
2. **Docker Hub account** (https://hub.docker.com)
3. **Logged in to Docker Hub**:
   ```bash
   docker login registry-1.docker.io
   ```

## Release Steps

### 1. Update Version

Update the version in `packages/bot/package.json`:

```bash
cd packages/bot
npm version patch  # or minor, or major
```

This will:
- Update the version in `package.json`
- Create a git commit
- Create a git tag

### 2. Publish to NPM

```bash
npm publish
```

Make sure the package is published successfully before building the Docker image.

### 3. Build and Push Docker Image

From the root of the repository, run the deployment script:

```bash
./deploy-docker-image.sh
```

The script will:
1. Extract the version from `packages/bot/package.json`
2. Confirm the release with you
3. Build the Docker image with the version as a build argument
4. Tag the image with both the version and `latest`
5. Push both tags to Docker Hub

**Example output:**
```
🚀 Cordbot Release Script

📦 Current version: 1.4.2

This will:
  1. Build Docker image with version 1.4.2
  2. Tag as: christianalfoni/cordbot-agent:1.4.2
  3. Tag as: christianalfoni/cordbot-agent:latest
  4. Push to Docker Hub

Continue? (y/N): y

🔐 Checking Docker login...
🔨 Building Docker image...
✓ Docker image built successfully

📤 Pushing to Docker Hub...
  Pushing christianalfoni/cordbot-agent:1.4.2...
  Pushing christianalfoni/cordbot-agent:latest...

✓ Release 1.4.2 published successfully!
```

### 4. Verify Release

Check that the images are available on Docker Hub:
- https://hub.docker.com/r/christianalfoni/cordbot-agent

### 5. Create GitHub Release (Optional)

Create a GitHub release to document the changes:

1. Go to GitHub → Releases → "Draft a new release"
2. Create a new tag (e.g., `v1.4.2`)
3. Title: "v1.4.2"
4. Description: Describe the changes
5. Click "Publish release"

## Docker Image

The Docker image is published to:
- **Registry**: `registry-1.docker.io`
- **Repository**: `christianalfoni/cordbot-agent`
- **Tags**:
  - Version-specific (e.g., `1.4.2`)
  - `latest` (always points to the most recent version)

### Using the Docker Image

Pull the image:
```bash
docker pull christianalfoni/cordbot-agent:latest
# or specific version
docker pull christianalfoni/cordbot-agent:1.4.2
```

Run the image:
```bash
docker run -d \
  -e DISCORD_BOT_TOKEN=your-token \
  -e DISCORD_GUILD_ID=your-guild-id \
  -e ANTHROPIC_API_KEY=your-api-key \
  -v ./workspace:/workspace \
  christianalfoni/cordbot-agent:latest
```

## Troubleshooting

### Docker build fails

1. Make sure `@cordbot/agent@{version}` is published to NPM first
2. Check that Docker is running: `docker info`
3. Verify you're logged in: `docker login registry-1.docker.io`

### Docker push fails

1. Make sure you're logged in to Docker Hub
2. Verify you have push permissions for the `christianalfoni/cordbot-agent` repository
3. Check your Docker Hub access token is valid

### Version mismatch

The script extracts the version from `packages/bot/package.json`. Make sure:
- You've run `npm version` to update the version
- You've published the NPM package before building the Docker image
- The version is a valid semver (e.g., `1.4.2`)

## Fly.io Hosted Bots

The Docker image is used by the Fly.io hosting service for managed bots. When users provision a hosted bot, it uses the image specified in `packages/functions/src/fly-hosting.ts`:

```typescript
const DEFAULT_IMAGE = "registry-1.docker.io/christianalfoni/cordbot-agent";
const DEFAULT_VERSION = "latest";
```

Users can deploy specific versions by updating the version in their hosted bot configuration.
