#!/bin/bash

# Deploy script for Cordbot on Fly.io
# Ensures only one machine is running (required for SQLite database)
# Uses app name from fly.toml

set -e

echo "🚀 Deploying Cordbot to Fly.io..."
echo "   Using single machine mode (--ha=false)"
echo "   Using --no-cache to ensure latest package versions"
echo ""

# Get app name from fly.toml
APP_NAME=$(grep '^app = ' fly.toml | cut -d'"' -f2)

if [ -z "$APP_NAME" ]; then
  echo "❌ Error: Could not find app name in fly.toml"
  exit 1
fi

echo "   App name: $APP_NAME"
echo ""

# Destroy existing machines first
echo "🗑️  Removing existing machines..."
MACHINES=$(fly machines list -a "$APP_NAME" -q 2>/dev/null || echo "")
if [ -n "$MACHINES" ]; then
  for MACHINE_ID in $MACHINES; do
    echo "   Destroying machine: $MACHINE_ID"
    fly machine destroy "$MACHINE_ID" -a "$APP_NAME" --force
  done
else
  echo "   No existing machines found"
fi

echo ""

# Deploy with --ha=false to ensure only one machine is created
# Use --no-cache to force pulling latest npm packages
fly deploy --ha=false --no-cache

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Current machine status:"
fly machines list -a "$APP_NAME"
