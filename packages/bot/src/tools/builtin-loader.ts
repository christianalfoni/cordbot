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
  queueFileForSharing: (filePath: string) => void
): SdkMcpToolDefinition<any>[] {
  const tools: SdkMcpToolDefinition<any>[] = [];

  // Load cron management tools
  tools.push(createListJobs(getCurrentWorkingDir));
  tools.push(createAddJob(getCurrentWorkingDir));
  tools.push(createRemoveJob(getCurrentWorkingDir));
  tools.push(createUpdateJob(getCurrentWorkingDir));

  // Load file sharing tool
  tools.push(createShareFile(getCurrentWorkingDir, queueFileForSharing));

  console.log(`  ✓ Loaded ${tools.length} built-in tools`);

  return tools;
}
