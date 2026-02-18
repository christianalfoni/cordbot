import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryWorkspaceShareManager } from '../implementations/workspace-sharing/memory-manager.js';
import { WorkspaceFileSystem } from '../implementations/workspace-sharing/file-system.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('MemoryWorkspaceShareManager', () => {
  let manager: MemoryWorkspaceShareManager;

  beforeEach(() => {
    manager = new MemoryWorkspaceShareManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Token Management', () => {
    it('should create a workspace token', () => {
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should retrieve workspace from valid token', () => {
      const workspaceRoot = '/workspace/cordbot';
      const token = manager.createWorkspaceToken(workspaceRoot, 'channel-123');

      const retrieved = manager.getWorkspaceFromToken(token);

      expect(retrieved).toBe(workspaceRoot);
    });

    it('should return null for invalid token', () => {
      const retrieved = manager.getWorkspaceFromToken('invalid-token');

      expect(retrieved).toBeNull();
    });

    it('should extend token expiration on access', async () => {
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      // First access
      const retrieved1 = manager.getWorkspaceFromToken(token);
      expect(retrieved1).toBe('/workspace/cordbot');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second access should extend expiration
      const retrieved2 = manager.getWorkspaceFromToken(token);
      expect(retrieved2).toBe('/workspace/cordbot');
    });

    it('should revoke token', () => {
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      manager.revokeToken(token);

      const retrieved = manager.getWorkspaceFromToken(token);
      expect(retrieved).toBeNull();
    });
  });

  describe('Client Management', () => {
    it('should register client', () => {
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      manager.registerClient(token, 'client-1');

      const clients = manager.getConnectedClients(token);
      expect(clients).toEqual(['client-1']);
    });

    it('should register multiple clients', () => {
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      manager.registerClient(token, 'client-1');
      manager.registerClient(token, 'client-2');

      const clients = manager.getConnectedClients(token);
      expect(clients).toHaveLength(2);
      expect(clients).toContain('client-1');
      expect(clients).toContain('client-2');
    });

    it('should unregister client', () => {
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      manager.registerClient(token, 'client-1');
      manager.registerClient(token, 'client-2');
      manager.unregisterClient(token, 'client-1');

      const clients = manager.getConnectedClients(token);
      expect(clients).toEqual(['client-2']);
    });

    it('should return empty array for token with no clients', () => {
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      const clients = manager.getConnectedClients(token);
      expect(clients).toEqual([]);
    });

    it('should clean up clients when token is revoked', () => {
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      manager.registerClient(token, 'client-1');
      manager.revokeToken(token);

      const clients = manager.getConnectedClients(token);
      expect(clients).toEqual([]);
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired tokens', async () => {
      // Create a token and manually set it to expired
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      // Access the private tokens map to manipulate expiry
      const tokensMap = (manager as any).tokens;
      const tokenData = tokensMap.get(token);
      tokenData.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago

      manager.cleanupExpiredTokens();

      const retrieved = manager.getWorkspaceFromToken(token);
      expect(retrieved).toBeNull();
    });

    it('should not clean up valid tokens', () => {
      const token = manager.createWorkspaceToken('/workspace/cordbot', 'channel-123');

      manager.cleanupExpiredTokens();

      const retrieved = manager.getWorkspaceFromToken(token);
      expect(retrieved).toBe('/workspace/cordbot');
    });
  });
});

describe('WorkspaceFileSystem', () => {
  let fileSystem: WorkspaceFileSystem;
  let tempDir: string;
  let cordbotPath: string;

  beforeEach(async () => {
    fileSystem = new WorkspaceFileSystem();

    // Create temporary directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
    cordbotPath = tempDir;

    // Create test directory structure
    await fs.mkdir(path.join(cordbotPath, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(cordbotPath, 'file1.txt'), 'Hello World');
    await fs.writeFile(path.join(cordbotPath, 'file2.md'), '# Markdown');
    await fs.writeFile(path.join(cordbotPath, 'subdir', 'nested.txt'), 'Nested file');
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Path Validation', () => {
    it('should allow empty path', () => {
      expect(fileSystem.isPathAllowed('')).toBe(true);
    });

    it('should allow normal relative paths', () => {
      expect(fileSystem.isPathAllowed('file.txt')).toBe(true);
      expect(fileSystem.isPathAllowed('subdir/file.txt')).toBe(true);
    });

    it('should reject path traversal attempts with ..', () => {
      expect(fileSystem.isPathAllowed('../file.txt')).toBe(false);
      expect(fileSystem.isPathAllowed('subdir/../../file.txt')).toBe(false);
    });

    it('should reject absolute paths', () => {
      expect(fileSystem.isPathAllowed('/etc/passwd')).toBe(false);
      expect(fileSystem.isPathAllowed('/home/user/file.txt')).toBe(false);
    });
  });

  describe('List Files', () => {
    it('should list files in root directory', async () => {
      const files = await fileSystem.listFiles(cordbotPath, '');

      expect(files).toHaveLength(3);

      // Should have subdir (directory) first, then files alphabetically
      expect(files[0].name).toBe('subdir');
      expect(files[0].type).toBe('directory');

      expect(files[1].name).toBe('file1.txt');
      expect(files[1].type).toBe('file');

      expect(files[2].name).toBe('file2.md');
      expect(files[2].type).toBe('file');
    });

    it('should list files in subdirectory', async () => {
      const files = await fileSystem.listFiles(cordbotPath, 'subdir');

      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('nested.txt');
      expect(files[0].type).toBe('file');
    });

    it('should include file size for files', async () => {
      const files = await fileSystem.listFiles(cordbotPath, '');

      const file1 = files.find((f) => f.name === 'file1.txt');
      expect(file1?.size).toBe(11); // "Hello World" = 11 bytes
    });

    it('should throw error for nonexistent directory', async () => {
      await expect(fileSystem.listFiles(cordbotPath, 'nonexistent')).rejects.toThrow(
        'Directory not found'
      );
    });
  });

  describe('Read File', () => {
    it('should read file contents', async () => {
      const content = await fileSystem.readFile(cordbotPath, 'file1.txt');

      expect(content).toBe('Hello World');
    });

    it('should read nested file contents', async () => {
      const content = await fileSystem.readFile(cordbotPath, 'subdir/nested.txt');

      expect(content).toBe('Nested file');
    });

    it('should throw error for nonexistent file', async () => {
      await expect(fileSystem.readFile(cordbotPath, 'nonexistent.txt')).rejects.toThrow(
        'File not found'
      );
    });

    it('should reject path traversal attempts', async () => {
      await expect(fileSystem.readFile(cordbotPath, '../outside.txt')).rejects.toThrow(
        'Invalid path'
      );
    });
  });

  describe('Write File', () => {
    it('should write file contents', async () => {
      await fileSystem.writeFile(cordbotPath, 'newfile.txt', 'New content');

      const content = await fs.readFile(path.join(cordbotPath, 'newfile.txt'), 'utf-8');
      expect(content).toBe('New content');
    });

    it('should create parent directories if needed', async () => {
      await fileSystem.writeFile(cordbotPath, 'newdir/newfile.txt', 'Nested content');

      const content = await fs.readFile(
        path.join(cordbotPath, 'newdir', 'newfile.txt'),
        'utf-8'
      );
      expect(content).toBe('Nested content');
    });

    it('should overwrite existing files', async () => {
      await fileSystem.writeFile(cordbotPath, 'file1.txt', 'Updated content');

      const content = await fs.readFile(path.join(cordbotPath, 'file1.txt'), 'utf-8');
      expect(content).toBe('Updated content');
    });

    it('should reject path traversal attempts', async () => {
      await expect(
        fileSystem.writeFile(cordbotPath, '../outside.txt', 'Bad content')
      ).rejects.toThrow('Invalid path');
    });
  });

  describe('Watch Workspace', () => {
    it('should detect file additions', async () => {
      const changes: any[] = [];
      const stopWatcher = fileSystem.watchWorkspace(cordbotPath, (change) => {
        changes.push(change);
      });

      // Give watcher time to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add a new file
      await fs.writeFile(path.join(cordbotPath, 'watched.txt'), 'Watched content');

      // Wait for watcher to detect change
      await new Promise((resolve) => setTimeout(resolve, 200));

      stopWatcher();

      expect(changes.length).toBeGreaterThan(0);
      const addChange = changes.find((c) => c.type === 'add' && c.path.includes('watched.txt'));
      expect(addChange).toBeDefined();
    });

    it('should detect file changes', async () => {
      const changes: any[] = [];
      const stopWatcher = fileSystem.watchWorkspace(cordbotPath, (change) => {
        changes.push(change);
      });

      // Give watcher time to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Modify existing file
      await fs.writeFile(path.join(cordbotPath, 'file1.txt'), 'Modified content');

      // Wait for watcher to detect change
      await new Promise((resolve) => setTimeout(resolve, 200));

      stopWatcher();

      expect(changes.length).toBeGreaterThan(0);
      const changeEvent = changes.find(
        (c) => c.type === 'change' && c.path.includes('file1.txt')
      );
      expect(changeEvent).toBeDefined();
    });

    it('should stop watching after cleanup', async () => {
      const changes: any[] = [];
      const stopWatcher = fileSystem.watchWorkspace(cordbotPath, (change) => {
        changes.push(change);
      });

      // Give watcher time to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Stop watching
      stopWatcher();

      // Add file after stopping
      await fs.writeFile(path.join(cordbotPath, 'after-stop.txt'), 'Should not detect');

      // Wait
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should not have detected the change
      const addChange = changes.find((c) => c.path?.includes('after-stop.txt'));
      expect(addChange).toBeUndefined();
    });
  });
});
