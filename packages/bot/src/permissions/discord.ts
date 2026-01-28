import { ThreadChannel, TextChannel, ButtonBuilder, ActionRowBuilder, ButtonStyle, ButtonInteraction } from 'discord.js';

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  messageId: string;
}

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
