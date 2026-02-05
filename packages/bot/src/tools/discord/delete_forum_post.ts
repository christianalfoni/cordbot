import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  postId: z.string().describe('The forum post (thread) ID to delete'),
});

export function createDeleteForumPostTool(
  client: Client,
  getCurrentChannel: () => any
) {
  return tool(
    'discord_delete_forum_post',
    'Delete a forum post/thread (requires permission)',
    schema.shape,
    async ({ postId }) => {
      try {
        const thread = await client.channels.fetch(postId);

        if (!thread || !thread.isThread()) {
          return {
            content: [{ type: 'text', text: 'Error: Forum post not found' }],
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
