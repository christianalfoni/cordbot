import { ThreadChannel, TextChannel, ButtonBuilder, ActionRowBuilder, ButtonStyle, ButtonInteraction } from 'discord.js';

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  messageId: string;
}

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
  'discord_list_events': PermissionLevel.LOW,
  'discord_get_event': PermissionLevel.LOW,
  'discord_get_event_users': PermissionLevel.LOW,
  'discord_get_poll_results': PermissionLevel.LOW,
  'discord_list_forum_posts': PermissionLevel.LOW,
  'discord_create_forum_post': PermissionLevel.LOW,

  // Ask permission (modifications)
  'discord_create_channel': PermissionLevel.MEDIUM,
  'discord_assign_role': PermissionLevel.MEDIUM,
  'discord_remove_role': PermissionLevel.MEDIUM,
  'discord_create_role': PermissionLevel.MEDIUM,
  'discord_create_event': PermissionLevel.MEDIUM,
  'discord_create_poll': PermissionLevel.MEDIUM,
  'discord_create_forum_channel': PermissionLevel.MEDIUM,

  // Ask permission + log (destructive)
  'discord_delete_channel': PermissionLevel.HIGH,
  'discord_kick_member': PermissionLevel.HIGH,
  'discord_ban_member': PermissionLevel.HIGH,
  'discord_delete_event': PermissionLevel.HIGH,
  'discord_delete_forum_post': PermissionLevel.HIGH,
};

export class DiscordPermissionManager {
  private pendingRequests = new Map<string, PendingRequest>();

  /**
   * Request permission from user via Discord buttons
   * Returns a promise that resolves if approved, rejects if denied
   */
  async requestPermission(
    channel: ThreadChannel | TextChannel,
    message: string,
    requestId: string
  ): Promise<void> {
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

    // Send permission request message
    const permissionMsg = await channel.send({
      content: `🔐 **Permission Required**\n${message}`,
      components: [row],
    });

    // Wait for user response
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        messageId: permissionMsg.id
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

  /**
   * Handle permission response from button interaction
   * Returns true if handled successfully, false if not found
   */
  handlePermissionResponse(requestId: string, approved: boolean): boolean {
    const request = this.pendingRequests.get(requestId);

    if (!request) {
      return false;
    }

    // Remove from map and resolve/reject
    this.pendingRequests.delete(requestId);

    if (approved) {
      request.resolve();
    } else {
      request.reject(new Error('Permission denied by user'));
    }

    return true;
  }

  /**
   * Check if a request ID is pending
   */
  hasPendingRequest(requestId: string): boolean {
    return this.pendingRequests.has(requestId);
  }
}
