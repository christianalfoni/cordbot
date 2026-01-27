import fs from 'fs';
import path from 'path';
import { TokenManager } from './token-manager.js';
import { getMCPServer } from './registry.js';
import chalk from 'chalk';

export interface MCPServerConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPConfig {
  version: string;
  servers: {
    [serverId: string]: {
      enabled: boolean;
      configured: boolean;
      lastUsed?: string;
    };
  };
}

export async function loadMCPServers(
  claudeDir: string
): Promise<Record<string, MCPServerConfig>> {
  const configPath = path.join(claudeDir, 'mcp-config.json');
  const tokenManager = new TokenManager(claudeDir);

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config: MCPConfig = JSON.parse(configContent);

    const mcpServers: Record<string, MCPServerConfig> = {};

    // Load enabled MCP servers
    for (const [serverId, serverStatus] of Object.entries(config.servers)) {
      if (!serverStatus.enabled || !serverStatus.configured) {
        continue;
      }

      const server = getMCPServer(serverId);
      if (!server) {
        console.log(chalk.yellow(`⚠️  Unknown MCP server: ${serverId}`));
        continue;
      }

      // Handle OAuth servers
      if (server.authType === 'oauth2') {
        const tokens = tokenManager.getTokens(serverId);
        if (!tokens) {
          console.log(
            chalk.yellow(
              `⚠️  No tokens found for ${server.name}. Skipping MCP server. Please reconfigure.`
            )
          );
          continue;
        }

        mcpServers[serverId] = {
          type: 'stdio',
          command: 'npx',
          args: ['-y', server.package],
          env: {
            [`${serverId.toUpperCase()}_ACCESS_TOKEN`]: tokens.access_token,
          },
        };

        console.log(chalk.green(`✓ Loaded ${server.name}`));
      } else {
        // Handle non-OAuth servers (future extensibility)
        mcpServers[serverId] = {
          type: 'stdio',
          command: 'npx',
          args: ['-y', server.package],
        };
        console.log(chalk.green(`✓ Loaded ${server.name}`));
      }
    }

    return mcpServers;
  } catch (error) {
    console.error(chalk.red('Failed to load MCP servers:'), error);
    return {};
  }
}
