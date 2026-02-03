import {
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ThreadChannel,
  TextChannel,
} from 'discord.js';
import {
  IPermissionManager,
  PermissionLevel,
  PermissionResult,
} from '../../interfaces/permission.js';
import type { ITextChannel, IThreadChannel } from '../../interfaces/discord.js';

interface PendingRequest {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  messageId: string;
  timestamp: number;
}

/**
 * Tool permission levels mapping
 */
export const TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  // Low level (read-only)
  'discord_list_channels': PermissionLevel.LOW,
  'discord_list_members': PermissionLevel.LOW,
  'discord_list_roles': PermissionLevel.LOW,
  'discord_get_member': PermissionLevel.LOW,
  'discord_send_message': PermissionLevel.LOW,
  'discord_list_events': PermissionLevel.LOW,
  'discord_get_event': PermissionLevel.LOW,
  'discord_get_event_users': PermissionLevel.LOW,
  'discord_get_poll_results': PermissionLevel.LOW,
  'discord_list_forum_posts': PermissionLevel.LOW,
  'discord_create_forum_post': PermissionLevel.LOW,

  // Medium level (modifications)
  'discord_create_channel': PermissionLevel.MEDIUM,
  'discord_assign_role': PermissionLevel.MEDIUM,
  'discord_remove_role': PermissionLevel.MEDIUM,
  'discord_create_role': PermissionLevel.MEDIUM,
  'discord_create_event': PermissionLevel.MEDIUM,
  'discord_create_poll': PermissionLevel.MEDIUM,
  'discord_create_forum_channel': PermissionLevel.MEDIUM,

  // High level (destructive)
  'discord_delete_channel': PermissionLevel.HIGH,
  'discord_kick_member': PermissionLevel.HIGH,
  'discord_ban_member': PermissionLevel.HIGH,
  'discord_delete_event': PermissionLevel.HIGH,
  'discord_delete_forum_post': PermissionLevel.HIGH,
};

/**
 * Discord permission manager implementation
 */
export class DiscordPermissionManager implements IPermissionManager {
  private pendingRequests = new Map<string, PendingRequest>();

  async requestPermission(
    channel: ITextChannel | IThreadChannel,
    message: string,
    requestId: string
  ): Promise<PermissionResult> {
    // Create Approve/Deny buttons
    const approveButton = new ButtonBuilder()
      .setCustomId(`permission_approve_${requestId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success);

    const denyButton = new ButtonBuilder()
      .setCustomId(`permission_deny_${requestId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, denyButton);

    // Send permission request message using interface method
    const permissionMsg = await channel.send({
      content: `🔐 **Permission Required**\n${message}`,
      components: [row],
    });

    // Wait for user response
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        messageId: permissionMsg.id,
        timestamp: Date.now(),
      });

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

  handleApproval(requestId: string, userId: string): void {
    const request = this.pendingRequests.get(requestId);

    if (!request) {
      return;
    }

    this.pendingRequests.delete(requestId);
    request.resolve({
      approved: true,
      userId,
      timestamp: Date.now(),
    });
  }

  handleDenial(requestId: string, userId: string): void {
    const request = this.pendingRequests.get(requestId);

    if (!request) {
      return;
    }

    this.pendingRequests.delete(requestId);
    request.resolve({
      approved: false,
      userId,
      timestamp: Date.now(),
    });
  }

  getPermissionLevel(toolId: string): PermissionLevel {
    return TOOL_PERMISSIONS[toolId] || PermissionLevel.HIGH;
  }

  isPending(requestId: string): boolean {
    return this.pendingRequests.has(requestId);
  }

  cancel(requestId: string): void {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      this.pendingRequests.delete(requestId);
      request.reject(new Error('Permission request cancelled'));
    }
  }
}
