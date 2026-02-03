import { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { ThreadChannel, TextChannel } from 'discord.js';
import { ToolManifest, ToolContext } from '../service/types.js';
import { TokenManager } from '../service/token-manager.js';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadDynamicTools(
  manifest: ToolManifest,
  tokenManager: TokenManager,
  getCurrentChannel: () => ThreadChannel | TextChannel | null,
  permissionManager: any
): Promise<SdkMcpToolDefinition<any>[]> {
  const tools: SdkMcpToolDefinition<any>[] = [];

  // Create tool context with ALL tokens - tools will request what they need
  const toolContext: ToolContext = {
    getToken: (category: string) => tokenManager.getToken(category),
    requestPermission: async (message: string) => {
      const channel = getCurrentChannel();
      if (!channel) {
        throw new Error('No Discord channel context available for permission request');
      }
      const requestId = nanoid();
      await permissionManager.requestPermission(channel, message, requestId);
    }
  };

  // Check if there are any tools configured
  if (!manifest.toolsConfig || Object.keys(manifest.toolsConfig).length === 0) {
    console.log('  ℹ️  No tools enabled in manifest');
    return tools;
  }

  const toolsDir = __dirname;

  // Iterate over each domain (e.g., gmail, calendar, etc.)
  for (const [domain, toolNames] of Object.entries(manifest.toolsConfig)) {
    await loadDomainTools(domain, toolNames, toolsDir, toolContext, tools);
  }

  return tools;
}

async function loadDomainTools(
  domain: string,
  toolNames: string[],
  toolsDir: string,
  toolContext: ToolContext,
  tools: SdkMcpToolDefinition<any>[]
): Promise<void> {
  const domainDir = path.join(toolsDir, domain);

  // Check if domain folder exists
  if (!fs.existsSync(domainDir) || !fs.statSync(domainDir).isDirectory()) {
    console.warn(`  ⚠️  Domain folder not found: ${domain}`);
    return;
  }

  // Load each tool in this domain
  for (const toolName of toolNames) {
    const toolId = `${domain}_${toolName}`;

    // Look for .ts or .js file
    const possibleFiles = [
      path.join(domainDir, `${toolName}.ts`),
      path.join(domainDir, `${toolName}.js`)
    ];

    const toolFile = possibleFiles.find(f => fs.existsSync(f));

    if (!toolFile) {
      console.warn(`  ⚠️  Tool file not found: ${domain}/${toolName}`);
      continue;
    }

    try {
      // Dynamically import the tool module
      const toolModule = await import(toolFile);

      // Look for the createTool export (or other common patterns)
      const createFn = toolModule.createTool ||
                       toolModule[`create${toCamelCase(toolId)}Tool`] ||
                       toolModule.default;

      if (typeof createFn !== 'function') {
        console.warn(`  ⚠️  Tool ${toolId}: No createTool export found`);
        continue;
      }

      // Create the tool with the context (all tokens available)
      const tool = createFn(toolContext);
      tools.push(tool);
      console.log(`  ✓ Loaded tool: ${toolId}`);
    } catch (error) {
      console.error(`  ✗ Failed to load tool ${toolId}:`, error);
    }
  }
}

/**
 * Convert snake_case to CamelCase
 * gmail_send_email -> GmailSendEmail
 */
function toCamelCase(str: string): string {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
