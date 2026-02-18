import { Router, type Request, type Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import type { IWorkspaceShareManager, IWorkspaceFileSystem } from '../interfaces/workspace-sharing.js';
import type { IDocumentConverter } from '../interfaces/document.js';
import type { ILogger } from '../interfaces/logger.js';
import { categorizeFile } from '../discord/attachment-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_BUILD_PATH = path.join(__dirname, '../web-workspace');

/**
 * Create Express router for workspace sharing API and static files
 *
 * Provides:
 * - API endpoints for file listing, reading, and real-time updates
 * - Static file serving for React workspace viewer app
 * - Token-based access control
 *
 * @param workspaceManager - Token management
 * @param fileSystem - File operations with security controls
 * @param logger - Logger for diagnostics
 */
export function createWorkspaceRouter(
  workspaceManager: IWorkspaceShareManager,
  fileSystem: IWorkspaceFileSystem,
  documentConverter: IDocumentConverter,
  logger: ILogger
): Router {
  const router = Router();

  // Track active watchers per token
  const watchers = new Map<string, () => void>();

  // Track SSE clients per token
  const sseClients = new Map<string, Map<string, Response>>();

  /**
   * Normalize token parameter (Express can return string or string[])
   */
  function normalizeToken(token: string | string[]): string {
    return Array.isArray(token) ? token[0] : token;
  }

  /**
   * Validate token and get workspace path
   * Returns null if token is invalid/expired
   */
  function validateToken(token: string): string | null {
    const workspaceRoot = workspaceManager.getWorkspaceFromToken(token);
    if (!workspaceRoot) {
      return null;
    }
    return workspaceRoot;
  }

  /**
   * API: List files in directory
   * GET /api/workspace/:token/files?path={relativePath}
   */
  router.get('/:token/files', async (req: Request, res: Response) => {
    const token = normalizeToken(req.params.token);
    const relativePath = (req.query.path as string) || '';

    try {
      const cordbotPath = validateToken(token);
      if (!cordbotPath) {
        return res.status(404).json({ error: 'Workspace not found or token expired' });
      }

      const files = await fileSystem.listFiles(cordbotPath, relativePath);

      res.json({ files });
    } catch (error) {
      logger.error('Error listing files:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list files',
      });
    }
  });

  /**
   * API: Read file contents
   * GET /api/workspace/:token/file/*filepath
   */
  router.get('/:token/file/*filepath', async (req: Request, res: Response) => {
    const token = normalizeToken(req.params.token);

    // Extract filepath from URL path - everything after /file/
    // decodeURIComponent handles spaces and special chars (e.g. %20 → space)
    const urlPath = req.path;
    const filePrefix = `/file/`;
    const fileIndex = urlPath.indexOf(filePrefix);
    const filepath = fileIndex !== -1
      ? decodeURIComponent(urlPath.substring(fileIndex + filePrefix.length))
      : '';

    try {
      const cordbotPath = validateToken(token);
      if (!cordbotPath) {
        return res.status(404).json({ error: 'Workspace not found or token expired' });
      }

      logger.info(`Reading file: ${filepath}`);
      const content = await fileSystem.readFile(cordbotPath, filepath);

      res.json({ content, path: filepath });
    } catch (error) {
      logger.error('Error reading file:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to read file',
      });
    }
  });

  /**
   * API: Write file contents (optional for v1)
   * POST /api/workspace/:token/file/*filepath
   */
  router.post('/:token/file/*filepath', async (req: Request, res: Response) => {
    const token = normalizeToken(req.params.token);

    // Extract filepath from URL path - everything after /file/
    // decodeURIComponent handles spaces and special chars (e.g. %20 → space)
    const urlPath = req.path;
    const filePrefix = `/file/`;
    const fileIndex = urlPath.indexOf(filePrefix);
    const filepath = fileIndex !== -1
      ? decodeURIComponent(urlPath.substring(fileIndex + filePrefix.length))
      : '';

    try {
      const cordbotPath = validateToken(token);
      if (!cordbotPath) {
        return res.status(404).json({ error: 'Workspace not found or token expired' });
      }

      if (!fileSystem.writeFile) {
        return res.status(501).json({ error: 'Write operation not implemented' });
      }

      const { content } = req.body;
      if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Content must be a string' });
      }

      await fileSystem.writeFile(cordbotPath, filepath, content);

      res.json({ success: true });
    } catch (error) {
      logger.error('Error writing file:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to write file',
      });
    }
  });

  /**
   * API: Delete a file from the workspace
   * DELETE /api/workspace/:token/file/*filepath
   */
  router.delete('/:token/file/*filepath', async (req: Request, res: Response) => {
    const token = normalizeToken(req.params.token);

    const urlPath = req.path;
    const filePrefix = `/file/`;
    const fileIndex = urlPath.indexOf(filePrefix);
    const filepath = fileIndex !== -1
      ? decodeURIComponent(urlPath.substring(fileIndex + filePrefix.length))
      : '';

    if (!filepath) {
      return res.status(400).json({ error: 'Missing file path' });
    }

    try {
      const cordbotPath = validateToken(token);
      if (!cordbotPath) {
        return res.status(404).json({ error: 'Workspace not found or token expired' });
      }

      if (!fileSystem.deleteFile) {
        return res.status(501).json({ error: 'Delete operation not implemented' });
      }

      await fileSystem.deleteFile(cordbotPath, filepath);

      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting file:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete file',
      });
    }
  });

  /**
   * API: Upload a file to the workspace, converting docx/pdf to markdown
   * POST /api/workspace/:token/upload
   * Body: { filename: string, contentType: string, data: string (base64), folder?: string }
   */
  router.post('/:token/upload', async (req: Request, res: Response) => {
    const token = normalizeToken(req.params.token);
    const { filename, contentType, data: base64Data, folder = '' } = req.body;

    if (!filename || typeof base64Data !== 'string') {
      return res.status(400).json({ error: 'Missing filename or data' });
    }

    try {
      const cordbotPath = validateToken(token);
      if (!cordbotPath) {
        return res.status(404).json({ error: 'Workspace not found or token expired' });
      }

      if (!fileSystem.writeFile) {
        return res.status(501).json({ error: 'Write operation not implemented' });
      }

      const category = categorizeFile(contentType, filename);

      if (category.type === 'unsupported') {
        return res.status(400).json({ error: `Unsupported file type: ${filename}` });
      }

      if (category.type === 'image') {
        return res.status(400).json({ error: 'Image uploads are not supported in the workspace viewer' });
      }

      const buffer = Buffer.from(base64Data, 'base64');

      if (category.type === 'docx') {
        const markdown = await documentConverter.convertDocxToMarkdown(buffer, filename);
        if (!markdown) {
          return res.status(500).json({ error: 'Failed to convert DOCX to markdown' });
        }
        const mdFilename = filename.replace(/\.docx$/i, '.md');
        const relativePath = folder ? `${folder}/${mdFilename}` : mdFilename;
        await fileSystem.writeFile(cordbotPath, relativePath, markdown);
        logger.info(`📄 Uploaded and converted ${filename} → ${relativePath}`);
        return res.json({ filename: mdFilename });
      }

      if (category.type === 'pdf') {
        const markdown = await documentConverter.convertPdfToMarkdown(buffer, filename);
        if (!markdown) {
          return res.status(500).json({ error: 'Failed to convert PDF to markdown' });
        }
        const mdFilename = filename.replace(/\.pdf$/i, '.md');
        const relativePath = folder ? `${folder}/${mdFilename}` : mdFilename;
        await fileSystem.writeFile(cordbotPath, relativePath, markdown);
        logger.info(`📄 Uploaded and converted ${filename} → ${relativePath}`);
        return res.json({ filename: mdFilename });
      }

      // Text files - save as-is
      const relativePath = folder ? `${folder}/${filename}` : filename;
      const content = buffer.toString('utf-8');
      await fileSystem.writeFile(cordbotPath, relativePath, content);
      logger.info(`📄 Uploaded ${filename} → ${relativePath}`);
      return res.json({ filename });
    } catch (error) {
      logger.error('Error uploading file:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to upload file',
      });
    }
  });

  /**
   * API: Server-Sent Events for real-time file changes
   * GET /api/workspace/:token/events
   */
  router.get('/:token/events', (req: Request, res: Response) => {
    const token = normalizeToken(req.params.token);

    // Validate token
    const cordbotPath = validateToken(token);
    if (!cordbotPath) {
      return res.status(404).send('Workspace not found or token expired');
    }

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Generate client ID
    const clientId = nanoid();

    // Register client
    if (!sseClients.has(token)) {
      sseClients.set(token, new Map());
    }
    sseClients.get(token)!.set(clientId, res);
    workspaceManager.registerClient(token, clientId);

    // Send connected event
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    // Setup file watcher if this is the first client for this token
    if (!watchers.has(token)) {
      const stopWatcher = fileSystem.watchWorkspace(cordbotPath, (change) => {
        // Broadcast to all clients for this token
        const clients = sseClients.get(token);
        if (clients) {
          const data = JSON.stringify(change);
          clients.forEach((clientRes, cId) => {
            try {
              clientRes.write(`data: ${data}\n\n`);
            } catch (error) {
              // Client disconnected, will be cleaned up in 'close' handler
              logger.warn(`Failed to send to client ${cId}:`, error);
            }
          });
        }
      });

      watchers.set(token, stopWatcher);
      logger.info(`📁 Started watching workspace for token ${token.slice(0, 8)}...`);
    }

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (error) {
        clearInterval(keepAlive);
      }
    }, 30000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(keepAlive);

      // Unregister client
      workspaceManager.unregisterClient(token, clientId);
      sseClients.get(token)?.delete(clientId);

      // Stop watcher if no clients left for this token
      const remainingClients = workspaceManager.getConnectedClients(token);
      if (remainingClients.length === 0) {
        const stopWatcher = watchers.get(token);
        if (stopWatcher) {
          stopWatcher();
          watchers.delete(token);
          sseClients.delete(token);
          logger.info(`📁 Stopped watching workspace for token ${token.slice(0, 8)}...`);
        }
      }
    });
  });

  /**
   * API: Convert markdown file to DOCX or PDF and stream as download
   * GET /api/workspace/:token/convert/:format?file={relativePath}
   * Supported formats: docx, pdf
   */
  router.get('/:token/convert/:format', async (req: Request, res: Response) => {
    const token = normalizeToken(req.params.token);
    const format = req.params.format as string;
    const filepath = req.query.file as string;

    if (!filepath) {
      return res.status(400).json({ error: 'Missing required query param: file' });
    }

    if (format !== 'docx' && format !== 'pdf') {
      return res.status(400).json({ error: 'Unsupported format. Use docx or pdf' });
    }

    try {
      const cordbotPath = validateToken(token);
      if (!cordbotPath) {
        return res.status(404).json({ error: 'Workspace not found or token expired' });
      }

      const markdown = await fileSystem.readFile(cordbotPath, filepath);

      const baseName = filepath.split('/').pop()?.replace(/\.(md|markdown)$/i, '') ?? 'document';

      let buffer: Buffer | null;
      let contentType: string;
      let downloadName: string;

      if (format === 'docx') {
        buffer = await documentConverter.convertMarkdownToDocx(markdown, baseName);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        downloadName = `${baseName}.docx`;
      } else {
        buffer = await documentConverter.convertMarkdownToPdf(markdown, baseName);
        contentType = 'application/pdf';
        downloadName = `${baseName}.pdf`;
      }

      if (!buffer) {
        return res.status(500).json({ error: `Failed to convert to ${format}` });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.send(buffer);
    } catch (error) {
      logger.error(`Error converting file to ${format}:`, error);
      res.status(500).json({
        error: error instanceof Error ? error.message : `Failed to convert to ${format}`,
      });
    }
  });

  /**
   * Static: Serve React workspace viewer app
   * GET /workspace/:token
   *
   * In production, serves the built React app.
   * In development, returns message to use Vite dev server.
   */
  router.get('/:token', async (req: Request, res: Response) => {
    const token = normalizeToken(req.params.token);

    // Validate token
    const cordbotPath = validateToken(token);
    if (!cordbotPath) {
      return res.status(404).send('Workspace not found or token expired');
    }

    // Check if built files exist
    const indexPath = path.join(WORKSPACE_BUILD_PATH, 'index.html');

    try {
      await fs.access(indexPath);

      // Serve the built React app
      const html = await fs.readFile(indexPath, 'utf-8');

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      // Built files don't exist - probably in development
      res.status(500).send(
        '<html><body>' +
          '<h1>Workspace Viewer Not Built</h1>' +
          '<p>The workspace viewer frontend is not built.</p>' +
          '<h2>Development:</h2>' +
          '<p>Run <code>pnpm dev:web</code> and access the workspace at ' +
          '<code>http://localhost:5174</code></p>' +
          '<h2>Production:</h2>' +
          '<p>Run <code>pnpm build</code> to build the web service.</p>' +
          '</body></html>'
      );
    }
  });

  /**
   * Static: Serve other assets (JS, CSS, etc.)
   * This is a catch-all for static assets from the built React app
   */
  router.use((req: Request, res: Response, next) => {
    // Only serve static assets if they exist in the build directory
    const filePath = path.join(WORKSPACE_BUILD_PATH, req.path);

    fs.access(filePath)
      .then(() => {
        res.sendFile(filePath);
      })
      .catch(() => {
        // File doesn't exist, pass to next handler
        next();
      });
  });

  return router;
}
