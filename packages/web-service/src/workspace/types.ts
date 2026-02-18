/**
 * TypeScript types for workspace viewer
 * Matches backend interfaces
 */

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtime?: Date;
  children?: FileTreeNode[];
}

export interface WorkspaceFileChange {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'connected';
  path?: string;
  timestamp?: Date;
  clientId?: string;
}

export interface FileContent {
  content: string;
  path: string;
}
