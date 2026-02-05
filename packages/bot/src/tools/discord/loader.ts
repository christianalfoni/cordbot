import { Client } from 'discord.js';
import { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { IPermissionManager } from '../../interfaces/permission.js';
import { createSendMessageTool } from './send_message.js';
import { createListChannelsTool } from './list_channels.js';
import { createCreateChannelTool } from './create_channel.js';
import { createDeleteChannelTool } from './delete_channel.js';
import { createListMembersTool } from './list_members.js';
import { createGetMemberTool } from './get_member.js';
import { createKickMemberTool } from './kick_member.js';
import { createBanMemberTool } from './ban_member.js';
import { createListRolesTool } from './list_roles.js';
import { createAssignRoleTool } from './assign_role.js';
import { createRemoveRoleTool } from './remove_role.js';
import { createCreateRoleTool } from './create_role.js';
import { createCreateEventTool } from './create_event.js';
import { createListEventsTool } from './list_events.js';
import { createGetEventTool } from './get_event.js';
import { createDeleteEventTool } from './delete_event.js';
import { createGetEventUsersTool } from './get_event_users.js';
import { createCreatePollTool } from './create_poll.js';
import { createGetPollResultsTool } from './get_poll_results.js';
import { createCreateForumChannelTool } from './create_forum_channel.js';
import { createListForumPostsTool } from './list_forum_posts.js';
import { createCreateForumPostTool } from './create_forum_post.js';
import { createDeleteForumPostTool } from './delete_forum_post.js';

/**
 * Load all Discord management tools
 * @param client Discord client instance
 * @param permissionManager Permission manager for sensitive operations
 * @param getCurrentChannel Function to get the current channel context
 * @param guildId The configured guild ID from environment (NEVER use client.guilds.cache)
 * @returns Array of Discord tools
 */
export function loadDiscordTools(
  client: Client,
  permissionManager: IPermissionManager,
  getCurrentChannel: () => any,
  guildId: string
): SdkMcpToolDefinition<any>[] {
  return [
    // Channel tools (read-only)
    createSendMessageTool(client),
    createListChannelsTool(client, guildId),

    // Channel tools (require permission)
    createCreateChannelTool(client, permissionManager, getCurrentChannel, guildId),
    createDeleteChannelTool(client, permissionManager, getCurrentChannel),

    // Member tools (read-only)
    createListMembersTool(client, guildId),
    createGetMemberTool(client, guildId),

    // Member tools (require permission)
    createKickMemberTool(client, permissionManager, getCurrentChannel, guildId),
    createBanMemberTool(client, permissionManager, getCurrentChannel, guildId),

    // Role tools (read-only)
    createListRolesTool(client, guildId),

    // Role tools (require permission)
    createAssignRoleTool(client, permissionManager, getCurrentChannel, guildId),
    createRemoveRoleTool(client, permissionManager, getCurrentChannel, guildId),
    createCreateRoleTool(client, permissionManager, getCurrentChannel, guildId),

    // Event tools (read-only)
    createListEventsTool(client, getCurrentChannel, guildId),
    createGetEventTool(client, getCurrentChannel, guildId),
    createGetEventUsersTool(client, getCurrentChannel, guildId),

    // Event tools (require permission)
    createCreateEventTool(client, permissionManager, getCurrentChannel, guildId),
    createDeleteEventTool(client, permissionManager, getCurrentChannel, guildId),

    // Poll tools (read-only)
    createGetPollResultsTool(client),

    // Poll tools (require permission)
    createCreatePollTool(client, permissionManager, getCurrentChannel),

    // Forum tools (read-only)
    createListForumPostsTool(client),
    createCreateForumPostTool(client),

    // Forum tools (require permission)
    createCreateForumChannelTool(client, permissionManager, getCurrentChannel, guildId),
    createDeleteForumPostTool(client, permissionManager, getCurrentChannel),
  ];
}
