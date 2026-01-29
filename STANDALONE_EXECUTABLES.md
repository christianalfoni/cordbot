# Standalone Executables Setup

This document explains how to build and distribute Cordbot as standalone executables that don't require Node.js installation.

## Overview

Cordbot uses Bun's compile feature to bundle the application into standalone executables. Bun has native ESM support and produces smaller, faster binaries compared to other tools.

## Building Binaries

### Prerequisites

1. Install Bun (if not already installed):
```bash
curl -fsSL https://bun.sh/install | bash
```

2. Install dependencies:
```bash
cd packages/bot
npm install
```

### Build Commands

```bash
# Build TypeScript and create binaries for all platforms
npm run build:binaries:all

# Or build for specific platforms
npm run build:binaries:linux    # Linux x64 only
npm run build:binaries:macos    # Both macOS architectures
npm run build:binaries:windows  # Windows x64 only
```

This will create executables in `packages/bot/dist/binaries/`:
- `cordbot-linux-x64` (105 MB) - Linux x64
- `cordbot-macos-x64` (69 MB) - macOS Intel
- `cordbot-macos-arm64` (63 MB) - macOS Apple Silicon
- `cordbot-win-x64.exe` (119 MB) - Windows x64

## Configuration

The build scripts in `package.json`:

```json
{
  "scripts": {
    "build:binaries:all": "npm run build && npm run build:binaries:linux && npm run build:binaries:macos && npm run build:binaries:windows",
    "build:binaries:linux": "bun build ./src/cli.ts --compile --target=bun-linux-x64 --minify --sourcemap --outfile dist/binaries/cordbot-linux-x64",
    "build:binaries:macos": "bun build ./src/cli.ts --compile --target=bun-darwin-arm64 --minify --sourcemap --outfile dist/binaries/cordbot-macos-arm64 && bun build ./src/cli.ts --compile --target=bun-darwin-x64 --minify --sourcemap --outfile dist/binaries/cordbot-macos-x64",
    "build:binaries:windows": "bun build ./src/cli.ts --compile --target=bun-windows-x64 --minify --sourcemap --outfile dist/binaries/cordbot-win-x64.exe"
  }
}
```

Bun's `--compile` flag bundles the application with Bun's runtime, creating a true standalone executable with native ESM support.

## Environment Variables Support

The agent now supports reading configuration from environment variables, making it cloud-deployment ready:

**Required environment variables:**
- `DISCORD_BOT_TOKEN` - Your Discord bot token
- `DISCORD_GUILD_ID` - Your Discord server ID
- `ANTHROPIC_API_KEY` - Your Claude API key

**Optional environment variables:**
- `LOG_LEVEL` - Logging level (default: `info`)
- `ARCHIVE_AFTER_DAYS` - Days before archiving inactive sessions (default: `30`)

### Cloud Deployment

Set environment variables and run the binary:

```bash
export DISCORD_BOT_TOKEN="your-token"
export DISCORD_GUILD_ID="your-guild-id"
export ANTHROPIC_API_KEY="your-api-key"

./cordbot-linux-x64
```

Or use a `.env` file - the agent will check environment variables first, then fall back to `.env` file.

## Installation Script

Users can install Cordbot without Node.js using:

```bash
curl -fsSL https://cordbot.io/install.sh | bash
```

The install script (`install.sh`):
1. Detects OS and architecture
2. Downloads the appropriate binary from GitHub releases
3. Installs to `~/.cordbot/bin/`
4. Adds to PATH in shell RC file
5. Provides setup instructions

## Automated Releases

The GitHub Actions workflow `.github/workflows/release-binaries.yml` automatically:
1. Builds binaries for all platforms on each release
2. Attaches them to the GitHub release
3. Can be manually triggered via workflow_dispatch

## File Size

Each binary ranges from 63-119 MB because it includes:
- Bun runtime (smaller and faster than Node.js)
- Application code
- All dependencies
- Template files

Bun produces smaller binaries compared to pkg and other bundlers, particularly for macOS builds.

## Distribution

Binaries can be distributed via:
1. **GitHub Releases** - Automatic via GitHub Actions
2. **Direct download** - Host on CDN/S3 for install script
3. **Package managers** - Can be added to Homebrew, apt, etc.

## Advantages & Limitations

**Advantages:**
- No Node.js installation required
- Single executable file - simple distribution
- Native ESM support via Bun
- Faster startup than Node.js
- Smaller binaries than pkg

**Limitations:**
- Larger file size than npm package
- Must rebuild for each platform
- Updates require new binary downloads
- Requires Bun installed for building (not for end users)

## Development vs Production

- **Development:** Use `npm run dev` or `npx @cordbot/agent`
- **Production/End Users:** Use standalone executables via install script

## Updating Install Script URL

After releasing, update the install script with your actual GitHub repository:

1. Edit `install.sh` line 7:
   ```bash
   REPO="yourusername/cordbot"  # Change this
   ```

2. Host the install script at `https://cordbot.io/install.sh`

3. Users can then install with:
   ```bash
   curl -fsSL https://cordbot.io/install.sh | bash
   ```
