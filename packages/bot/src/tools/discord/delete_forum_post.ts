import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';
import type { IPermissionManager } from '../../interfaces/permission.js';

const schema = z.object({
  postId: z.string().describe('The forum post (thread) ID to delete'),
});

export function createDeleteForumPostTool(
  client: Client,
  permissionManager: IPermissionManager,
  getCurrentChannel: () => any
) {
  return tool(
    'discord_delete_forum_post',
    'Delete a forum post/thread (requires permission)',
    schema.shape,
    async ({ postId }) => {
      try {
        const contextChannel = getCurrentChannel();
        if (!contextChannel) {
          return {
            content: [{ type: 'text', text: 'Error: No channel context available' }],
            isError: true,
          };
        }

        const thread = await client.channels.fetch(postId);

        if (!thread || !thread.isThread()) {
          return {
            content: [{ type: 'text', text: 'Error: Forum post not found' }],
            isError: true,
          };
        }

        // Request permission
        try {
          await permissionManager.requestPermission(
            contextChannel,
            `Delete forum post "${thread.name}"? This cannot be undone.`,
            `delete_forum_post_${Date.now()}`
          );
        } catch (permError) {
          return {
            content: [{ type: 'text', text: `❌ ${permError instanceof Error ? permError.message : 'Permission denied'}` }],
            isError: true,
          };
        }

        const postName = thread.name;
        await thread.delete();

        return {
          content: [{ type: 'text', text: `✅ Deleted forum post: ${postName}` }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
