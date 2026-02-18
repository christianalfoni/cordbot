import express, { Request, Response } from 'express';
import { Server } from 'http';
import path from 'path';
import { createWorkspaceRouter } from './workspace-router.js';
import { WorkspaceFileSystem } from '../implementations/workspace-sharing/file-system.js';
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

    // Middleware: JSON body parser for API endpoints
    // 25mb limit to accommodate base64-encoded file uploads (DOCX/PDF up to ~18MB)
    this.app.use(express.json({ limit: '25mb' }));

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
          workspace: '/workspace/:token',
          workspaceApi: '/api/workspace/:token/*',
        },
      });
    });

    // Workspace sharing router
    const workspaceRouter = createWorkspaceRouter(
      this.config.context.workspaceShareManager,
      new WorkspaceFileSystem(),
      this.config.context.documentConverter,
      this.config.context.logger
    );

    // Mount API endpoints at /api/workspace
    this.app.use('/api/workspace', workspaceRouter);

    // Mount static files (React app) at /workspace
    this.app.use('/workspace', workspaceRouter);
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
