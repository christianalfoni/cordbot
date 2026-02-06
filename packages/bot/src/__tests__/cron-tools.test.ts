import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTool as createAddJobTool } from '../tools/cron/add_job.js';
import fs from 'fs';
import yaml from 'js-yaml';

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock js-yaml
vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn(),
    dump: vi.fn(),
  },
}));

describe('Cron Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cron_add_job', () => {
    it('should add a job without replyInThread', async () => {
      // Setup
      const mockChannelId = 'channel-123';
      const mockCronPath = '/test/cron.yaml';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('jobs: []');
      vi.mocked(yaml.load).mockReturnValue({ jobs: [] });
      vi.mocked(yaml.dump).mockReturnValue('jobs:\n  - name: test-job\n    schedule: "0 9 * * *"\n    task: Test task\n    oneTime: false\n');

      const getChannelId = () => mockChannelId;
      const tool = createAddJobTool(getChannelId);

      // Execute
      const result = await tool.handler({
        name: 'test-job',
        schedule: '0 9 * * *',
        task: 'Test task',
        oneTime: false,
      });

      // Verify
      expect(result.content[0].text).toContain('success');
      expect(result.content[0].text).toContain('test-job');
      expect(yaml.dump).toHaveBeenCalledWith({
        jobs: [
          {
            name: 'test-job',
            schedule: '0 9 * * *',
            task: 'Test task',
            oneTime: false,
          }
        ]
      });
    });

    it('should capture thread ID when replyInThread is true and called from a thread', async () => {
      // Setup
      const mockChannelId = 'channel-123';
      const mockThreadId = 'thread-456';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('jobs: []');
      vi.mocked(yaml.load).mockReturnValue({ jobs: [] });
      vi.mocked(yaml.dump).mockReturnValue('jobs:\n  - name: thread-job\n    schedule: "0 9 * * *"\n    task: Test task\n    oneTime: true\n    responseThreadId: thread-456\n');

      // Mock getCurrentChannel to return a thread
      const mockThread = {
        id: mockThreadId,
        isThread: () => true,
      };

      const getChannelId = () => mockChannelId;
      const getCurrentChannel = () => mockThread;
      const tool = createAddJobTool(getChannelId, getCurrentChannel);

      // Execute
      const result = await tool.handler({
        name: 'thread-job',
        schedule: '0 9 * * *',
        task: 'Test task',
        oneTime: true,
        replyInThread: true, // ← Key parameter!
      });

      // Verify
      expect(result.content[0].text).toContain('success');
      expect(result.content[0].text).toContain('thread-job');
      expect(result.content[0].text).toContain('posted to this thread');

      // Verify yaml.dump was called with responseThreadId
      expect(yaml.dump).toHaveBeenCalledWith({
        jobs: [
          {
            name: 'thread-job',
            schedule: '0 9 * * *',
            task: 'Test task',
            oneTime: true,
            responseThreadId: mockThreadId, // ← Should be captured!
          }
        ]
      });
    });

    it('should not set responseThreadId when replyInThread is true but not in a thread', async () => {
      // Setup
      const mockChannelId = 'channel-123';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('jobs: []');
      vi.mocked(yaml.load).mockReturnValue({ jobs: [] });
      vi.mocked(yaml.dump).mockReturnValue('jobs:\n  - name: channel-job\n    schedule: "0 9 * * *"\n    task: Test task\n    oneTime: false\n');

      // Mock getCurrentChannel to return a channel (not a thread)
      const mockChannel = {
        id: mockChannelId,
        isThread: () => false,
      };

      const getChannelId = () => mockChannelId;
      const getCurrentChannel = () => mockChannel;
      const tool = createAddJobTool(getChannelId, getCurrentChannel);

      // Execute
      const result = await tool.handler({
        name: 'channel-job',
        schedule: '0 9 * * *',
        task: 'Test task',
        replyInThread: true, // ← True, but we're in a channel
      });

      // Verify
      expect(result.content[0].text).toContain('success');

      // Verify yaml.dump was called WITHOUT responseThreadId
      expect(yaml.dump).toHaveBeenCalledWith({
        jobs: [
          {
            name: 'channel-job',
            schedule: '0 9 * * *',
            task: 'Test task',
            oneTime: false,
            // No responseThreadId!
          }
        ]
      });
    });

    it('should not set responseThreadId when replyInThread is false', async () => {
      // Setup
      const mockChannelId = 'channel-123';
      const mockThreadId = 'thread-456';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('jobs: []');
      vi.mocked(yaml.load).mockReturnValue({ jobs: [] });
      vi.mocked(yaml.dump).mockReturnValue('jobs:\n  - name: no-reply-job\n    schedule: "0 9 * * *"\n    task: Test task\n    oneTime: false\n');

      // Mock getCurrentChannel to return a thread
      const mockThread = {
        id: mockThreadId,
        isThread: () => true,
      };

      const getChannelId = () => mockChannelId;
      const getCurrentChannel = () => mockThread;
      const tool = createAddJobTool(getChannelId, getCurrentChannel);

      // Execute
      const result = await tool.handler({
        name: 'no-reply-job',
        schedule: '0 9 * * *',
        task: 'Test task',
        replyInThread: false, // ← False, even though we're in a thread
      });

      // Verify
      expect(result.content[0].text).toContain('success');

      // Verify yaml.dump was called WITHOUT responseThreadId
      expect(yaml.dump).toHaveBeenCalledWith({
        jobs: [
          {
            name: 'no-reply-job',
            schedule: '0 9 * * *',
            task: 'Test task',
            oneTime: false,
            // No responseThreadId!
          }
        ]
      });
    });

    it('should validate cron schedule format', async () => {
      // Setup
      const mockChannelId = 'channel-123';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('jobs: []');
      vi.mocked(yaml.load).mockReturnValue({ jobs: [] });

      const getChannelId = () => mockChannelId;
      const tool = createAddJobTool(getChannelId);

      // Execute with invalid schedule
      const result = await tool.handler({
        name: 'invalid-job',
        schedule: 'invalid schedule',
        task: 'Test task',
      });

      // Verify error
      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('Invalid cron schedule');
    });

    it('should prevent duplicate job names', async () => {
      // Setup
      const mockChannelId = 'channel-123';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('jobs:\n  - name: existing-job\n    schedule: "0 9 * * *"\n    task: Existing task\n');
      vi.mocked(yaml.load).mockReturnValue({
        jobs: [
          {
            name: 'existing-job',
            schedule: '0 9 * * *',
            task: 'Existing task',
            oneTime: false,
          }
        ]
      });

      const getChannelId = () => mockChannelId;
      const tool = createAddJobTool(getChannelId);

      // Execute with duplicate name
      const result = await tool.handler({
        name: 'existing-job',
        schedule: '0 10 * * *',
        task: 'Different task',
      });

      // Verify error
      expect(result.content[0].text).toContain('error');
      expect(result.content[0].text).toContain('already exists');
    });
  });
});
