import path from 'path';
import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

const schema = z.object({
  filePath: z.string().describe('Path to the file (relative to working directory)'),
});

/**
 * Create the create_share_link tool
 *
 * Allows Claude to create shareable HTTP links for files in the workspace.
 * Links expire after 1 hour but are extended on each access.
 */
export function createTool(
  getCordbotWorkingDir: () => string,
  getCurrentChannelId: () => string,
  createShareToken: (filePath: string, channelId: string) => string,
  getBaseUrl: () => string
) {
  return tool(
    'create_share_link',
    'Create a shareable HTTP link for a file in the working directory. The link expires after 1 hour but is extended on each access. Useful for sharing files that can be previewed in a browser (markdown, text, images, etc.).',
    schema.shape,
    async (input) => {
      const workingDir = getCordbotWorkingDir();

      // Resolve the file path
      const absolutePath = path.isAbsolute(input.filePath)
        ? input.filePath
        : path.join(workingDir, input.filePath);

      // Check if file exists
      const fs = await import('fs');
      if (!fs.existsSync(absolutePath)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Error: File not found: ${input.filePath}`,
            },
          ],
        };
      }

      // Create share token
      const channelId = getCurrentChannelId();
      const token = createShareToken(absolutePath, channelId);

      // Generate shareable URL
      const baseUrl = getBaseUrl();
      const shareUrl = `${baseUrl}/share/${token}`;

      const fileName = path.basename(input.filePath);

      return {
        content: [
          {
            type: 'text' as const,
            text: `✅ Created shareable link for ${fileName}:\n${shareUrl}\n\nNote: Link expires in 1 hour but extends on each access.`,
          },
        ],
      };
    }
  );
}
