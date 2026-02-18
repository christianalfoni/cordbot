import path from 'path';
import type { IMessage } from '../interfaces/discord.js';
import type { IBotContext } from '../interfaces/core.js';
import type { ILogger } from '../interfaces/logger.js';
import type { AttachmentProcessingResult } from '../interfaces/document.js';

/**
 * File type categories for processing
 */
interface FileCategory {
  type: 'image' | 'text' | 'docx' | 'pdf' | 'unsupported';
  contentType?: string;
}

/**
 * Categorize a file based on content type and filename
 */
export function categorizeFile(contentType: string | undefined, filename: string): FileCategory {
  // Check for docx first
  if (
    contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filename.toLowerCase().endsWith('.docx')
  ) {
    return { type: 'docx', contentType };
  }

  // Check for PDF
  if (contentType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    return { type: 'pdf', contentType };
  }

  // Check for images (common image formats only)
  if (
    contentType?.startsWith('image/') ||
    filename.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)
  ) {
    return { type: 'image', contentType };
  }

  // Check for text files (common text formats only)
  if (
    contentType?.startsWith('text/') ||
    contentType === 'application/json' ||
    filename.match(/\.(txt|md|json|csv|log|yml|yaml|xml|html|css|js|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|hpp|sh)$/i)
  ) {
    return { type: 'text', contentType };
  }

  // Everything else is unsupported
  return { type: 'unsupported', contentType };
}

/**
 * Process message attachments with type awareness and document conversion
 *
 * Downloads all attachments, categorizes them by type, converts docx to markdown,
 * and returns structured information for prompt formatting.
 */
export async function processAttachments(
  message: IMessage,
  workingDir: string,
  context: IBotContext,
  logger: ILogger
): Promise<AttachmentProcessingResult> {
  const result: AttachmentProcessingResult = {
    savedFiles: [],
    unsupportedFiles: [],
  };

  for (const attachment of message.attachments.values()) {
    try {
      // Fetch the attachment
      const response = await fetch(attachment.url);
      if (!response.ok) {
        logger.error(`Failed to download attachment ${attachment.name}: ${response.statusText}`);
        continue;
      }

      // Get the file content
      const buffer = Buffer.from(await response.arrayBuffer());

      // Categorize the file first
      const category = categorizeFile(attachment.contentType, attachment.name);

      // Skip unsupported files - don't save to disk
      if (category.type === 'unsupported') {
        result.unsupportedFiles.push(attachment.name);
        logger.info(`⚠️  Skipped unsupported file: ${attachment.name} (${category.contentType || 'unknown type'})`);
        continue;
      }

      logger.info(`📎 Downloaded attachment: ${attachment.name} (${buffer.length} bytes)`);

      // Handle based on category
      if (category.type === 'docx') {
        // Convert docx to markdown and save as .md file
        const markdown = await context.documentConverter.convertDocxToMarkdown(
          buffer,
          attachment.name
        );

        if (markdown) {
          // Save as markdown file (replace .docx extension with .md)
          const mdFilename = attachment.name.replace(/\.docx$/i, '.md');
          const mdFilePath = path.join(workingDir, mdFilename);
          context.fileStore.writeFile(mdFilePath, markdown);

          result.savedFiles.push(mdFilename);
          logger.info(`📄 Converted ${attachment.name} to markdown: ${mdFilename}`);
        } else {
          logger.warn(`⚠️  Failed to convert ${attachment.name} to markdown`);
          result.unsupportedFiles.push(attachment.name);
        }
      } else if (category.type === 'pdf') {
        // Convert PDF to markdown and save as .md file
        const markdown = await context.documentConverter.convertPdfToMarkdown(
          buffer,
          attachment.name
        );

        if (markdown) {
          // Save as markdown file (replace .pdf extension with .md)
          const mdFilename = attachment.name.replace(/\.pdf$/i, '.md');
          const mdFilePath = path.join(workingDir, mdFilename);
          context.fileStore.writeFile(mdFilePath, markdown);

          result.savedFiles.push(mdFilename);
          logger.info(`📄 Converted ${attachment.name} to markdown: ${mdFilename}`);
        } else {
          logger.warn(`⚠️  Failed to convert ${attachment.name} to markdown`);
          result.unsupportedFiles.push(attachment.name);
        }
      } else {
        // Save other supported files as-is (images, text files, etc.)
        const filePath = path.join(workingDir, attachment.name);
        context.fileStore.writeFile(filePath, buffer);
        result.savedFiles.push(attachment.name);
      }
    } catch (error) {
      logger.error(`Failed to process attachment ${attachment.name}:`, error);
    }
  }

  return result;
}

/**
 * Format attachment processing result into a prompt message
 *
 * Creates a structured message that informs Claude about:
 * - Which files were saved
 * - Which documents were converted (with embedded content)
 * - Which files are unsupported and may need manual handling
 */
export function formatAttachmentPrompt(result: AttachmentProcessingResult): string {
  if (result.savedFiles.length === 0) {
    return '';
  }

  const parts: string[] = ['\n\n[Files attached:'];

  // List all saved files
  for (const filename of result.savedFiles) {
    parts.push(`- ${filename}`);
  }

  // List unsupported files that were NOT saved
  const unsavedFiles = result.unsupportedFiles.filter(
    (filename) => !result.savedFiles.includes(filename)
  );
  if (unsavedFiles.length > 0) {
    parts.push('');
    parts.push('Skipped unsupported files (not saved):');
    for (const filename of unsavedFiles) {
      parts.push(`- ${filename}`);
    }
  }

  parts.push(']');

  return parts.join('\n');
}
