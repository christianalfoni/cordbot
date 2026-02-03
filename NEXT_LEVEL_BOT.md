# Bot Changes: Community Assistant Mode

## Overview

Transform the bot from a personal assistant to a **Discord Community Assistant** that understands server activity and manages Discord resources through natural language.

## Core Bot Changes

### 1. Message Tracking System

**Track ALL public messages** in the server (not just bot interactions) to build context about community activity.

**Implementation: `/packages/bot/src/message-tracking/tracker.ts`**

```typescript
import fs from 'fs/promises';
import path from 'path';
import type { Message } from 'discord.js';

export interface TrackedMessage {
  messageId: string;
  channelId: string;
  channelName: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  mentions: string[];
  attachmentCount: number;
  embedCount: number;
}

export async function trackMessage(message: Message): Promise<void> {
  const record: TrackedMessage = {
    messageId: message.id,
    channelId: message.channelId,
    channelName: message.channel.name,
    authorId: message.author.id,
    authorName: message.author.username,
    content: message.content,
    timestamp: new Date().toISOString(),
    mentions: message.mentions.users.map(u => u.username),
    attachmentCount: message.attachments.size,
    embedCount: message.embeds.length,
  };

  // Store in channel's messages directory
  const messagesPath = path.join(
    process.env.HOME || '/workspace',
    '.claude',
    'channels',
    message.channelId,
    'messages',
    'raw'
  );

  await fs.mkdir(messagesPath, { recursive: true });

  // Append to today's JSONL file
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(messagesPath, `${today}.jsonl`);

  await fs.appendFile(filePath, JSON.stringify(record) + '\n', 'utf-8');
}
```

**Update: `/packages/bot/src/discord/events.ts`**

```typescript
export function setupEventHandlers(
  client: Client,
  sessionManager: SessionManager,
  channelMappings: Map<string, ChannelMapping>,
  basePath: string,
  expectedGuildId: string,
  cronRunner: CronRunner,
  botConfig: BotConfig
): void {

  client.on('messageCreate', async (message) => {
    // Filter to only our guild
    if (message.guildId !== expectedGuildId) {
      return;
    }

    try {
      // NEW: Track ALL public messages (not just bot interactions)
      if (!message.author.bot && !message.channel.isThread()) {
        await trackMessage(message);
      }

      // Existing bot interaction logic (unchanged)
      if (shouldBotRespond(message, botConfig)) {
        await handleMessageWithLock(message, sessionManager, channelMappings, botConfig);
      }
    } catch (error) {
      console.error('Error in messageCreate:', error);
    }
  });

  // Other event handlers with guild filtering...
}
```

**Storage Structure:**

```
~/.claude/channels/{channelId}/
├── CLAUDE.md
├── cron.yaml
├── memories/              # Bot conversation logs (existing)
│   ├── raw/
│   ├── daily/
│   └── weekly/
└── messages/              # NEW: All tracked messages
    └── raw/
        ├── 2026-02-01.jsonl
        ├── 2026-02-02.jsonl
        └── 2026-02-03.jsonl
```

**Retention Policy:**

Default: 30 days for raw messages. Users can configure in `~/.claude/settings.yaml`:

```yaml
message_retention:
  raw_days: 30
```

Add cleanup cron job to each channel's `cron.yaml`:

```yaml
jobs:
  - name: cleanup_old_messages
    schedule: '0 2 * * *'  # 2 AM UTC
    task: 'Delete raw message logs older than 30 days'
    oneTime: false
```

---

### 2. Discord Management Tools

Add 12 essential Discord.js tools for server management.

**New Directory: `/packages/bot/src/tools/discord/`**

**Channel Management:**
1. `send_message.ts` - Send message to any channel
2. `list_channels.ts` - List all guild channels
3. `create_channel.ts` - Create new text/voice channel
4. `delete_channel.ts` - Delete channel (requires permission)

**Member Management:**
5. `list_members.ts` - List guild members with filters
6. `get_member.ts` - Get member info (roles, join date, etc.)
7. `kick_member.ts` - Kick member (requires permission)
8. `ban_member.ts` - Ban member (requires permission)

**Role Management:**
9. `list_roles.ts` - List all roles
10. `assign_role.ts` - Assign role to member
11. `remove_role.ts` - Remove role from member
12. `create_role.ts` - Create new role

**Example: `/packages/bot/src/tools/discord/send_message.ts`**

```typescript
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, TextChannel } from 'discord.js';

export function createSendMessageTool(client: Client) {
  return tool(
    'discord_send_message',
    'Send a message to a Discord channel',
    z.object({
      channelId: z.string().describe('The Discord channel ID'),
      content: z.string().describe('Message content to send'),
    }),
    async ({ channelId, content }) => {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || !channel.isTextBased()) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid text channel' }],
            isError: true,
          };
        }

        await (channel as TextChannel).send(content);

        return {
          content: [{ type: 'text', text: `✅ Message sent to <#${channelId}>` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
```

**Example: `/packages/bot/src/tools/discord/assign_role.ts`**

```typescript
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import type { DiscordPermissionManager } from '../../permissions/discord.js';

export function createAssignRoleTool(
  client: Client,
  permissionManager: DiscordPermissionManager
) {
  return tool(
    'discord_assign_role',
    'Assign a role to a guild member',
    z.object({
      userId: z.string().describe('Discord user ID'),
      roleId: z.string().describe('Discord role ID'),
      reason: z.string().optional().describe('Reason for assignment'),
    }),
    async ({ userId, roleId, reason }) => {
      // Request permission for sensitive operation
      const approved = await permissionManager.requestPermission(
        `Assign role <@&${roleId}> to <@${userId}>?`,
        'MEDIUM'
      );

      if (!approved) {
        return {
          content: [{ type: 'text', text: 'Permission denied by user' }],
          isError: true,
        };
      }

      try {
        const guild = client.guilds.cache.first();
        const member = await guild.members.fetch(userId);
        const role = guild.roles.cache.get(roleId);

        await member.roles.add(role, reason);

        return {
          content: [{
            type: 'text',
            text: `✅ Assigned role ${role.name} to ${member.user.username}`
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
```

**Tool Loader: `/packages/bot/src/tools/discord/loader.ts`**

```typescript
import { Client } from 'discord.js';
import { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { DiscordPermissionManager } from '../../permissions/discord.js';

export function loadDiscordTools(
  client: Client,
  permissionManager: DiscordPermissionManager
): SdkMcpToolDefinition[] {
  return [
    // Channel tools
    createSendMessageTool(client),
    createListChannelsTool(client),
    createCreateChannelTool(client, permissionManager),
    createDeleteChannelTool(client, permissionManager),

    // Member tools
    createListMembersTool(client),
    createGetMemberTool(client),
    createKickMemberTool(client, permissionManager),
    createBanMemberTool(client, permissionManager),

    // Role tools
    createListRolesTool(client),
    createAssignRoleTool(client, permissionManager),
    createRemoveRoleTool(client, permissionManager),
    createCreateRoleTool(client, permissionManager),
  ];
}
```

---

### 3. Permission System

Discord tools that modify state require user approval.

**Update: `/packages/bot/src/permissions/discord.ts`**

```typescript
export enum PermissionLevel {
  LOW = 'low',       // read-only: list, get, send_message
  MEDIUM = 'medium', // modify: create, assign
  HIGH = 'high',     // destructive: delete, kick, ban
}

export const TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  // No permission needed (read-only)
  'discord_list_channels': PermissionLevel.LOW,
  'discord_list_members': PermissionLevel.LOW,
  'discord_list_roles': PermissionLevel.LOW,
  'discord_get_member': PermissionLevel.LOW,
  'discord_send_message': PermissionLevel.LOW,

  // Ask permission (modifications)
  'discord_create_channel': PermissionLevel.MEDIUM,
  'discord_assign_role': PermissionLevel.MEDIUM,
  'discord_remove_role': PermissionLevel.MEDIUM,
  'discord_create_role': PermissionLevel.MEDIUM,

  // Ask permission + log (destructive)
  'discord_delete_channel': PermissionLevel.HIGH,
  'discord_kick_member': PermissionLevel.HIGH,
  'discord_ban_member': PermissionLevel.HIGH,
};

export class DiscordPermissionManager {
  async requestPermission(
    action: string,
    level: PermissionLevel
  ): Promise<boolean> {
    // LOW level: auto-approve
    if (level === PermissionLevel.LOW) {
      return true;
    }

    // MEDIUM/HIGH: Ask user in Discord
    // Implementation sends message with reaction buttons
    // Returns true if approved, false if denied

    // For now, placeholder:
    console.log(`[Permission] Requesting: ${action} (${level})`);
    return true; // TODO: Implement Discord interaction
  }
}
```

---

### 4. Simplified Tool Set

Remove tools not needed for Discord community management.

**Remove:**
- Gmail OAuth integration (`/packages/bot/src/service/gmail-service.ts`)
- Calendar OAuth integration (`/packages/bot/src/service/calendar-service.ts`)
- Gmail tools (`/packages/bot/src/tools/gmail/`)
- Calendar tools (`/packages/bot/src/tools/calendar/`)
- Bash tool (security risk)

**Update: `/packages/bot/src/agent/manager.ts`**

```typescript
async createQuery(prompt: string, guildId: string, channelId: string) {
  const workingDir = `/workspace/${guildId}/${channelName}`;

  return this.sdk.query(prompt, {
    cwd: workingDir,
    tools: {
      preset: 'none',  // Don't use default preset (includes Bash)
      additional: [
        // File operations only
        'read_file',
        'write_file',
        'edit_file',
        'glob',
        'grep',
        // NO 'bash' tool
      ],
    },
    mcpServers: {
      'cordbot-tools': this.mcpServer, // Discord tools + cron tools
    },
  });
}
```

**Keep:**
- File operations (Read, Write, Edit, Glob, Grep)
- Cron tools (scheduling)
- Web search (via MCP)

---

### 5. Integrate Discord Tools

**Update: `/packages/bot/src/agent/manager.ts`**

```typescript
import { loadDiscordTools } from '../tools/discord/loader.js';

export class SessionManager {
  private discordClient: Client;
  private permissionManager: DiscordPermissionManager;

  constructor(
    discordClient: Client,
    permissionManager: DiscordPermissionManager,
    // ... other params
  ) {
    this.discordClient = discordClient;
    this.permissionManager = permissionManager;
  }

  async createMcpServer(): Promise<McpServer> {
    // Existing built-in tools (cron, shareFile)
    const builtinTools = loadBuiltinTools(/* ... */);

    // NEW: Discord tools
    const discordTools = loadDiscordTools(
      this.discordClient,
      this.permissionManager
    );

    // Combine all tools
    const allTools = [
      ...builtinTools,
      ...discordTools,
    ];

    return createSdkMcpServer(allTools);
  }
}
```

---

### 6. Updated System Prompt

**Update: `/packages/bot/src/discord/sync.ts` - `createChannelClaudeMd()`**

```markdown
# CordBot - Discord Community Assistant

You are CordBot, an AI assistant designed to help manage and support Discord communities.

## Your Core Capabilities

### 1. Community Understanding
- You track all public messages in this server
- You have access to recent message history per channel
- You can answer questions about recent discussions and activity patterns
- Ask you: "What have people been discussing?" or "Summarize today's activity"

### 2. Discord Server Management
You have access to Discord management tools:

**Channels:**
- `discord_list_channels` - See all channels
- `discord_send_message` - Send message to any channel
- `discord_create_channel` - Create new channel
- `discord_delete_channel` - Delete channel (asks permission)

**Members:**
- `discord_list_members` - List server members
- `discord_get_member` - Get member info and roles
- `discord_kick_member` - Kick member (asks permission)
- `discord_ban_member` - Ban member (asks permission)

**Roles:**
- `discord_list_roles` - See all roles
- `discord_assign_role` - Assign role to member
- `discord_remove_role` - Remove role from member
- `discord_create_role` - Create new role

**Permission System:** You'll always ask for approval before:
- Creating or deleting channels
- Kicking or banning members
- Managing roles

### 3. Workspace & Files
- This channel has its own workspace directory for files
- You can create, read, edit, and manage files
- Share files back to Discord with the `shareFile` tool
- Organize project files, docs, or any community resources

### 4. Scheduled Tasks
- Use cron tools to schedule recurring tasks
- Examples: daily announcements, reminders, automated reports
- Schedule format: cron syntax (e.g., "0 9 * * *" = 9 AM daily)

### 5. Research & Information
- Search the web for information
- Help with coding, troubleshooting, research
- Provide answers and explanations
- Look up documentation and resources

## Communication Style
- Be friendly and conversational (not robotic)
- Respond naturally - you're a community member, not a command bot
- Use Discord markdown (bold, italic, code blocks, etc.)
- Ask clarifying questions when you need more context
- Be proactive in offering help, but not pushy

## Channel Context
**Channel:** #{channelName}
**Topic:** {channelTopic}

{additionalInstructions}

## Your Role
You're here to make this community better. Help members stay informed, manage the server efficiently, and create a positive environment. Be helpful, respectful, and always ask before taking significant actions.
```

---

### 7. Guild Filtering

Ensure bot only processes events for its assigned guild.

**Update: `/packages/bot/src/index.ts`**

```typescript
export async function startBot(cwd: string): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!guildId) {
    throw new Error('DISCORD_GUILD_ID is required');
  }

  console.log(`
╔═══════════════════════════════════════╗
║     CordBot Community Assistant       ║
║   Discord Server Management AI        ║
╚═══════════════════════════════════════╝
  `);
  console.log(`[CordBot] Guild: ${guildId}`);
  console.log(`[CordBot] Shared bot token (filtering for this guild only)`);

  // Connect to Discord
  await client.login(process.env.DISCORD_BOT_TOKEN);
  await new Promise(resolve => client.once('ready', resolve));

  // Verify we're in the guild
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Bot not in guild ${guildId}. Please re-invite CordBot.`);
  }

  console.log(`[CordBot] ✅ Connected to guild: ${guild.name}`);

  // Setup event handlers (with guild filtering)
  setupEventHandlers(client, sessionManager, channelMappings, basePath, guildId, cronRunner, botConfig);

  console.log(`[CordBot] 🚀 Ready to assist ${guild.name}!`);
}
```

**All event handlers filter to assigned guild:**

```typescript
client.on('channelCreate', async (channel) => {
  if (channel.guildId !== expectedGuildId) return;
  await syncNewChannel(channel, basePath, botConfig);
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
  if (newChannel.guildId !== expectedGuildId) return;
  await updateChannelClaudeMdTopic(newChannel, channelMappings);
});

client.on('channelDelete', async (channel) => {
  if (channel.guildId !== expectedGuildId) return;
  await deleteChannelWorkspace(channel, channelMappings, cronRunner);
});
```

---

## Implementation Checklist

### Phase 1: Message Tracking
- [ ] Create `/packages/bot/src/message-tracking/tracker.ts`
- [ ] Update `/packages/bot/src/discord/events.ts` - add `trackMessage()` call
- [ ] Test: Send 50 messages, verify stored in JSONL files
- [ ] Add cleanup cron job for 30-day retention

### Phase 2: Discord Tools
- [ ] Create `/packages/bot/src/tools/discord/` directory
- [ ] Implement 12 Discord tools (send_message, list_channels, etc.)
- [ ] Create `/packages/bot/src/tools/discord/loader.ts`
- [ ] Update `/packages/bot/src/permissions/discord.ts` - permission levels
- [ ] Test: Try each tool, verify permissions work

### Phase 3: Integration
- [ ] Update `/packages/bot/src/agent/manager.ts` - integrate Discord tools
- [ ] Remove Bash tool from allowed tools
- [ ] Remove Gmail/Calendar services and tools
- [ ] Update `/packages/bot/src/discord/sync.ts` - new CLAUDE.md template
- [ ] Test: Create new channel, verify CLAUDE.md has community prompt

### Phase 4: Guild Filtering
- [ ] Update `/packages/bot/src/index.ts` - add guild verification
- [ ] Update all event handlers - add guild ID filtering
- [ ] Test: Deploy to test guild, verify only processes that guild's events

### Phase 5: Testing
- [ ] End-to-end test: Deploy bot, verify all features work
- [ ] Performance test: 1000 messages tracked, check overhead
- [ ] Permission test: Verify approve/deny for destructive actions
- [ ] Message tracking test: Verify accurate storage and retrieval

---

## File Changes Summary

**New Files:**
- `/packages/bot/src/message-tracking/tracker.ts`
- `/packages/bot/src/tools/discord/send_message.ts`
- `/packages/bot/src/tools/discord/list_channels.ts`
- `/packages/bot/src/tools/discord/create_channel.ts`
- `/packages/bot/src/tools/discord/delete_channel.ts`
- `/packages/bot/src/tools/discord/list_members.ts`
- `/packages/bot/src/tools/discord/get_member.ts`
- `/packages/bot/src/tools/discord/kick_member.ts`
- `/packages/bot/src/tools/discord/ban_member.ts`
- `/packages/bot/src/tools/discord/list_roles.ts`
- `/packages/bot/src/tools/discord/assign_role.ts`
- `/packages/bot/src/tools/discord/remove_role.ts`
- `/packages/bot/src/tools/discord/create_role.ts`
- `/packages/bot/src/tools/discord/loader.ts`

**Modified Files:**
- `/packages/bot/src/discord/events.ts` - Add message tracking + guild filtering
- `/packages/bot/src/agent/manager.ts` - Integrate Discord tools, remove Bash
- `/packages/bot/src/discord/sync.ts` - Update CLAUDE.md template
- `/packages/bot/src/permissions/discord.ts` - Add permission levels
- `/packages/bot/src/index.ts` - Add guild verification and filtering

**Deleted Files:**
- `/packages/bot/src/service/gmail-service.ts`
- `/packages/bot/src/service/calendar-service.ts`
- `/packages/bot/src/tools/gmail/` (entire directory)
- `/packages/bot/src/tools/calendar/` (entire directory)

---

## Timeline

**Week 1: Message Tracking + Discord Tools**
- Days 1-2: Implement message tracking system
- Days 3-5: Build 12 Discord tools
- Days 6-7: Test and refine

**Week 2: Integration + Guild Filtering**
- Days 1-2: Integrate tools into agent manager
- Days 3-4: Remove Gmail/Calendar/Bash, update CLAUDE.md
- Days 5-7: Add guild filtering, end-to-end testing

**Total: 2 weeks**

---

## What Changes for Users?

### Before (Personal Assistant Mode)
- Bot only responds when mentioned or in threads
- Limited to conversation and file operations
- Has Gmail/Calendar integrations (rarely used)
- Can run arbitrary bash commands

### After (Community Assistant Mode)
- Bot tracks all server activity (context-aware)
- Can manage Discord (channels, roles, members) via natural language
- No OAuth integrations needed
- More secure (no bash access)
- Better system prompt for community management

---

## Benefits

✅ **Better Context** - Bot understands what's happening in the server
✅ **Server Management** - Natural language Discord admin tasks
✅ **More Secure** - No bash tool, no OAuth tokens to manage
✅ **Simpler** - Fewer integrations, clearer purpose
✅ **Same Architecture** - Still per-guild Fly.io deployments

---

## Questions to Answer

1. **Storage Growth** - 30 days of messages could be large for active servers. Monitor and adjust retention if needed.

2. **Permission UX** - How to implement approve/deny in Discord? React buttons? Slash commands? Reply detection?

3. **Message Search** - Should we add a search tool over tracked messages? Or rely on Claude reading JSONL files?

4. **Privacy** - Clear documentation that bot tracks all messages. Consider per-channel disable via CLAUDE.md if needed later.

5. **Rate Limits** - Discord API rate limits for management tools. Need exponential backoff and error handling.
