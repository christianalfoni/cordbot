import { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { createTool as createListJobs } from './cron/list_jobs.js';
import { createTool as createAddJob } from './cron/add_job.js';
import { createTool as createRemoveJob } from './cron/remove_job.js';
import { createTool as createUpdateJob } from './cron/update_job.js';
import { createTool as createShareFile } from './share_file.js';

/**
 * Load built-in tools that don't require authentication
 * These tools are always available regardless of manifest configuration
 */
export function loadBuiltinTools(
  getCurrentWorkingDir: () => string,
  getCurrentChannelId: () => string,
  queueFileForSharing: (filePath: string) => void,
  getCurrentChannel?: () => any
): SdkMcpToolDefinition<any>[] {
  const tools: SdkMcpToolDefinition<any>[] = [];

  // Load cron management tools (now using centralized storage via channel ID)
  tools.push(createListJobs(getCurrentChannelId));
  tools.push(createAddJob(getCurrentChannelId, getCurrentChannel));
  tools.push(createRemoveJob(getCurrentChannelId));
  tools.push(createUpdateJob(getCurrentChannelId));

  // Load file sharing tool
  tools.push(createShareFile(getCurrentWorkingDir, queueFileForSharing));

  console.log(`  ✓ Loaded ${tools.length} built-in tools`);

  return tools;
}
