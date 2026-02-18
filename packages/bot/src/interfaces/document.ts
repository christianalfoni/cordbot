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
   * Convert a PDF document to markdown
   * @returns markdown string or null if conversion fails
   */
  convertPdfToMarkdown(buffer: Buffer, filename: string): Promise<string | null>;

  /**
   * Convert markdown to a Word document (docx)
   * @returns docx buffer or null if conversion fails
   */
  convertMarkdownToDocx(markdown: string, filename: string): Promise<Buffer | null>;

  /**
   * Convert markdown to PDF
   * Requires a PDF engine (e.g. wkhtmltopdf or xelatex) accessible to pandoc
   * @returns pdf buffer or null if conversion fails
   */
  convertMarkdownToPdf(markdown: string, filename: string): Promise<Buffer | null>;
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
   * Files that are unsupported and may require manual handling
   */
  unsupportedFiles: string[];
}
