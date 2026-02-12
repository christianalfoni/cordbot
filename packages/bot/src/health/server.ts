import express, { Request, Response } from 'express';
import { Server } from 'http';
import path from 'path';
import type { IBotContext } from '../interfaces/core.js';

interface HealthServerConfig {
  port: number;
  context: IBotContext;
  startTime: Date;
  baseUrl: string;
}

export class HealthServer {
  private app: express.Express;
  private server: Server | null = null;
  private config: HealthServerConfig;

  constructor(config: HealthServerConfig) {
    this.config = config;
    this.app = express();

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      const uptime = Math.floor((Date.now() - this.config.startTime.getTime()) / 1000);
      const isDiscordReady = this.config.context.discord.isReady();
      const activeSessions = this.config.context.sessionStore.getActiveCount();
      const user = this.config.context.discord.getUser();

      // Return 200 if Discord is connected, 503 if not
      const status = isDiscordReady ? 200 : 503;

      res.status(status).json({
        status: isDiscordReady ? 'healthy' : 'unhealthy',
        discord: {
          connected: isDiscordReady,
          user: user ? `${user.username}#${user.discriminator}` : null,
        },
        sessions: {
          active: activeSessions,
        },
        uptime: {
          seconds: uptime,
          humanReadable: this.formatUptime(uptime),
        },
        timestamp: new Date().toISOString(),
      });
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Cordbot Health Server',
        version: '1.2.0',
        endpoints: {
          health: '/health',
          share: '/share/:token',
        },
      });
    });

    // File sharing endpoint
    this.app.get('/share/:token', async (req: Request, res: Response) => {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;

      // Get file path from token
      const filePath = this.config.context.fileShareManager.getFileFromToken(token);

      if (!filePath) {
        return res.status(404).json({
          error: 'File not found or token expired',
        });
      }

      // Check if file exists
      if (!this.config.context.fileStore.exists(filePath)) {
        return res.status(404).json({
          error: 'File not found',
        });
      }

      try {
        // Read file content
        const content = this.config.context.fileStore.readFile(filePath);
        const filename = path.basename(filePath);

        // Set appropriate headers
        res.setHeader('Content-Type', this.getContentType(filename));
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Cache-Control', 'private, no-cache');

        // Send the file
        res.send(content);
      } catch (error) {
        this.config.context.logger.error('Error serving shared file:', error);
        res.status(500).json({
          error: 'Failed to read file',
        });
      }
    });
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const types: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.ts': 'text/plain',
      '.xml': 'application/xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf': 'application/pdf',
    };
    return types[ext] || 'application/octet-stream';
  }

  start(): void {
    this.server = this.app.listen(this.config.port, () => {
      console.log(`🏥 Health server listening on port ${this.config.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        console.log('🏥 Health server stopped');
      });
      this.server = null;
    }
  }
}
