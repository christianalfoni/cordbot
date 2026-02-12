import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client } from 'discord.js';

const schema = z.object({
  newName: z.string().describe('The new name for the thread (max 100 characters)'),
});

export function createUpdateThreadNameTool(
  client: Client,
  getCurrentChannel: () => any
) {
  return tool(
    'discord_update_thread_name',
    'Update the name of the current thread to better reflect the conversation context',
    schema.shape,
    async ({ newName }) => {
      try {
        // Get current channel context
        const contextChannel = getCurrentChannel();
        if (!contextChannel) {
          return {
            content: [{ type: 'text', text: 'Error: No channel context available' }],
            isError: true,
          };
        }

        // Verify we're in a thread
        if (!contextChannel.isThread()) {
          return {
            content: [{ type: 'text', text: 'Error: Can only update thread names, not channel names' }],
            isError: true,
          };
        }

        // Validate name length
        if (newName.length > 100) {
          return {
            content: [{ type: 'text', text: 'Error: Thread name must be 100 characters or less' }],
            isError: true,
          };
        }

        // Update the name
        const oldName = contextChannel.name;
        await contextChannel.setName(newName);

        return {
          content: [{ type: 'text', text: `✅ Updated thread name from "${oldName}" to "${newName}"` }],
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
