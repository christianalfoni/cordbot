FROM node:20

# Install additional tools that might be needed
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code@2.1.23

# Install cordbot package - using latest version
RUN npm install -g @cordbot/agent@1.4.1

# Create workspace directory for persistent storage
# Use the existing 'node' user from the base image (already UID 1000)
RUN mkdir -p /workspace && chown node:node /workspace

# Switch to non-root user (Claude CLI requires this for --dangerously-skip-permissions)
USER node

# Set working directory to the volume mount point
# The volume will be mounted here, making it persistent
WORKDIR /workspace

# Run cordbot (will use /data as its workspace)
CMD ["cordbot"]
