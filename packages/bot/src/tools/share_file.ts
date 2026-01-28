import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';

const schema = z.object({
  filePath: z.string().describe('Path to file to share with the user via Discord attachment. Can be an absolute path or relative to current working directory.')
});

export function createTool(getCwd: () => string, queueFileForSharing: (filePath: string) => void) {
  return tool(
    'shareFile',
    'Share a file with the user by attaching it to Discord. The file will be attached after your response completes. Use this to send generated diagrams, reports, code files, or any other files you want to share. Accepts absolute paths or paths relative to the current working directory.',
    schema.shape,
    async ({ filePath }) => {
      try {
        const cwd = getCwd();

        // If path is absolute, use it directly; otherwise join with cwd
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);

        // Validate file exists
        try {
          await fs.access(fullPath);
        } catch {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `File not found: ${filePath}`,
                  attemptedPath: fullPath,
                  workingDirectory: cwd
                }, null, 2)
              }
            ],
            isError: true
          };
        }

        // Queue the file for attachment
        queueFileForSharing(fullPath);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: `File "${filePath}" will be attached to Discord after response completes`
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Failed to queue file: ${error instanceof Error ? error.message : 'Unknown error'}`
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );
}
