import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockContext } from './utils/mock-context.js';
import type { IBotContext } from '../interfaces/index.js';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('fs');
vi.mock('../init.js', () => ({
  initializeClaudeFolder: vi.fn(() => ({
    storageDir: '/mock/storage',
    sessionsDir: '/mock/sessions',
    claudeDir: '/mock/.claude',
    isFirstRun: false,
  })),
}));

vi.mock('../implementations/factory.js', () => ({
  createProductionBotContext: vi.fn(async () => createMockContext()),
}));

vi.mock('../discord/sync.js', () => ({
  syncChannelsOnStartup: vi.fn(async () => [
    {
      channelId: 'channel-1',
      channelName: 'general',
      folderPath: '/mock/channels/general',
      cronPath: '/mock/channels/general/cron.yaml',
      claudeMdPath: '/mock/channels/CLAUDE.md',
    },
  ]),
}));

vi.mock('../discord/events.js', () => ({
  setupEventHandlers: vi.fn(),
}));

vi.mock('../scheduler/runner.js', () => ({
  CronRunner: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('../health/server.js', () => ({
  HealthServer: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('../agent/manager.js', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(async () => {}),
    shutdown: vi.fn(),
    archiveOldSessions: vi.fn(async () => 0),
  })),
}));

describe('Bot Startup', () => {
  let context: IBotContext;

  beforeEach(() => {
    context = createMockContext();
    vi.clearAllMocks();

    // Mock environment variables
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    process.env.DISCORD_GUILD_ID = 'test-guild';
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    process.env.BOT_MODE = 'personal';
    process.env.BOT_ID = 'test-bot';
    process.env.DISCORD_BOT_USERNAME = 'TestBot';
    process.env.MEMORY_CONTEXT_SIZE = '10000';
    process.env.HEALTH_PORT = '8080';

    // Mock fs.existsSync to return true for package.json
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0.0' }));
  });

  afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_GUILD_ID;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.BOT_MODE;
    delete process.env.BOT_ID;
    delete process.env.DISCORD_BOT_USERNAME;
    delete process.env.MEMORY_CONTEXT_SIZE;
    delete process.env.HEALTH_PORT;
  });

  describe('environment validation', () => {
    it('should validate required environment variables', () => {
      expect(process.env.DISCORD_BOT_TOKEN).toBeDefined();
      expect(process.env.DISCORD_GUILD_ID).toBeDefined();
      expect(process.env.ANTHROPIC_API_KEY).toBeDefined();
    });

    it('should use default values for optional environment variables', () => {
      delete process.env.BOT_MODE;
      delete process.env.BOT_ID;
      delete process.env.DISCORD_BOT_USERNAME;
      delete process.env.MEMORY_CONTEXT_SIZE;

      const botMode = process.env.BOT_MODE || 'personal';
      const botId = process.env.BOT_ID || 'local';
      const botUsername = process.env.DISCORD_BOT_USERNAME || 'Cordbot';
      const memoryContextSize = Math.max(1000, Math.min(100000, parseInt(process.env.MEMORY_CONTEXT_SIZE || '10000')));

      expect(botMode).toBe('personal');
      expect(botId).toBe('local');
      expect(botUsername).toBe('Cordbot');
      expect(memoryContextSize).toBe(10000);
    });

    it('should enforce memory context size bounds', () => {
      process.env.MEMORY_CONTEXT_SIZE = '500';
      let memoryContextSize = Math.max(1000, Math.min(100000, parseInt(process.env.MEMORY_CONTEXT_SIZE)));
      expect(memoryContextSize).toBe(1000); // Minimum

      process.env.MEMORY_CONTEXT_SIZE = '200000';
      memoryContextSize = Math.max(1000, Math.min(100000, parseInt(process.env.MEMORY_CONTEXT_SIZE)));
      expect(memoryContextSize).toBe(100000); // Maximum

      process.env.MEMORY_CONTEXT_SIZE = '50000';
      memoryContextSize = Math.max(1000, Math.min(100000, parseInt(process.env.MEMORY_CONTEXT_SIZE)));
      expect(memoryContextSize).toBe(50000); // Normal
    });
  });

  describe('initialization', () => {
    it('should initialize bot context', async () => {
      const { createProductionBotContext } = await import('../implementations/factory.js');

      await createProductionBotContext({
        discordToken: 'test-token',
        anthropicApiKey: 'test-api-key',
        guildId: 'test-guild',
        workingDirectory: '/mock/cwd',
        memoryContextSize: 10000,
        serviceUrl: undefined,
      });

      expect(createProductionBotContext).toHaveBeenCalledWith({
        discordToken: 'test-token',
        anthropicApiKey: 'test-api-key',
        guildId: 'test-guild',
        workingDirectory: '/mock/cwd',
        memoryContextSize: 10000,
        serviceUrl: undefined,
      });
    });

    it('should initialize session manager', async () => {
      const { SessionManager } = await import('../agent/manager.js');
      const mockSessionManager = new SessionManager(context, '/mock/sessions', '/mock/cwd', 10000);

      await mockSessionManager.initialize('test-token');

      expect(mockSessionManager.initialize).toHaveBeenCalledWith('test-token');
    });

    it('should sync channels on startup', async () => {
      const { syncChannelsOnStartup } = await import('../discord/sync.js');

      const channelMappings = await syncChannelsOnStartup(
        context.discord,
        'test-guild',
        '/mock/cwd',
        { mode: 'personal', id: 'test-bot', username: 'TestBot' }
      );

      expect(syncChannelsOnStartup).toHaveBeenCalled();
      expect(channelMappings).toHaveLength(1);
      expect(channelMappings[0].channelId).toBe('channel-1');
    });

    it('should start cron scheduler', async () => {
      const { CronRunner } = await import('../scheduler/runner.js');
      const mockCronRunner = new (CronRunner as any)(context.discord, {});

      mockCronRunner.start([
        {
          channelId: 'channel-1',
          channelName: 'general',
          folderPath: '/mock/channels/general',
          cronPath: '/mock/channels/general/cron.yaml',
          claudeMdPath: '/mock/channels/CLAUDE.md',
        },
      ]);

      expect(mockCronRunner.start).toHaveBeenCalled();
    });

    it('should start health server', async () => {
      const { HealthServer } = await import('../health/server.js');
      const mockHealthServer = new (HealthServer as any)({
        port: 8080,
        context,
        startTime: new Date(),
      });

      mockHealthServer.start();

      expect(mockHealthServer.start).toHaveBeenCalled();
    });

    it('should setup event handlers', async () => {
      const { setupEventHandlers } = await import('../discord/events.js');
      const { SessionManager } = await import('../agent/manager.js');
      const { CronRunner } = await import('../scheduler/runner.js');

      const mockSessionManager = new SessionManager(context, '/mock/sessions', '/mock/cwd', 10000);
      const mockCronRunner = new (CronRunner as any)(context.discord, mockSessionManager);

      setupEventHandlers(
        context,
        mockSessionManager,
        [],
        '/mock/cwd',
        '/mock/working',
        'test-guild',
        mockCronRunner,
        context.logger,
        { mode: 'personal', id: 'test-bot', username: 'TestBot' }
      );

      expect(setupEventHandlers).toHaveBeenCalled();
    });
  });

  describe('active sessions', () => {
    it('should check and display active sessions on startup', () => {
      // Create some active sessions
      context.sessionStore.createMapping({
        threadId: 'thread-1',
        sessionId: 'session-1',
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId: 'message-1',
        workingDirectory: '/mock/channels/general',
      });

      context.sessionStore.createMapping({
        threadId: 'thread-2',
        sessionId: 'session-2',
        channelId: 'channel-1',
        guildId: 'guild-1',
        messageId: 'message-2',
        workingDirectory: '/mock/channels/general',
      });

      const activeSessions = context.sessionStore.getAllActive();

      expect(activeSessions).toHaveLength(2);
      expect(activeSessions[0].threadId).toBe('thread-1');
      expect(activeSessions[1].threadId).toBe('thread-2');
    });
  });
});
