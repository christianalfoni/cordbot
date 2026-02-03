/**
 * File system operations interface
 * Abstracts all file I/O operations from application logic
 */
export interface IFileStore {
  /**
   * Check if a file or directory exists
   */
  exists(path: string): boolean;

  /**
   * Read file contents as string
   */
  readFile(path: string, encoding?: BufferEncoding): string;

  /**
   * Write content to a file
   */
  writeFile(path: string, content: string | Buffer, encoding?: BufferEncoding): void;

  /**
   * Append content to a file
   */
  appendFile(path: string, content: string, encoding?: BufferEncoding): void;

  /**
   * Delete a file
   */
  deleteFile(path: string): void;

  /**
   * Delete a directory recursively
   */
  deleteDirectory(path: string): void;

  /**
   * Create a directory (recursively if needed)
   */
  createDirectory(path: string): void;

  /**
   * List files in a directory
   */
  readDirectory(path: string): string[];

  /**
   * Get file stats
   */
  getStats(path: string): {
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: Date;
  };
}

/**
 * Async version of file store operations
 */
export interface IFileStoreAsync {
  exists(path: string): Promise<boolean>;
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;
  writeFile(path: string, content: string | Buffer, encoding?: BufferEncoding): Promise<void>;
  appendFile(path: string, content: string, encoding?: BufferEncoding): Promise<void>;
  deleteFile(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  readDirectory(path: string): Promise<string[]>;
  getStats(path: string): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: Date;
  }>;
}
