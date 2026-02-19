import { promises as fs } from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import type {
  IWorkspaceFileSystem,
  FileTreeNode,
  WorkspaceFileChange,
} from '../../interfaces/workspace-sharing.js';

/**
 * Workspace file system implementation with security controls
 *
 * Provides secure file operations scoped to the cordbot/ directory only.
 * Implements path traversal protection and file watching.
 */
export class WorkspaceFileSystem implements IWorkspaceFileSystem {
  /**
   * Check if a relative path is allowed (security validation)
   * Rejects path traversal attempts and absolute paths
   */
  isPathAllowed(relativePath: string): boolean {
    // Reject empty paths
    if (!relativePath || relativePath === '.') {
      return true; // Empty path is root directory, which is allowed
    }

    // Reject absolute paths
    if (path.isAbsolute(relativePath)) {
      return false;
    }

    // Reject path traversal attempts
    if (relativePath.includes('..')) {
      return false;
    }

    // Normalize and ensure no funny business
    const normalized = path.normalize(relativePath);
    if (normalized.includes('..') || normalized.startsWith('/')) {
      return false;
    }

    return true;
  }

  /**
   * Resolve and validate a path within the cordbot directory
   * @throws Error if path is invalid or attempts to escape cordbot directory
   */
  private async resolveSafePath(cordbotPath: string, relativePath: string): Promise<string> {
    if (!this.isPathAllowed(relativePath)) {
      throw new Error('Invalid path: path traversal detected');
    }

    const fullPath = path.join(cordbotPath, relativePath);

    // Verify the resolved path is actually within cordbotPath
    const realCordbotPath = await fs.realpath(cordbotPath);
    let realFullPath: string;

    try {
      realFullPath = await fs.realpath(fullPath);
    } catch (error) {
      // File doesn't exist yet - that's ok for some operations
      // Just verify the parent directory is within bounds
      const parentDir = path.dirname(fullPath);
      try {
        const realParentPath = await fs.realpath(parentDir);
        if (!realParentPath.startsWith(realCordbotPath)) {
          throw new Error('Invalid path: outside cordbot directory');
        }
      } catch {
        throw new Error('Invalid path: parent directory does not exist');
      }
      return fullPath;
    }

    // Verify the real path is within the cordbot directory
    if (!realFullPath.startsWith(realCordbotPath)) {
      throw new Error('Invalid path: outside cordbot directory');
    }

    return realFullPath;
  }

  async listFiles(cordbotPath: string, relativePath: string = ''): Promise<FileTreeNode[]> {
    const targetPath = await this.resolveSafePath(cordbotPath, relativePath);

    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });

      const nodes: FileTreeNode[] = [];

      for (const entry of entries) {
        const entryRelativePath = relativePath
          ? path.join(relativePath, entry.name)
          : entry.name;

        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            path: entryRelativePath,
            type: 'directory',
          });
        } else if (entry.isFile()) {
          const stats = await fs.stat(path.join(targetPath, entry.name));
          nodes.push({
            name: entry.name,
            path: entryRelativePath,
            type: 'file',
            size: stats.size,
            mtime: stats.mtime,
          });
        }
      }

      // Sort: directories first, then files, alphabetically within each group
      nodes.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });

      return nodes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Directory not found: ${relativePath || '/'}`);
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') {
        throw new Error(`Not a directory: ${relativePath}`);
      }
      throw error;
    }
  }

  async readFile(cordbotPath: string, relativePath: string): Promise<string> {
    const targetPath = await this.resolveSafePath(cordbotPath, relativePath);

    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${relativePath}`);
      }
      if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
        throw new Error(`Cannot read directory as file: ${relativePath}`);
      }
      throw error;
    }
  }

  async writeFile(cordbotPath: string, relativePath: string, content: string): Promise<void> {
    const targetPath = await this.resolveSafePath(cordbotPath, relativePath);

    // Ensure parent directory exists
    const parentDir = path.dirname(targetPath);
    await fs.mkdir(parentDir, { recursive: true });

    await fs.writeFile(targetPath, content, 'utf-8');
  }

  async deleteFile(cordbotPath: string, relativePath: string): Promise<void> {
    const targetPath = await this.resolveSafePath(cordbotPath, relativePath);

    try {
      await fs.unlink(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${relativePath}`);
      }
      if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
        throw new Error(`Cannot delete directory as file: ${relativePath}`);
      }
      throw error;
    }
  }

  async createFolder(cordbotPath: string, relativePath: string): Promise<void> {
    if (!relativePath) {
      throw new Error('Cannot create folder at workspace root');
    }

    const targetPath = await this.resolveSafePath(cordbotPath, relativePath);

    try {
      await fs.mkdir(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Folder already exists: ${relativePath}`);
      }
      throw error;
    }
  }

  async move(cordbotPath: string, sourcePath: string, destinationFolder: string): Promise<void> {
    const sourceFull = await this.resolveSafePath(cordbotPath, sourcePath);
    const destDirFull = await this.resolveSafePath(cordbotPath, destinationFolder);
    const name = path.basename(sourceFull);
    const destFull = path.join(destDirFull, name);

    // Prevent moving into itself or a descendant
    if (destFull === sourceFull || destFull.startsWith(sourceFull + path.sep)) {
      throw new Error('Cannot move a folder into itself or its descendant');
    }

    // Skip no-op moves (already in destination)
    if (path.dirname(sourceFull) === destDirFull) {
      return;
    }

    try {
      await fs.rename(sourceFull, destFull);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Source not found: ${sourcePath}`);
      }
      throw error;
    }
  }

  async deleteFolder(cordbotPath: string, relativePath: string): Promise<void> {
    if (!relativePath) {
      throw new Error('Cannot delete the workspace root directory');
    }

    const targetPath = await this.resolveSafePath(cordbotPath, relativePath);

    try {
      await fs.rm(targetPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Folder not found: ${relativePath}`);
      }
      throw error;
    }
  }

  watchWorkspace(
    cordbotPath: string,
    onChange: (change: WorkspaceFileChange) => void
  ): () => void {
    // Watch the cordbot directory
    const watcher = chokidar.watch(cordbotPath, {
      persistent: true,
      ignoreInitial: true, // Don't emit events for existing files
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    // Helper to convert absolute path to relative path
    const getRelativePath = (absolutePath: string): string => {
      return path.relative(cordbotPath, absolutePath);
    };

    // File added
    watcher.on('add', (filePath: string) => {
      onChange({
        type: 'add',
        path: getRelativePath(filePath),
        timestamp: new Date(),
      });
    });

    // File changed
    watcher.on('change', (filePath: string) => {
      onChange({
        type: 'change',
        path: getRelativePath(filePath),
        timestamp: new Date(),
      });
    });

    // File removed
    watcher.on('unlink', (filePath: string) => {
      onChange({
        type: 'unlink',
        path: getRelativePath(filePath),
        timestamp: new Date(),
      });
    });

    // Directory added
    watcher.on('addDir', (dirPath: string) => {
      onChange({
        type: 'addDir',
        path: getRelativePath(dirPath),
        timestamp: new Date(),
      });
    });

    // Directory removed
    watcher.on('unlinkDir', (dirPath: string) => {
      onChange({
        type: 'unlinkDir',
        path: getRelativePath(dirPath),
        timestamp: new Date(),
      });
    });

    // Return cleanup function
    return () => {
      watcher.close();
    };
  }
}
