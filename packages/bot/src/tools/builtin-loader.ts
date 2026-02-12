import { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { createTool as createAddOneTimeSchedule } from './scheduling/add_one_time_schedule.js';
import { createTool as createAddRecurringSchedule } from './scheduling/add_recurring_schedule.js';
import { createTool as createListSchedules } from './scheduling/list_schedules.js';
import { createTool as createRemoveSchedule } from './scheduling/remove_schedule.js';
import { createTool as createShareFile } from './share_file.js';
import { createTool as createGenerateDocx } from './document/generate_docx.js';
import { createTool as createShareLink } from './document/create_share_link.js';
import type { IDocumentConverter } from '../interfaces/document.js';
import type { IFileShareManager } from '../interfaces/file-sharing.js';

/**
 * Load built-in tools that don't require authentication
 * These tools are always available regardless of manifest configuration
 */
export function loadBuiltinTools(
  getCurrentChannelId: () => string,
  queueFileForSharing: (filePath: string) => void,
  getCurrentChannel: (() => any) | undefined,
  getWorkspaceRoot: () => string,
  getCordbotWorkingDir: () => string,
  documentConverter: IDocumentConverter,
  fileShareManager: IFileShareManager,
  baseUrl: string
): SdkMcpToolDefinition<any>[] {
  const tools: SdkMcpToolDefinition<any>[] = [];

  // Load V2 scheduling tools (uses cron_v2.yaml file in workspace root for configuration)
  tools.push(createAddOneTimeSchedule(getCurrentChannelId, getCurrentChannel, getWorkspaceRoot));
  tools.push(createAddRecurringSchedule(getCurrentChannelId, getWorkspaceRoot));
  tools.push(createListSchedules(getCurrentChannelId, getWorkspaceRoot));
  tools.push(createRemoveSchedule(getCurrentChannelId, getWorkspaceRoot));

  // Load file sharing tool (uses cordbot working directory for file operations)
  tools.push(createShareFile(getCordbotWorkingDir, queueFileForSharing));

  // Load document tools (docx generation and file sharing links)
  tools.push(
    createGenerateDocx(
      getCordbotWorkingDir,
      queueFileForSharing,
      (markdown: string, filename: string) => documentConverter.convertMarkdownToDocx(markdown, filename)
    )
  );

  tools.push(
    createShareLink(
      getCordbotWorkingDir,
      getCurrentChannelId,
      (filePath: string, channelId: string) => fileShareManager.createShareToken(filePath, channelId),
      () => baseUrl
    )
  );

  console.log(`  ✓ Loaded ${tools.length} built-in tools`);

  return tools;
}
