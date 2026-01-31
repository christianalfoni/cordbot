#!/bin/bash
set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="${SCRIPT_DIR}/docker-image"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Cordbot Docker Image Deployment${NC}\n"

# Check if docker-image directory exists
if [ ! -d "${DOCKER_DIR}" ]; then
    echo -e "${RED}❌ docker-image directory not found${NC}"
    exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./packages/bot/package.json').version")
echo -e "${CYAN}📦 Current version: ${GREEN}${VERSION}${NC}\n"

# Docker image details
REGISTRY="registry-1.docker.io"
IMAGE_NAME="christianalfoni/cordbot-agent"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}"

# Confirm deployment
echo -e "${YELLOW}This will:${NC}"
echo -e "  1. Build Docker image from docker-image/ with version ${VERSION}"
echo -e "  2. Tag as: ${IMAGE_NAME}:${VERSION}"
echo -e "  3. Tag as: ${IMAGE_NAME}:latest"
echo -e "  4. Push to Docker Hub\n"

read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Deployment cancelled${NC}"
    exit 1
fi

# Check if logged in to Docker
echo -e "\n${CYAN}🔐 Checking Docker login...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    exit 1
fi

# Try to verify Docker Hub access
if ! docker pull ${FULL_IMAGE}:latest > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Could not pull existing image (this is OK for first deployment)${NC}"
    echo -e "${YELLOW}📝 Make sure you're logged in to Docker Hub:${NC}"
    echo -e "   ${CYAN}docker login ${REGISTRY}${NC}\n"
    read -p "Are you logged in to Docker Hub? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Please login first: docker login ${REGISTRY}${NC}"
        exit 1
    fi
fi

# Build Docker image from docker-image directory
echo -e "\n${CYAN}🔨 Building Docker image from docker-image/...${NC}"
docker build \
    --build-arg CORDBOT_VERSION=${VERSION} \
    --platform linux/amd64,linux/arm64 \
    -t ${FULL_IMAGE}:${VERSION} \
    -t ${FULL_IMAGE}:latest \
    "${DOCKER_DIR}"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker image built successfully${NC}"

# Push to Docker Hub
echo -e "\n${CYAN}📤 Pushing to Docker Hub...${NC}"

echo -e "  Pushing ${IMAGE_NAME}:${VERSION}..."
docker push ${FULL_IMAGE}:${VERSION}

echo -e "  Pushing ${IMAGE_NAME}:latest..."
docker push ${FULL_IMAGE}:latest

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker push failed${NC}"
    exit 1
fi

# Success!
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Docker image ${VERSION} deployed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${CYAN}📦 Published images:${NC}"
echo -e "  • ${IMAGE_NAME}:${VERSION}"
echo -e "  • ${IMAGE_NAME}:latest\n"

echo -e "${CYAN}🔗 Docker Hub:${NC}"
echo -e "  https://hub.docker.com/r/${IMAGE_NAME}\n"
