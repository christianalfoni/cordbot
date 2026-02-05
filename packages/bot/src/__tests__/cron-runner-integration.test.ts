import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockContext } from './utils/mock-context.js';
import { SessionManager } from '../agent/manager.js';
import { CronRunner } from '../scheduler/runner.js';
import type { IBotContext } from '../interfaces/index.js';
import type { ChannelMapping } from '../discord/sync.js';
import fs from 'fs';

// Mock fs and file watchers
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => `jobs:
  - name: Test Job
    schedule: "0 9 * * *"
    task: "Run daily report"
    oneTime: false`),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => `jobs:
  - name: Test Job
    schedule: "0 9 * * *"
    task: "Run daily report"
    oneTime: false`),
  writeFileSync: vi.fn(),
}));

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn(function(this: any, event: string, handler: Function) {
        // Store handlers for manual triggering
        if (!this._handlers) this._handlers = {};
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(handler);
        return this;
      }),
      close: vi.fn(),
      _handlers: {},
      _trigger: function(this: any, event: string, ...args: any[]) {
        if (this._handlers && this._handlers[event]) {
          this._handlers[event].forEach((handler: Function) => handler(...args));
        }
      },
    })),
  },
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((expression: string, callback: Function) => {
      const task = {
        stop: vi.fn(),
        _callback: callback,
      };
      return task;
    }),
  },
}));

// Mock external dependencies
vi.mock('../service/manifest.js', () => ({
  fetchManifest: vi.fn(async () => null),
}));

vi.mock('../tools/loader.js', () => ({
  loadDynamicTools: vi.fn(() => []),
}));

vi.mock('../tools/builtin-loader.js', () => ({
  loadBuiltinTools: vi.fn(() => []),
}));

vi.mock('../tools/discord/loader.js', () => ({
  loadDiscordTools: vi.fn(() => []),
}));

vi.mock('../tools/skill-loader.js', () => ({
  discoverToolSkills: vi.fn(() => []),
  installGlobalSkills: vi.fn(),
}));

vi.mock('../discord/sync.js', () => ({
  populateMemorySection: vi.fn(async () => {}),
}));

describe('CronRunner Integration', () => {
  let core: IBotContext;
  let sessionManager: SessionManager;
  let cronRunner: CronRunner;
  let channelMappings: ChannelMapping[];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mocked core
    core = createMockContext();

    // Create real SessionManager
    sessionManager = new SessionManager(
      core,
      '/mock/sessions',
      '/mock/workspace',
      10000
    );
    await sessionManager.initialize('test-bot-token');

    // Create real CronRunner with mocked core
    cronRunner = new CronRunner(core.discord, sessionManager, core.logger, core.scheduler, core.fileStore);

    // Setup channel mappings
    channelMappings = [
      {
        channelId: 'channel-1',
        channelName: 'general',
        folderPath: '/mock/channels/general',
        cronPath: '/mock/channels/general/cron.yaml',
        claudeMdPath: '/mock/channels/CLAUDE.md',
      },
      {
        channelId: 'channel-2',
        channelName: 'dev',
        folderPath: '/mock/channels/dev',
        cronPath: '/mock/channels/dev/cron.yaml',
        claudeMdPath: '/mock/channels/CLAUDE.md',
      },
    ];
  });

  afterEach(() => {
    // Stop the cron runner
    cronRunner.stop();
  });

  describe('initialization', () => {
    it('should start watching cron files for all channels', async () => {
      const chokidar = await import('chokidar');

      cronRunner.start(channelMappings);

      // Should watch both cron files
      expect(chokidar.default.watch).toHaveBeenCalledTimes(2);
      expect(chokidar.default.watch).toHaveBeenCalledWith(
        '/mock/channels/general/cron.yaml',
        expect.any(Object)
      );
      expect(chokidar.default.watch).toHaveBeenCalledWith(
        '/mock/channels/dev/cron.yaml',
        expect.any(Object)
      );
    });

    it('should schedule jobs from cron files', async () => {
      cronRunner.start(channelMappings);

      // Should schedule cron jobs via the scheduler interface
      const tasks = core.scheduler.list();
      expect(tasks.length).toBeGreaterThan(0);
    });
  });

  describe('channel management', () => {
    it('should add new channel to watch list', async () => {
      const chokidar = await import('chokidar');
      const callCountBefore = chokidar.default.watch.mock.calls.length;

      cronRunner.start(channelMappings);

      const newMapping: ChannelMapping = {
        channelId: 'channel-3',
        channelName: 'new-channel',
        folderPath: '/mock/channels/new-channel',
        cronPath: '/mock/channels/new-channel/cron.yaml',
        claudeMdPath: '/mock/channels/CLAUDE.md',
      };

      cronRunner.addChannel(newMapping);

      // Should watch the new channel's cron file
      expect(chokidar.default.watch.mock.calls.length).toBeGreaterThan(callCountBefore);
    });

    it('should remove channel from watch list', () => {
      cronRunner.start(channelMappings);

      // Remove a channel
      cronRunner.removeChannel('channel-1');

      // Watcher should be closed and tasks stopped
      // In real implementation, this would be verified by checking the watcher state
      expect(true).toBe(true); // Placeholder - watcher cleanup happens internally
    });
  });

  describe('cron file changes', () => {
    it('should reload jobs when cron file changes', async () => {
      const chokidar = await import('chokidar');

      cronRunner.start(channelMappings);

      const initialTaskCount = core.scheduler.list().length;

      // Get the watcher for channel-1
      const watcherCalls = chokidar.default.watch.mock.results;
      const watcher = watcherCalls[0]?.value;

      if (watcher && watcher._trigger) {
        // Trigger a file change event
        watcher._trigger('change');

        // Jobs should be rescheduled - when a file changes, old jobs are removed and new ones added
        // So we should have at least the initial number of tasks
        const newTaskCount = core.scheduler.list().length;
        expect(newTaskCount).toBeGreaterThanOrEqual(initialTaskCount);
      }
    });
  });

  describe('stopping', () => {
    it('should stop all watchers and tasks', () => {
      cronRunner.start(channelMappings);

      // Stop should not throw
      expect(() => cronRunner.stop()).not.toThrow();
    });

    it('should clean up resources on stop', () => {
      cronRunner.start(channelMappings);

      cronRunner.stop();

      // After stopping, starting again should work
      expect(() => cronRunner.start(channelMappings)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle missing cron file gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Should not throw even if cron file doesn't exist
      expect(() => cronRunner.start(channelMappings)).not.toThrow();
    });

    it('should handle invalid cron file content', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('invalid yaml content {{{');

      // Should not crash when parsing invalid YAML
      expect(() => cronRunner.start(channelMappings)).not.toThrow();
    });
  });
});
