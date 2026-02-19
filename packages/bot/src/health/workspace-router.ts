import { Router, type Request, type Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import type { IWorkspaceFileSystem } from '../interfaces/workspace-sharing.js';
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
 * - JWT-based access control
 *
 * @param cordbotPath - Absolute path to the bot's cordbot working directory
 * @param jwtSecret - WORKSPACE_JWT_SECRET for verifying JWTs
 * @param fileSystem - File operations with security controls
 * @param documentConverter - Document conversion
 * @param logger - Logger for diagnostics
 */
export function createWorkspaceRouter(
  cordbotPath: string,
  jwtSecret: string,
  fileSystem: IWorkspaceFileSystem,
  documentConverter: IDocumentConverter,
  logger: ILogger
): Router {
  const router = Router();

  // Track active watchers per guildId
  const watchers = new Map<string, () => void>();

  // Track SSE clients per guildId
  const sseClients = new Map<string, Map<string, Response>>();

  /**
   * Validate JWT from Authorization header or ?token query param
   * Returns true if the token is valid and scoped to the given guildId
   */
  function validateAuth(req: Request, guildId: string): boolean {
    if (!jwtSecret) return false;

    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;

    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : queryToken;

    if (!token) return false;

    try {
      const payload = jwt.verify(token, jwtSecret) as { guildId: string };
      return payload.guildId === guildId;
    } catch {
      return false; // expired or invalid signature
    }
  }

  /**
   * API: List files in directory
   * GET /api/workspace/:guildId/files?path={relativePath}
   */
  router.get('/:guildId/files', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);
    const relativePath = (req.query.path as string) || '';

    if (!validateAuth(req, guildId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
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
   * GET /api/workspace/:guildId/file/*filepath
   */
  router.get('/:guildId/file/*filepath', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);

    if (!validateAuth(req, guildId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Extract filepath from URL path - everything after /file/
    const urlPath = req.path;
    const filePrefix = `/file/`;
    const fileIndex = urlPath.indexOf(filePrefix);
    const filepath = fileIndex !== -1
      ? decodeURIComponent(urlPath.substring(fileIndex + filePrefix.length))
      : '';

    try {
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
   * API: Write file contents
   * POST /api/workspace/:guildId/file/*filepath
   */
  router.post('/:guildId/file/*filepath', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);

    if (!validateAuth(req, guildId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const urlPath = req.path;
    const filePrefix = `/file/`;
    const fileIndex = urlPath.indexOf(filePrefix);
    const filepath = fileIndex !== -1
      ? decodeURIComponent(urlPath.substring(fileIndex + filePrefix.length))
      : '';

    try {
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
   * DELETE /api/workspace/:guildId/file/*filepath
   */
  router.delete('/:guildId/file/*filepath', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);

    if (!validateAuth(req, guildId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
   * API: Create a new empty folder in the workspace
   * POST /api/workspace/:guildId/folder/*folderpath
   */
  router.post('/:guildId/folder/*folderpath', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);

    if (!validateAuth(req, guildId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const urlPath = req.path;
    const folderPrefix = `/folder/`;
    const folderIndex = urlPath.indexOf(folderPrefix);
    const folderpath = folderIndex !== -1
      ? decodeURIComponent(urlPath.substring(folderIndex + folderPrefix.length))
      : '';

    if (!folderpath) {
      return res.status(400).json({ error: 'Missing folder path' });
    }

    try {
      if (!fileSystem.createFolder) {
        return res.status(501).json({ error: 'Create folder operation not implemented' });
      }

      await fileSystem.createFolder(cordbotPath, folderpath);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error creating folder:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create folder',
      });
    }
  });

  /**
   * API: Move a file or folder to a different folder
   * POST /api/workspace/:guildId/move
   * Body: { sourcePath: string, destinationFolder: string }
   */
  router.post('/:guildId/move', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);

    if (!validateAuth(req, guildId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sourcePath, destinationFolder } = req.body;

    if (typeof sourcePath !== 'string' || typeof destinationFolder !== 'string') {
      return res.status(400).json({ error: 'Missing sourcePath or destinationFolder' });
    }

    try {
      if (!fileSystem.move) {
        return res.status(501).json({ error: 'Move operation not implemented' });
      }

      await fileSystem.move(cordbotPath, sourcePath, destinationFolder);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error moving item:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to move item',
      });
    }
  });

  /**
   * API: Delete a folder and all its contents from the workspace
   * DELETE /api/workspace/:guildId/folder/*folderpath
   */
  router.delete('/:guildId/folder/*folderpath', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);

    if (!validateAuth(req, guildId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const urlPath = req.path;
    const folderPrefix = `/folder/`;
    const folderIndex = urlPath.indexOf(folderPrefix);
    const folderpath = folderIndex !== -1
      ? decodeURIComponent(urlPath.substring(folderIndex + folderPrefix.length))
      : '';

    if (!folderpath) {
      return res.status(400).json({ error: 'Missing folder path' });
    }

    try {
      if (!fileSystem.deleteFolder) {
        return res.status(501).json({ error: 'Delete folder operation not implemented' });
      }

      await fileSystem.deleteFolder(cordbotPath, folderpath);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting folder:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete folder',
      });
    }
  });

  /**
   * API: Upload a file to the workspace, converting docx/pdf to markdown
   * POST /api/workspace/:guildId/upload
   */
  router.post('/:guildId/upload', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);

    if (!validateAuth(req, guildId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { filename, contentType, data: base64Data, folder = '' } = req.body;

    if (!filename || typeof base64Data !== 'string') {
      return res.status(400).json({ error: 'Missing filename or data' });
    }

    try {
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
   * GET /api/workspace/:guildId/events?token={jwt}
   * (EventSource doesn't support Authorization headers, so token is passed as query param)
   */
  router.get('/:guildId/events', (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);

    if (!validateAuth(req, guildId)) {
      return res.status(401).send('Unauthorized');
    }

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const clientId = nanoid();

    if (!sseClients.has(guildId)) {
      sseClients.set(guildId, new Map());
    }
    sseClients.get(guildId)!.set(clientId, res);

    // Send connected event
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

    // Setup file watcher if this is the first client for this guildId
    if (!watchers.has(guildId)) {
      const stopWatcher = fileSystem.watchWorkspace(cordbotPath, (change) => {
        const clients = sseClients.get(guildId);
        if (clients) {
          const data = JSON.stringify(change);
          clients.forEach((clientRes, cId) => {
            try {
              clientRes.write(`data: ${data}\n\n`);
            } catch (error) {
              logger.warn(`Failed to send to client ${cId}:`, error);
            }
          });
        }
      });

      watchers.set(guildId, stopWatcher);
      logger.info(`📁 Started watching workspace for guild ${guildId}`);
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

      sseClients.get(guildId)?.delete(clientId);

      // Stop watcher if no clients left for this guildId
      const remainingClients = sseClients.get(guildId)?.size ?? 0;
      if (remainingClients === 0) {
        const stopWatcher = watchers.get(guildId);
        if (stopWatcher) {
          stopWatcher();
          watchers.delete(guildId);
          sseClients.delete(guildId);
          logger.info(`📁 Stopped watching workspace for guild ${guildId}`);
        }
      }
    });
  });

  /**
   * API: Convert markdown file to DOCX or PDF and stream as download
   * GET /api/workspace/:guildId/convert/:format?file={relativePath}
   */
  router.get('/:guildId/convert/:format', async (req: Request, res: Response) => {
    const guildId = String(req.params.guildId);

    if (!validateAuth(req, guildId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const format = String(req.params.format);
    const filepath = req.query.file as string;

    if (!filepath) {
      return res.status(400).json({ error: 'Missing required query param: file' });
    }

    if (format !== 'docx' && format !== 'pdf') {
      return res.status(400).json({ error: 'Unsupported format. Use docx or pdf' });
    }

    try {
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
   * GET /workspace/:guildId
   */
  router.get('/:guildId', async (req: Request, res: Response) => {
    const indexPath = path.join(WORKSPACE_BUILD_PATH, 'index.html');

    try {
      await fs.access(indexPath);
      const html = await fs.readFile(indexPath, 'utf-8');
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
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
   */
  router.use((req: Request, res: Response, next) => {
    const filePath = path.join(WORKSPACE_BUILD_PATH, req.path);

    fs.access(filePath)
      .then(() => {
        res.sendFile(filePath);
      })
      .catch(() => {
        next();
      });
  });

  return router;
}
