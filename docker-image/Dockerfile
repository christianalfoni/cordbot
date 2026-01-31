FROM node:20-slim

# Install additional tools that might be needed
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

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
