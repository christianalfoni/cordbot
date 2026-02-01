import os from 'os';
import path from 'path';
import fs from 'fs';

/**
 * Get the path to the cron file for a channel
 * Uses centralized storage: ~/.claude/channels/{channelId}/cron.yaml
 */
export function getCronFilePath(channelId: string): string {
  const homeDir = os.homedir(); // /workspace (set via ENV HOME=/workspace)
  const cronPath = path.join(homeDir, '.claude', 'channels', channelId, 'cron.yaml');

  // Ensure directory exists
  const cronDir = path.dirname(cronPath);
  if (!fs.existsSync(cronDir)) {
    fs.mkdirSync(cronDir, { recursive: true });
  }

  return cronPath;
}
