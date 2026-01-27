# ClaudeBot Service-Managed SDK Tools Implementation Plan

## Overview

Build a hybrid architecture where:
- **Service manages**: OAuth, tool selection UI, which specific tools users enable
- **Bot executes**: Tools locally as SDK functions (fast, no subprocess overhead)
- **Runtime permissions**: Interactive Discord approval for sensitive operations
- **Auto-dependencies**: Bot installs npm packages based on manifest

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ ClaudeBot Service (Next.js + Firebase)                             │
├─────────────────────────────────────────────────────────────────────┤
│  User Dashboard:                                                    │
│    - Sign in with Discord                                           │
│    - Connect Gmail/Calendar/Slack (OAuth flows)                     │
│    - Toggle specific tools (not just categories)                    │
│    - Generate bot tokens                                            │
│                                                                     │
│  API Endpoints:                                                     │
│    GET /api/bot/manifest                                            │
│      → Returns: enabled tools + dependencies + fresh OAuth tokens   │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
                          Bot Token (cb_xxxxx)
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ ClaudeBot (Local/Hosted)                                            │
├─────────────────────────────────────────────────────────────────────┤
│  Startup:                                                           │
│    1. Authenticate with service (bot token)                         │
│    2. Fetch manifest (enabled tools + dependencies + tokens)        │
│    3. Install dependencies (npm install googleapis@^144.0.0)        │
│    4. Load tool files from src/tools/ matching tool IDs             │
│    5. Create context with requestPermission() + tokens              │
│    6. Call each tool's createTool(context)                          │
│    7. Create SDK MCP server with all tools                          │
│                                                                     │
│  Runtime:                                                           │
│    - Tool calls await context.requestPermission("Do X")             │
│    - Bot sends Discord message with Yes/No buttons                  │
│    - User clicks → resolves promise or throws error                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Service API Manifest

**GET /api/bot/manifest**

Request:
```http
GET /api/bot/manifest
Authorization: Bearer cb_xxxxxxxxxxxxxxxxxxxxx
```

Response:
```json
{
  "user": {
    "id": "discord_123456",
    "username": "johndoe#1234",
    "email": "john@example.com"
  },
  "categories": [
    {
      "id": "gmail",
      "name": "Gmail",
      "description": "Read and send emails",
      "auth_type": "oauth2",
      "connected": true,
      "dependencies": ["googleapis@^144.0.0"],
      "tools": [
        {
          "id": "gmail_list_messages",
          "name": "List Messages",
          "description": "Search and list emails",
          "permission_level": "read",
          "enabled": true
        },
        {
          "id": "gmail_read_message",
          "name": "Read Message",
          "description": "Read full email content",
          "permission_level": "read",
          "enabled": true
        },
        {
          "id": "gmail_send_email",
          "name": "Send Email",
          "description": "Send emails via Gmail",
          "permission_level": "write",
          "enabled": true
        }
      ]
    },
    {
      "id": "calendar",
      "name": "Google Calendar",
      "description": "Manage calendar events",
      "auth_type": "oauth2",
      "connected": true,
      "dependencies": ["googleapis@^144.0.0"],
      "tools": [
        {
          "id": "calendar_list_events",
          "name": "List Events",
          "description": "List calendar events",
          "permission_level": "read",
          "enabled": false
        }
      ]
    }
  ],
  "tokens": {
    "gmail": {
      "access_token": "ya29.xxx",
      "expires_at": 1234567890
    },
    "calendar": {
      "access_token": "ya29.yyy",
      "expires_at": 1234567891
    }
  }
}
```

## Project Structure

```
claudebot/
├── src/
│   ├── tools/
│   │   ├── gmail_list_messages.ts       # Tool: List Gmail messages
│   │   ├── gmail_read_message.ts        # Tool: Read specific message
│   │   ├── gmail_send_email.ts          # Tool: Send email
│   │   ├── calendar_list_events.ts      # Tool: List calendar events
│   │   ├── calendar_create_event.ts     # Tool: Create event
│   │   ├── slack_send_message.ts        # Tool: Send Slack message
│   │   └── ... (all tools as flat files)
│   ├── service/
│   │   ├── auth.ts                      # Service authentication
│   │   ├── manifest.ts                  # Fetch & parse manifest
│   │   ├── dependencies.ts              # Install npm dependencies
│   │   └── loader.ts                    # Dynamic tool loader
│   ├── permissions/
│   │   └── discord.ts                   # Discord permission requests
│   ├── agent/
│   │   └── manager.ts                   # Updated for service tools
│   └── cli.ts                           # Updated startup flow
└── package.json
```

## Tool File Format

Each tool is a flat file in `src/tools/` with filename matching tool ID:

**src/tools/gmail_send_email.ts**
```typescript
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { google } from 'googleapis';

export function createTool(context: ToolContext) {
  return tool(
    'gmail_send_email',
    'Send an email via Gmail. The email will be sent from the authenticated Gmail account.',
    {
      to: z.string().email().describe('Recipient email address'),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Email body content (plain text)'),
      cc: z.string().email().optional().describe('CC email address'),
      bcc: z.string().email().optional().describe('BCC email address'),
    },
    async (args) => {
      // Request permission from user via Discord
      await context.requestPermission(
        `Send email to ${args.to} with subject "${args.subject}"`
      );

      try {
        // Use OAuth token from context
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: context.tokens.gmail.access_token });

        const gmail = google.gmail({ version: 'v1', auth });

        // Compose email
        const lines = [`To: ${args.to}`, `Subject: ${args.subject}`];
        if (args.cc) lines.push(`Cc: ${args.cc}`);
        if (args.bcc) lines.push(`Bcc: ${args.bcc}`);
        lines.push('', args.body);

        const email = lines.join('\r\n');
        const encodedEmail = Buffer.from(email).toString('base64url');

        // Send email
        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encodedEmail },
        });

        return {
          content: [
            {
              type: 'text',
              text: `✅ Email sent successfully!\nMessage ID: ${response.data.id}\nThread ID: ${response.data.threadId}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to send email: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**src/tools/gmail_list_messages.ts**
```typescript
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { google } from 'googleapis';

export function createTool(context: ToolContext) {
  return tool(
    'gmail_list_messages',
    'List Gmail messages with optional search query. Returns message snippets with sender, subject, and date.',
    {
      query: z
        .string()
        .optional()
        .describe('Gmail search query (e.g., "is:unread", "from:john@example.com")'),
      maxResults: z
        .number()
        .min(1)
        .max(100)
        .default(10)
        .describe('Maximum number of messages to return'),
    },
    async (args) => {
      try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: context.tokens.gmail.access_token });

        const gmail = google.gmail({ version: 'v1', auth });

        // List messages
        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          q: args.query,
          maxResults: args.maxResults,
        });

        const messages = listResponse.data.messages || [];

        if (messages.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No messages found.',
              },
            ],
          };
        }

        // Get message details
        const detailedMessages = await Promise.all(
          messages.map(async (msg) => {
            const msgResponse = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            });

            const headers = msgResponse.data.payload?.headers || [];
            const getHeader = (name: string) =>
              headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

            return {
              id: msg.id,
              from: getHeader('From'),
              subject: getHeader('Subject'),
              date: getHeader('Date'),
              snippet: msgResponse.data.snippet,
            };
          })
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(detailedMessages, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to list messages: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

**src/tools/gmail_read_message.ts**
```typescript
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { google } from 'googleapis';

export function createTool(context: ToolContext) {
  return tool(
    'gmail_read_message',
    'Read the full content of a specific Gmail message by ID',
    {
      messageId: z.string().describe('The Gmail message ID (from gmail_list_messages)'),
    },
    async (args) => {
      try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: context.tokens.gmail.access_token });

        const gmail = google.gmail({ version: 'v1', auth });

        const response = await gmail.users.messages.get({
          userId: 'me',
          id: args.messageId,
          format: 'full',
        });

        const message = response.data;
        const headers = message.payload?.headers || [];

        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        // Extract body
        let body = '';
        if (message.payload?.body?.data) {
          body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
        } else if (message.payload?.parts) {
          for (const part of message.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body = Buffer.from(part.body.data, 'base64').toString('utf-8');
              break;
            }
          }
        }

        const result = {
          id: message.id,
          threadId: message.threadId,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          snippet: message.snippet,
          body: body,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `❌ Failed to read message: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
```

## Tool Context Interface

**src/service/types.ts**
```typescript
export interface ToolContext {
  tokens: {
    [categoryId: string]: {
      access_token: string;
      expires_at?: number;
    };
  };
  requestPermission: (message: string) => Promise<void>;
}
```

## Permission System

**src/permissions/discord.ts**
```typescript
import { ThreadChannel, TextChannel, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

export class DiscordPermissionManager {
  private pendingRequests = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();

  async requestPermission(
    channel: ThreadChannel | TextChannel,
    message: string,
    requestId: string
  ): Promise<void> {
    // Create Yes/No buttons
    const yesButton = new ButtonBuilder()
      .setCustomId(`permission_yes_${requestId}`)
      .setLabel('Yes')
      .setStyle(ButtonStyle.Success);

    const noButton = new ButtonBuilder()
      .setCustomId(`permission_no_${requestId}`)
      .setLabel('No')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(yesButton, noButton);

    // Send permission request message
    const permissionMsg = await channel.send({
      content: `🔐 **Permission Required**\n${message}`,
      components: [row],
    });

    // Wait for user response
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          permissionMsg.delete().catch(() => {});
          reject(new Error('Permission request timed out'));
        }
      }, 5 * 60 * 1000);
    });
  }

  handlePermissionResponse(requestId: string, approved: boolean): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) return;

    this.pendingRequests.delete(requestId);

    if (approved) {
      request.resolve();
    } else {
      request.reject(new Error('Permission denied by user'));
    }
  }
}
```

**src/discord/events.ts** (add button handler)
```typescript
import { DiscordPermissionManager } from '../permissions/discord.js';

const permissionManager = new DiscordPermissionManager();

// Add to setupEventHandlers:
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;

  if (customId.startsWith('permission_')) {
    const [, action, requestId] = customId.split('_');
    const approved = action === 'yes';

    permissionManager.handlePermissionResponse(requestId, approved);

    await interaction.update({
      content: `${interaction.message.content}\n\n${approved ? '✅ Approved' : '❌ Denied'}`,
      components: [], // Remove buttons
    });
  }
});

export { permissionManager };
```

## Service Integration

### Service Authentication

**src/service/auth.ts**
```typescript
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { exec } from 'child_process';

const SERVICE_URL = process.env.CLAUDEBOT_SERVICE_URL || 'https://service.claudebot.io';

export async function authenticateWithService(claudeDir: string): Promise<string | null> {
  const tokenPath = path.join(claudeDir, 'service-token.json');

  // Check for existing token
  if (fs.existsSync(tokenPath)) {
    const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    return data.token;
  }

  // Check for environment variable (for hosted deployments)
  if (process.env.CLAUDEBOT_SERVICE_TOKEN) {
    return process.env.CLAUDEBOT_SERVICE_TOKEN;
  }

  // Prompt user
  console.log(chalk.cyan('\n🔌 Connect to ClaudeBot Service for advanced tools?\n'));
  console.log('The service provides:');
  console.log('  • Gmail, Calendar, Slack integrations');
  console.log('  • Managed OAuth (no Google Cloud setup needed)');
  console.log('  • Easy tool management via web dashboard\n');

  const { shouldConnect } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldConnect',
      message: 'Connect to ClaudeBot Service?',
      default: false,
    },
  ]);

  if (!shouldConnect) {
    return null;
  }

  console.log(chalk.blue('\n📱 Opening service in browser...\n'));
  console.log(`Visit: ${SERVICE_URL}/dashboard`);
  console.log('1. Sign in with Discord');
  console.log('2. Create a bot and copy the token');
  console.log('3. Paste the token below\n');

  // Open browser
  const command =
    process.platform === 'darwin'
      ? `open "${SERVICE_URL}/dashboard"`
      : process.platform === 'win32'
      ? `start "${SERVICE_URL}/dashboard"`
      : `xdg-open "${SERVICE_URL}/dashboard"`;

  exec(command, () => {});

  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Paste bot token:',
      mask: '*',
      validate: (input) => {
        if (!input.startsWith('cb_')) {
          return 'Invalid token format (should start with cb_)';
        }
        return true;
      },
    },
  ]);

  // Save token
  fs.writeFileSync(tokenPath, JSON.stringify({ token }, null, 2), { mode: 0o600 });
  console.log(chalk.green('✓ Token saved\n'));

  return token;
}
```

### Manifest Fetching

**src/service/manifest.ts**
```typescript
const SERVICE_URL = process.env.CLAUDEBOT_SERVICE_URL || 'https://service.claudebot.io';

export interface ToolManifest {
  user: {
    id: string;
    username: string;
    email: string;
  };
  categories: Array<{
    id: string;
    name: string;
    description: string;
    auth_type: string;
    connected: boolean;
    dependencies: string[];
    tools: Array<{
      id: string;
      name: string;
      description: string;
      permission_level: string;
      enabled: boolean;
    }>;
  }>;
  tokens: {
    [categoryId: string]: {
      access_token: string;
      expires_at?: number;
    };
  };
}

export async function fetchManifest(serviceToken: string): Promise<ToolManifest> {
  const response = await fetch(`${SERVICE_URL}/api/bot/manifest`, {
    headers: {
      Authorization: `Bearer ${serviceToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
```

### Dependency Installation

**src/service/dependencies.ts**
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export async function installDependencies(manifest: ToolManifest): Promise<void> {
  // Collect all unique dependencies
  const allDeps = new Set<string>();

  for (const category of manifest.categories) {
    if (category.connected && category.dependencies) {
      category.dependencies.forEach((dep) => allDeps.add(dep));
    }
  }

  if (allDeps.size === 0) {
    return;
  }

  console.log(chalk.blue('📦 Installing tool dependencies...\n'));

  const depsArray = Array.from(allDeps);
  console.log(`Installing: ${depsArray.join(', ')}`);

  try {
    const { stdout, stderr } = await execAsync(`npm install ${depsArray.join(' ')}`, {
      cwd: process.cwd(),
    });

    if (stderr && !stderr.includes('npm warn')) {
      console.log(chalk.yellow(stderr));
    }

    console.log(chalk.green('✓ Dependencies installed\n'));
  } catch (error) {
    console.error(chalk.red('Failed to install dependencies:'), error);
    throw error;
  }
}
```

### Dynamic Tool Loader

**src/service/loader.ts**
```typescript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { nanoid } from 'nanoid';
import { permissionManager } from '../discord/events.js';
import type { ToolContext } from './types.js';
import type { ToolManifest } from './manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadTools(
  manifest: ToolManifest,
  channel: any // Discord channel for permissions
): Promise<any> {
  const toolsDir = path.join(__dirname, '../tools');

  // Get all enabled tool IDs
  const enabledToolIds = new Set<string>();
  for (const category of manifest.categories) {
    if (category.connected) {
      for (const tool of category.tools) {
        if (tool.enabled) {
          enabledToolIds.add(tool.id);
        }
      }
    }
  }

  if (enabledToolIds.size === 0) {
    console.log('ℹ️  No tools enabled in service');
    return null;
  }

  // Create context for tools
  const context: ToolContext = {
    tokens: manifest.tokens,
    requestPermission: async (message: string) => {
      const requestId = nanoid();
      await permissionManager.requestPermission(channel, message, requestId);
    },
  };

  // Load matching tool files
  const tools = [];
  const files = fs.readdirSync(toolsDir).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));

  for (const file of files) {
    const toolId = path.basename(file, path.extname(file));

    if (enabledToolIds.has(toolId)) {
      try {
        const toolPath = path.join(toolsDir, file);
        const toolModule = await import(toolPath);

        if (typeof toolModule.createTool === 'function') {
          const tool = toolModule.createTool(context);
          tools.push(tool);
          console.log(`✓ Loaded tool: ${toolId}`);
        } else {
          console.warn(`⚠️  Tool ${toolId} missing createTool export`);
        }
      } catch (error) {
        console.error(`❌ Failed to load tool ${toolId}:`, error);
      }
    }
  }

  if (tools.length === 0) {
    return null;
  }

  console.log(chalk.green(`\n✅ Loaded ${tools.length} tools from service\n`));

  // Create SDK MCP server
  return createSdkMcpServer({
    name: 'claudebot-tools',
    version: '1.0.0',
    tools,
  });
}
```

## CLI Integration

**src/cli.ts** (updated)
```typescript
import { authenticateWithService } from './service/auth.js';
import { fetchManifest } from './service/manifest.js';
import { installDependencies } from './service/dependencies.js';

export async function run(): Promise<void> {
  // ... existing code ...

  spinner.succeed(chalk.green('Configuration valid'));

  // Service authentication (optional)
  const claudeDir = path.join(cwd, '.claude');
  const serviceToken = await authenticateWithService(claudeDir);

  let manifest = null;
  if (serviceToken) {
    try {
      console.log(chalk.blue('🔄 Fetching tool manifest from service...\n'));
      manifest = await fetchManifest(serviceToken);

      // Install dependencies
      await installDependencies(manifest);

      console.log(chalk.green(`✓ Connected as ${manifest.user.username}\n`));
    } catch (error) {
      console.error(chalk.red('Failed to connect to service:'), error);
      console.log(chalk.yellow('Continuing without service tools...\n'));
    }
  }

  // Start the bot
  console.log(chalk.cyan('🚀 Starting ClaudeBot...\n'));
  await startBot(cwd, manifest);
}
```

**src/index.ts** (updated)
```typescript
import { loadTools } from './service/loader.js';
import type { ToolManifest } from './service/manifest.js';

export async function startBot(cwd: string, manifest: ToolManifest | null): Promise<void> {
  console.log('🚀 Initializing ClaudeBot...\n');

  const { dbPath, sessionsDir, claudeDir, isFirstRun } = initializeClaudeFolder(cwd);

  // ... existing initialization code ...

  // Connect to Discord first (needed for permissions)
  console.log('🔌 Connecting to Discord...\n');
  const client = await createDiscordClient({ token, guildId });

  // Sync channels with folders
  const channelMappings = await syncChannelsOnStartup(client, guildId, cwd);
  console.log('');

  // Load tools from service manifest
  let toolsServer = null;
  if (manifest) {
    // Use first channel for permission requests (or create a system)
    const defaultChannel = channelMappings[0]?.channel;
    if (defaultChannel) {
      toolsServer = await loadTools(manifest, defaultChannel);
    }
  }

  // Initialize session manager with tools
  const sessionManager = new SessionManager(db, sessionsDir, toolsServer);

  // ... rest of initialization ...
}
```

**src/agent/manager.ts** (updated)
```typescript
export class SessionManager {
  private pendingCronSessions = new Map<string, PendingCronSession>();
  public toolsServer: any;

  constructor(
    private db: SessionDatabase,
    private sessionsDir: string,
    toolsServer: any = null
  ) {
    this.toolsServer = toolsServer;
  }

  createQuery(
    userMessage: string,
    sessionId: string | null,
    workingDir: string
  ): Query {
    return query({
      prompt: userMessage,
      options: {
        cwd: workingDir,
        resume: sessionId || undefined,
        includePartialMessages: true,
        settingSources: ['project'],
        allowDangerouslySkipPermissions: true,
        permissionMode: 'bypassPermissions',
        tools: { type: 'preset', preset: 'claude_code' },
        mcpServers: this.toolsServer ? { 'claudebot-tools': this.toolsServer } : undefined,
      },
    });
  }
}
```

## Service Implementation (Separate Plan)

The service itself needs to be built separately. High-level requirements:

### Service Stack
- **Frontend**: Next.js 14 + Tailwind
- **Database**: Firebase Firestore
- **Auth**: Discord OAuth + Firebase custom tokens
- **Hosting**: Vercel

### Service Features
1. Discord OAuth login
2. Tool category management (Gmail, Calendar, Slack, etc.)
3. OAuth flows for each category
4. Toggle individual tools (not just categories)
5. Bot token generation
6. Token refresh API (`GET /api/bot/manifest`)

### Service UI Mockup

**Dashboard:**
```
┌────────────────────────────────────────────────────────┐
│ ClaudeBot Service - Dashboard                          │
├────────────────────────────────────────────────────────┤
│                                                        │
│ 👤 Logged in as: johndoe#1234                          │
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 📧 Gmail                                ✓ Connected │  │
│ │                                                    │  │
│ │ Tools (3):                                         │  │
│ │ ☑ gmail_list_messages    List emails              │  │
│ │ ☑ gmail_read_message     Read email content       │  │
│ │ ☑ gmail_send_email       Send emails              │  │
│ │                                                    │  │
│ │ [Reconnect Gmail]                                  │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 📅 Google Calendar                   Not Connected │  │
│ │                                                    │  │
│ │ [Connect Google Calendar]                          │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 🤖 Your Bots                                       │  │
│ │                                                    │  │
│ │ • Local Bot (cb_abc123...)  Last seen: 2m ago     │  │
│ │ • Production Bot (cb_xyz789...) Last seen: 5m ago │  │
│ │                                                    │  │
│ │ [+ Create New Bot]                                 │  │
│ └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

## Example Usage

### User Perspective

1. **Service Setup:**
   ```
   1. Go to service.claudebot.io
   2. Sign in with Discord
   3. Click "Connect Gmail"
   4. Complete Google OAuth
   5. Toggle which Gmail tools to enable
   6. Generate bot token
   ```

2. **Local Bot Setup:**
   ```bash
   npm install -g claudebot
   claudebot
   # Prompted to connect to service
   # Paste bot token
   # Dependencies auto-install
   # Bot starts with Gmail tools
   ```

3. **Discord Usage:**
   ```
   User: "Show my unread emails"
   Claude: Uses gmail_list_messages tool → works directly

   User: "Send an email to john@example.com saying hi"
   Bot: 🔐 Permission Required
        Send email to john@example.com with subject "Hi"
        [Yes] [No]
   User: *clicks Yes*
   Claude: ✅ Email sent successfully!
   ```

## Testing Plan

### Manual Testing

**Service:**
- [ ] Discord OAuth flow
- [ ] Gmail OAuth flow
- [ ] Tool toggle UI
- [ ] Bot token generation
- [ ] Manifest API endpoint

**Bot:**
- [ ] Service authentication
- [ ] Manifest fetching
- [ ] Dependency installation
- [ ] Dynamic tool loading
- [ ] Permission requests in Discord
- [ ] Tool execution with OAuth tokens

**Integration:**
- [ ] Fresh bot setup with service
- [ ] Gmail tools end-to-end
- [ ] Permission approval/denial
- [ ] Token refresh
- [ ] Multiple bots per user

## Migration from Old Implementation

Since the old MCP implementation was never released:

1. Delete old MCP code:
   ```bash
   rm -rf src/mcp/
   npm uninstall google-auth-library
   ```

2. Clean up old files:
   ```bash
   rm .claude/oauth-tokens.json
   rm .claude/mcp-config.json
   ```

3. Implement new service-based approach

## Dependencies

**Bot:**
```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.8.0",
    "discord.js": "^14.14.1",
    "nanoid": "^5.0.0",
    // Tool dependencies installed dynamically:
    // "googleapis": "^144.0.0"  (if Gmail enabled)
  }
}
```

**Service:**
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "firebase": "^10.0.0",
    "firebase-admin": "^12.0.0",
    "googleapis": "^144.0.0"
  }
}
```

## Future Enhancements

1. **More Tool Categories:**
   - Slack (send messages, read channels)
   - GitHub (create issues, PRs)
   - Notion (create pages, search)
   - Linear (create issues)
   - Stripe (check payments)

2. **Permission Modes:**
   - Always ask (current)
   - Ask once per session
   - Auto-approve (set in service)
   - Auto-deny

3. **Tool Analytics:**
   - Track tool usage
   - Show stats in service dashboard
   - Rate limiting per user

4. **Custom Tools:**
   - Users upload their own tool definitions
   - Service validates and enables them
   - Bot downloads and runs them

5. **Team Features:**
   - Share bot tokens across team
   - Centralized tool configuration
   - Audit logs

## Benefits Summary

### For Users
- ✅ No OAuth setup complexity
- ✅ Web UI for tool management
- ✅ Granular control (toggle specific tools)
- ✅ Runtime permissions for safety
- ✅ Works same locally and hosted

### For Developers
- ✅ Simple tool format (just TypeScript functions)
- ✅ No subprocess overhead
- ✅ Service handles OAuth complexity
- ✅ Easy to add new tools
- ✅ Type-safe with Zod schemas

### Architecture
- ✅ Best of both worlds (service + local execution)
- ✅ Fast (tools run in-process)
- ✅ Secure (permissions + OAuth via service)
- ✅ Scalable (service manages auth centrally)
- ✅ Extensible (easy to add tools/categories)
