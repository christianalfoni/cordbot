/**
 * Workspace sharing interfaces for token-based workspace access
 * Follows the Context Interface Pattern
 */

/**
 * Token metadata for workspace sharing
 */
export interface WorkspaceShareToken {
  /** Unique token identifier */
  token: string;
  /** Workspace root directory path */
  workspaceRoot: string;
  /** Channel ID that created this token */
  channelId: string;
  /** Token creation timestamp */
  createdAt: Date;
  /** Last access timestamp (for sliding window expiration) */
  lastAccessedAt: Date;
  /** Token expiration timestamp */
  expiresAt: Date;
}

/**
 * File tree node representing a file or directory
 */
export interface FileTreeNode {
  /** File or directory name */
  name: string;
  /** Relative path from cordbot root */
  path: string;
  /** Node type */
  type: 'file' | 'directory';
  /** File size in bytes (files only) */
  size?: number;
  /** Last modified timestamp */
  mtime?: Date;
  /** Child nodes for directories */
  children?: FileTreeNode[];
}

/**
 * File change event for real-time updates
 */
export interface WorkspaceFileChange {
  /** Change type */
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'connected';
  /** File path (relative to cordbot root) */
  path?: string;
  /** Change timestamp */
  timestamp?: Date;
  /** Client ID that received this event */
  clientId?: string;
}

/**
 * Workspace share manager for token-based access control
 */
export interface IWorkspaceShareManager {
  /**
   * Create a new workspace share token
   * @param workspaceRoot - Absolute path to workspace root directory
   * @param channelId - Discord channel ID that created this token
   * @returns Token string
   */
  createWorkspaceToken(workspaceRoot: string, channelId: string): string;

  /**
   * Get workspace root from token
   * Validates token and extends expiration on successful access
   * @param token - Token to validate
   * @returns Workspace root path, or null if token is invalid/expired
   */
  getWorkspaceFromToken(token: string): string | null;

  /**
   * Register an SSE client for a workspace token
   * @param token - Workspace token
   * @param clientId - Unique client identifier
   */
  registerClient(token: string, clientId: string): void;

  /**
   * Unregister an SSE client
   * @param token - Workspace token
   * @param clientId - Client identifier to remove
   */
  unregisterClient(token: string, clientId: string): void;

  /**
   * Get all connected clients for a token
   * @param token - Workspace token
   * @returns Array of client IDs
   */
  getConnectedClients(token: string): string[];

  /**
   * Revoke a token immediately
   * @param token - Token to revoke
   */
  revokeToken(token: string): void;

  /**
   * Clean up expired tokens
   * Called periodically by cleanup timer
   */
  cleanupExpiredTokens(): void;

  /**
   * Destroy the manager and clean up resources
   */
  destroy(): void;
}

/**
 * Workspace file system operations with security controls
 */
export interface IWorkspaceFileSystem {
  /**
   * List files in a directory (only within cordbot/ folder)
   * @param cordbotPath - Absolute path to cordbot directory
   * @param relativePath - Relative path within cordbot directory (empty string for root)
   * @returns Array of file tree nodes, sorted with directories first
   */
  listFiles(cordbotPath: string, relativePath: string): Promise<FileTreeNode[]>;

  /**
   * Read file contents (only within cordbot/ folder)
   * @param cordbotPath - Absolute path to cordbot directory
   * @param relativePath - Relative path to file within cordbot directory
   * @returns File contents as string
   * @throws Error if path is invalid or file doesn't exist
   */
  readFile(cordbotPath: string, relativePath: string): Promise<string>;

  /**
   * Write file contents (only within cordbot/ folder)
   * Optional for v1 - can implement later
   * @param cordbotPath - Absolute path to cordbot directory
   * @param relativePath - Relative path to file within cordbot directory
   * @param content - File contents to write
   * @throws Error if path is invalid
   */
  writeFile?(cordbotPath: string, relativePath: string, content: string): Promise<void>;

  /**
   * Delete a file (only within cordbot/ folder)
   * @param cordbotPath - Absolute path to cordbot directory
   * @param relativePath - Relative path to file within cordbot directory
   * @throws Error if path is invalid or file doesn't exist
   */
  deleteFile?(cordbotPath: string, relativePath: string): Promise<void>;

  /**
   * Delete a folder and all its contents (only within cordbot/ folder)
   * @param cordbotPath - Absolute path to cordbot directory
   * @param relativePath - Relative path to folder within cordbot directory
   * @throws Error if path is invalid or folder doesn't exist
   */
  deleteFolder?(cordbotPath: string, relativePath: string): Promise<void>;

  /**
   * Create a new empty folder (only within cordbot/ folder)
   * @param cordbotPath - Absolute path to cordbot directory
   * @param relativePath - Relative path for the new folder within cordbot directory
   * @throws Error if path is invalid or folder already exists
   */
  createFolder?(cordbotPath: string, relativePath: string): Promise<void>;

  /**
   * Move a file or folder to a different folder (only within cordbot/ folder)
   * @param cordbotPath - Absolute path to cordbot directory
   * @param sourcePath - Relative path of the item to move
   * @param destinationFolder - Relative path of the destination folder (empty string = root)
   * @throws Error if source not found, destination invalid, or move into self/descendant
   */
  move?(cordbotPath: string, sourcePath: string, destinationFolder: string): Promise<void>;

  /**
   * Check if a relative path is allowed (security validation)
   * @param relativePath - Path to validate
   * @returns True if path is safe to access
   */
  isPathAllowed(relativePath: string): boolean;

  /**
   * Watch workspace for file changes
   * @param cordbotPath - Absolute path to cordbot directory to watch
   * @param onChange - Callback for file change events
   * @returns Cleanup function to stop watching
   */
  watchWorkspace(
    cordbotPath: string,
    onChange: (change: WorkspaceFileChange) => void
  ): () => void;
}
