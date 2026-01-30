#!/bin/bash
set -e

# Configuration
IMAGE_NAME="christianalfoni/cordbot-agent"
DOCKERFILE_DIR="packages/bot/templates/fly"

# Get version from argument or default to "latest"
VERSION="${1:-latest}"

echo "🐳 Building Docker image: ${IMAGE_NAME}:${VERSION}"
echo "📁 Dockerfile directory: ${DOCKERFILE_DIR}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
fi

# Check if logged in to Docker Hub
if ! docker info | grep -q "Username"; then
  echo "⚠️  Not logged in to Docker Hub. Run 'docker login' first."
  read -p "Do you want to login now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker login
  else
    exit 1
  fi
fi

# Build for linux/amd64 platform (required for Fly.io)
echo "🔨 Building image for linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  -t "${IMAGE_NAME}:${VERSION}" \
  --push \
  "${DOCKERFILE_DIR}"

echo ""
echo "✅ Successfully built and pushed: ${IMAGE_NAME}:${VERSION}"
echo ""
echo "To use this version, update fly-hosting.ts:"
echo "  const DEFAULT_VERSION = \"${VERSION}\";"
