import path from 'path';
import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

const schema = z.object({
  markdownFilePath: z.string().describe('Path to the markdown file (relative to working directory)'),
  outputFileName: z.string().optional().describe('Optional output filename (defaults to same name with .docx extension)'),
});

/**
 * Create the generate_docx tool
 *
 * Allows Claude to convert markdown files to Word documents (.docx)
 * and automatically queue them for sharing in Discord.
 */
export function createTool(
  getCordbotWorkingDir: () => string,
  queueFileForSharing: (filePath: string) => void,
  convertMarkdownToDocx: (markdown: string, filename: string) => Promise<Buffer | null>
) {
  return tool(
    'generate_docx',
    'Convert a markdown file to a Word document (.docx). The generated document will be saved to the working directory and automatically attached to your response in Discord.',
    schema.shape,
    async (input) => {
      const workingDir = getCordbotWorkingDir();

      // Resolve the markdown file path
      const markdownPath = path.isAbsolute(input.markdownFilePath)
        ? input.markdownFilePath
        : path.join(workingDir, input.markdownFilePath);

      // Check if file exists
      const fs = await import('fs');
      if (!fs.existsSync(markdownPath)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Error: File not found: ${input.markdownFilePath}`,
            },
          ],
        };
      }

      // Read the markdown content
      const markdown = fs.readFileSync(markdownPath, 'utf-8');

      // Determine output filename
      const outputFileName = input.outputFileName
        ? input.outputFileName.toLowerCase().endsWith('.docx')
          ? input.outputFileName
          : `${input.outputFileName}.docx`
        : `${path.basename(input.markdownFilePath, path.extname(input.markdownFilePath))}.docx`;

      // Convert to docx
      const docxBuffer = await convertMarkdownToDocx(markdown, outputFileName);

      if (!docxBuffer) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Error: Failed to convert markdown to docx. The file may contain unsupported formatting.`,
            },
          ],
        };
      }

      // Save to working directory
      const outputPath = path.join(workingDir, outputFileName);
      fs.writeFileSync(outputPath, docxBuffer);

      // Queue for Discord sharing
      queueFileForSharing(outputPath);

      return {
        content: [
          {
            type: 'text' as const,
            text: `✅ Successfully created ${outputFileName} from ${input.markdownFilePath}. The document will be attached to this message.`,
          },
        ],
      };
    }
  );
}
