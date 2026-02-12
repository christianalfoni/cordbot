import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { IDocumentConverter } from '../../interfaces/document.js';

/**
 * Document converter implementation using mammoth, turndown, and markdown-to-docx
 *
 * Wraps external document processing libraries according to the Context Interface Pattern.
 */
export class DocumentConverter implements IDocumentConverter {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
  }

  isSupportedFileType(contentType?: string, filename?: string): boolean {
    if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return true;
    }

    if (filename?.toLowerCase().endsWith('.docx')) {
      return true;
    }

    return false;
  }

  async convertDocxToMarkdown(buffer: Buffer, filename: string): Promise<string | null> {
    try {
      const result = await mammoth.convertToHtml({ buffer });
      const markdown = this.turndownService.turndown(result.value);
      return markdown;
    } catch (error) {
      console.error(`Failed to convert ${filename} to markdown:`, error);
      return null;
    }
  }

  async convertMarkdownToDocx(markdown: string, filename: string): Promise<Buffer | null> {
    // Use Pandoc CLI directly - node-pandoc wrapper corrupts binary data
    // See: https://github.com/your-repo/issues/xxx (binary data issue)
    const tempId = randomBytes(8).toString('hex');
    const tempMdPath = join(tmpdir(), `${tempId}.md`);
    const tempDocxPath = join(tmpdir(), `${tempId}.docx`);

    try {
      // Write markdown to temp file
      writeFileSync(tempMdPath, markdown, 'utf-8');

      // Convert using Pandoc CLI directly (avoids node-pandoc's binary corruption)
      execSync(`pandoc -f markdown -t docx "${tempMdPath}" -o "${tempDocxPath}"`, {
        encoding: 'utf-8',
      });

      // Read the result as a buffer (binary data)
      const buffer = readFileSync(tempDocxPath);

      return buffer;
    } catch (error) {
      console.error(`Failed to convert ${filename} to docx:`, error);
      return null;
    } finally {
      // Cleanup temp files
      try {
        unlinkSync(tempMdPath);
      } catch {}
      try {
        unlinkSync(tempDocxPath);
      } catch {}
    }
  }
}
