import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { OAuthFlow } from './oauth.js';
import { TokenManager } from './token-manager.js';
import { getMCPServer, listMCPServers } from './registry.js';

export interface MCPServerStatus {
  enabled: boolean;
  configured: boolean;
  lastUsed?: string;
}

export interface MCPConfig {
  version: string;
  servers: {
    [serverId: string]: MCPServerStatus;
  };
}

export class MCPConfigManager {
  private configPath: string;
  private tokenManager: TokenManager;
  private oauthFlow: OAuthFlow;

  constructor(claudeDir: string) {
    this.configPath = path.join(claudeDir, 'mcp-config.json');
    this.tokenManager = new TokenManager(claudeDir);
    this.oauthFlow = new OAuthFlow(claudeDir);
  }

  private readConfig(): MCPConfig {
    if (!fs.existsSync(this.configPath)) {
      return {
        version: '1.0.0',
        servers: {},
      };
    }
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return {
        version: '1.0.0',
        servers: {},
      };
    }
  }

  private writeConfig(config: MCPConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  getServerStatus(serverId: string): MCPServerStatus {
    const config = this.readConfig();
    return (
      config.servers[serverId] || {
        enabled: false,
        configured: false,
      }
    );
  }

  setServerStatus(serverId: string, status: Partial<MCPServerStatus>): void {
    const config = this.readConfig();
    config.servers[serverId] = {
      ...this.getServerStatus(serverId),
      ...status,
    };
    this.writeConfig(config);
  }

  async showStartupMenu(): Promise<void> {
    const config = this.readConfig();
    const gmailStatus = this.getServerStatus('gmail');

    const choices = [
      {
        name: chalk.green('Continue without changes'),
        value: 'continue',
      },
    ];

    // Add Gmail configuration option
    if (!gmailStatus.configured) {
      choices.push({
        name: chalk.blue('Configure Gmail MCP Server'),
        value: 'configure-gmail',
      });
    } else if (!gmailStatus.enabled) {
      choices.push({
        name: chalk.blue('Enable Gmail MCP Server'),
        value: 'enable-gmail',
      });
    } else {
      choices.push({
        name: chalk.yellow('Disable Gmail MCP Server'),
        value: 'disable-gmail',
      });
      choices.push({
        name: chalk.blue('Reconfigure Gmail MCP Server'),
        value: 'configure-gmail',
      });
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'MCP Server Configuration:',
        choices,
        default: 'continue',
      },
    ]);

    switch (action) {
      case 'continue':
        return;
      case 'configure-gmail':
        await this.configureGmailServer();
        break;
      case 'enable-gmail':
        this.setServerStatus('gmail', { enabled: true });
        console.log(chalk.green('✓ Gmail MCP Server enabled'));
        break;
      case 'disable-gmail':
        this.setServerStatus('gmail', { enabled: false });
        console.log(chalk.yellow('Gmail MCP Server disabled'));
        break;
    }
  }

  async configureGmailServer(): Promise<void> {
    console.log(chalk.bold('\n📧 Gmail MCP Server Configuration\n'));
    console.log(
      'To use Gmail MCP Server, you need to create OAuth credentials in Google Cloud Console:'
    );
    console.log(
      chalk.dim('1. Go to https://console.cloud.google.com/apis/credentials')
    );
    console.log(
      chalk.dim('2. Create OAuth 2.0 Client ID (Application type: Desktop app)')
    );
    console.log(
      chalk.dim(`3. Add authorized redirect URI: http://localhost:3000/oauth/callback`)
    );
    console.log(chalk.dim('4. Download the credentials and copy the Client ID and Secret\n'));

    const { clientId, clientSecret } = await inquirer.prompt([
      {
        type: 'input',
        name: 'clientId',
        message: 'Enter Gmail OAuth Client ID:',
        validate: (input) => {
          if (!input.trim()) {
            return 'Client ID is required';
          }
          return true;
        },
      },
      {
        type: 'password',
        name: 'clientSecret',
        message: 'Enter Gmail OAuth Client Secret:',
        validate: (input) => {
          if (!input.trim()) {
            return 'Client Secret is required';
          }
          return true;
        },
      },
    ]);

    // Save credentials to .env
    const envPath = path.join(process.cwd(), '.env');
    await this.updateEnvFile(envPath, {
      GMAIL_MCP_CLIENT_ID: clientId.trim(),
      GMAIL_MCP_CLIENT_SECRET: clientSecret.trim(),
    });

    console.log(chalk.green('✓ Credentials saved to .env\n'));

    // Start OAuth flow
    console.log(chalk.bold('Starting OAuth authorization flow...\n'));
    const result = await this.oauthFlow.startGoogleOAuthFlow(
      'gmail',
      clientId.trim(),
      clientSecret.trim()
    );

    if (result.success) {
      this.setServerStatus('gmail', {
        enabled: true,
        configured: true,
        lastUsed: new Date().toISOString(),
      });
      console.log(chalk.green('\n✅ Gmail MCP Server configured successfully!\n'));
    } else {
      console.log(chalk.red(`\n❌ OAuth authorization failed: ${result.error}\n`));
      console.log(
        chalk.yellow('You can try again later by selecting "Configure Gmail MCP Server"')
      );
    }
  }

  private async updateEnvFile(
    envPath: string,
    variables: Record<string, string>
  ): Promise<void> {
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    const lines = envContent.split('\n');
    const updatedVars = new Set<string>();

    // Update existing variables
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#')) {
        const [key] = line.split('=');
        if (key && variables[key.trim()]) {
          lines[i] = `${key.trim()}=${variables[key.trim()]}`;
          updatedVars.add(key.trim());
        }
      }
    }

    // Add new variables
    for (const [key, value] of Object.entries(variables)) {
      if (!updatedVars.has(key)) {
        // Add section header if this is the first MCP variable
        if (key.includes('_MCP_') && !envContent.includes('# MCP Server')) {
          lines.push('');
          lines.push('# MCP Server Credentials');
        }
        lines.push(`${key}=${value}`);
      }
    }

    fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
  }

  async validateAndRefreshTokens(envPath: string): Promise<void> {
    const gmailStatus = this.getServerStatus('gmail');

    if (!gmailStatus.enabled || !gmailStatus.configured) {
      return;
    }

    // Check if tokens exist and are valid
    if (!this.tokenManager.hasTokens('gmail')) {
      console.log(chalk.yellow('⚠️  Gmail tokens not found. Please reconfigure Gmail MCP Server.'));
      this.setServerStatus('gmail', { enabled: false });
      return;
    }

    // Check if token is expired and refresh if needed
    if (this.tokenManager.isTokenExpired('gmail')) {
      console.log(chalk.blue('🔄 Refreshing Gmail OAuth token...'));

      // Load credentials from .env
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const clientId = this.extractEnvVar(envContent, 'GMAIL_MCP_CLIENT_ID');
      const clientSecret = this.extractEnvVar(envContent, 'GMAIL_MCP_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        console.log(
          chalk.yellow('⚠️  Gmail credentials not found in .env. Disabling Gmail MCP Server.')
        );
        this.setServerStatus('gmail', { enabled: false });
        return;
      }

      const refreshedTokens = await this.tokenManager.refreshGoogleToken(
        'gmail',
        clientId,
        clientSecret
      );

      if (refreshedTokens) {
        console.log(chalk.green('✓ Gmail token refreshed successfully'));
      } else {
        console.log(
          chalk.yellow(
            '⚠️  Failed to refresh Gmail token. Please reconfigure Gmail MCP Server.'
          )
        );
        this.setServerStatus('gmail', { enabled: false });
      }
    }
  }

  private extractEnvVar(envContent: string, key: string): string | null {
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [varKey, ...valueParts] = trimmed.split('=');
        if (varKey.trim() === key) {
          return valueParts.join('=').trim();
        }
      }
    }
    return null;
  }
}
