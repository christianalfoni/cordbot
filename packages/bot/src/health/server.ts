import express, { Request, Response } from 'express';
import { Server } from 'http';
import type { Client } from 'discord.js';
import type { SessionDatabase } from '../storage/database.js';

interface HealthServerConfig {
  port: number;
  client: Client;
  db: SessionDatabase;
  startTime: Date;
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
      const isDiscordReady = this.config.client.isReady();
      const activeSessions = this.config.db.getActiveCount();

      // Return 200 if Discord is connected, 503 if not
      const status = isDiscordReady ? 200 : 503;

      res.status(status).json({
        status: isDiscordReady ? 'healthy' : 'unhealthy',
        discord: {
          connected: isDiscordReady,
          user: isDiscordReady ? this.config.client.user?.tag : null,
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
        },
      });
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
