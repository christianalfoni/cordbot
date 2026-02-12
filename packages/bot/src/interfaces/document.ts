/**
 * Document converter interface
 *
 * Provides capabilities for converting between different document formats,
 * particularly for handling docx files with Claude.
 */
export interface IDocumentConverter {
  /**
   * Check if a file type is supported for conversion
   */
  isSupportedFileType(contentType?: string, filename?: string): boolean;

  /**
   * Convert a Word document (docx) to markdown
   * @returns markdown string or null if conversion fails
   */
  convertDocxToMarkdown(buffer: Buffer, filename: string): Promise<string | null>;

  /**
   * Convert markdown to a Word document (docx)
   * @returns docx buffer or null if conversion fails
   */
  convertMarkdownToDocx(markdown: string, filename: string): Promise<Buffer | null>;
}

/**
 * Result of processing message attachments
 */
export interface AttachmentProcessingResult {
  /**
   * Files that were saved to the working directory
   */
  savedFiles: string[];

  /**
   * Documents that were converted and embedded in the prompt
   */
  embeddedContent: Array<{
    filename: string;
    type: 'docx';
    content: string;
  }>;

  /**
   * Files that are unsupported and may require manual handling
   */
  unsupportedFiles: string[];
}
