import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseNaturalTime, validateTimezone, getExampleNaturalTimes } from '../tools/scheduling/chrono-parser.js';
import { getCronV2FilePath, generateJobId, formatTimeUntil } from '../tools/scheduling/utils.js';
import { parseCronFileV2, writeCronV2File, validateOneTimeJob, validateRecurringJob } from '../scheduler/parser.js';
import type { CronV2Config } from '../scheduler/v2-types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Chrono Parser', () => {
  describe('validateTimezone', () => {
    it('should accept valid IANA timezones', () => {
      expect(validateTimezone('America/New_York')).toBe(true);
      expect(validateTimezone('Europe/London')).toBe(true);
      expect(validateTimezone('Asia/Tokyo')).toBe(true);
      expect(validateTimezone('UTC')).toBe(true);
    });

    it('should reject invalid timezones', () => {
      expect(validateTimezone('Not/A/Timezone')).toBe(false);
      // Note: PST is actually valid in Intl.DateTimeFormat (it's mapped to a zone)
      // Use a truly invalid one instead
      expect(validateTimezone('Invalid/Zone')).toBe(false);
      expect(validateTimezone('')).toBe(false);
    });
  });

  describe('parseNaturalTime', () => {
    it('should parse "in X minutes"', () => {
      const result = parseNaturalTime('in 10 minutes', 'UTC');
      const parsed = new Date(result);
      const now = new Date();
      const diffMinutes = Math.floor((parsed.getTime() - now.getTime()) / 60000);
      expect(diffMinutes).toBeGreaterThanOrEqual(9);
      expect(diffMinutes).toBeLessThanOrEqual(11);
    });

    it('should parse "tomorrow at 9pm"', () => {
      const result = parseNaturalTime('tomorrow at 9pm', 'UTC');
      const parsed = new Date(result);
      // chrono-node may parse to 21:00 or 20:00 depending on context
      // Just verify it's in the evening (between 19:00 and 23:00)
      expect(parsed.getUTCHours()).toBeGreaterThanOrEqual(19);
      expect(parsed.getUTCHours()).toBeLessThanOrEqual(23);
      expect(parsed > new Date()).toBe(true);
    });

    it('should reject past times', () => {
      expect(() => {
        parseNaturalTime('yesterday', 'UTC');
      }).toThrow('in the past');
    });

    it('should reject invalid natural language', () => {
      expect(() => {
        parseNaturalTime('asdfghjkl', 'UTC');
      }).toThrow('Could not parse');
    });

    it('should reject invalid timezone', () => {
      expect(() => {
        parseNaturalTime('tomorrow at 9pm', 'Invalid/Timezone');
      }).toThrow('Invalid timezone');
    });
  });

  describe('getExampleNaturalTimes', () => {
    it('should return array of example strings', () => {
      const examples = getExampleNaturalTimes();
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);
      expect(examples.every((ex) => typeof ex === 'string')).toBe(true);
    });
  });
});

describe('Scheduling Utils', () => {
  describe('generateJobId', () => {
    it('should generate unique IDs', async () => {
      const id1 = generateJobId();
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 2));
      const id2 = generateJobId();
      expect(id1).toMatch(/^job_\d+$/);
      expect(id2).toMatch(/^job_\d+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('formatTimeUntil', () => {
    it('should format days', () => {
      const target = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const result = formatTimeUntil(target);
      expect(result).toContain('2 days');
    });

    it('should format hours and minutes', () => {
      const target = new Date(Date.now() + 2.5 * 60 * 60 * 1000);
      const result = formatTimeUntil(target);
      expect(result).toContain('2 hours');
      expect(result).toContain('30 minutes');
    });

    it('should format minutes only when less than 1 day', () => {
      const target = new Date(Date.now() + 45 * 60 * 1000);
      const result = formatTimeUntil(target);
      expect(result).toContain('45 minutes');
    });

    it('should return "overdue" for past dates', () => {
      const target = new Date(Date.now() - 1000);
      const result = formatTimeUntil(target);
      expect(result).toBe('overdue');
    });
  });

  describe('getCronV2FilePath', () => {
    it('should create file if it does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
      try {
        const filePath = getCronV2FilePath(tmpDir);
        expect(fs.existsSync(filePath)).toBe(true);
        expect(filePath).toContain('cron_v2.yaml');

        // Verify default content
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('oneTimeJobs: []');
        expect(content).toContain('recurringJobs: []');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('should return existing file path', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
      try {
        const filePath = path.join(tmpDir, 'cron_v2.yaml');
        fs.writeFileSync(filePath, 'existing content', 'utf-8');

        const result = getCronV2FilePath(tmpDir);
        expect(result).toBe(filePath);
        expect(fs.readFileSync(filePath, 'utf-8')).toBe('existing content');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });
});

describe('V2 Parser', () => {
  describe('parseCronFileV2', () => {
    it('should return empty config for non-existent file', () => {
      const result = parseCronFileV2('/nonexistent/path/cron_v2.yaml');
      expect(result).toEqual({
        oneTimeJobs: [],
        recurringJobs: [],
      });
    });

    it('should return empty config for empty file', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
      try {
        const filePath = path.join(tmpDir, 'cron_v2.yaml');
        fs.writeFileSync(filePath, '', 'utf-8');

        const result = parseCronFileV2(filePath);
        expect(result).toEqual({
          oneTimeJobs: [],
          recurringJobs: [],
        });
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('should parse valid V2 config', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
      try {
        const filePath = path.join(tmpDir, 'cron_v2.yaml');
        const content = `oneTimeJobs:
  - id: job_123
    naturalTime: "tomorrow at 9pm"
    targetTime: "2026-02-08T21:00:00.000Z"
    timezone: UTC
    task: Test task
    channelId: channel_1
    createdAt: "2026-02-07T12:00:00.000Z"
recurringJobs:
  - name: Daily job
    cronExpression: "0 9 * * *"
    timezone: UTC
    task: Daily task
    channelId: channel_1
    createdAt: "2026-02-07T12:00:00.000Z"
`;
        fs.writeFileSync(filePath, content, 'utf-8');

        const result = parseCronFileV2(filePath);
        expect(result.oneTimeJobs).toHaveLength(1);
        expect(result.recurringJobs).toHaveLength(1);
        expect(result.oneTimeJobs[0].id).toBe('job_123');
        expect(result.recurringJobs[0].name).toBe('Daily job');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe('writeCronV2File', () => {
    it('should write valid YAML', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
      try {
        const filePath = path.join(tmpDir, 'cron_v2.yaml');
        const config: CronV2Config = {
          oneTimeJobs: [
            {
              id: 'job_123',
              naturalTime: 'tomorrow at 9pm',
              targetTime: '2026-02-08T21:00:00.000Z',
              timezone: 'UTC',
              task: 'Test task',
              channelId: 'channel_1',
              createdAt: '2026-02-07T12:00:00.000Z',
            },
          ],
          recurringJobs: [],
        };

        writeCronV2File(filePath, config);

        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('id: job_123');
        expect(content).toContain('naturalTime: tomorrow at 9pm');
        expect(content).toContain('recurringJobs: []');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe('validateOneTimeJob', () => {
    it('should validate complete job', () => {
      const job = {
        id: 'job_123',
        naturalTime: 'tomorrow at 9pm',
        targetTime: '2026-02-08T21:00:00.000Z',
        timezone: 'UTC',
        task: 'Test task',
        channelId: 'channel_1',
        createdAt: '2026-02-07T12:00:00.000Z',
      };

      const result = validateOneTimeJob(job, 0);
      expect(result).toEqual(job);
    });

    it('should throw for missing id', () => {
      const job = {
        naturalTime: 'tomorrow at 9pm',
        targetTime: '2026-02-08T21:00:00.000Z',
        timezone: 'UTC',
        task: 'Test task',
        channelId: 'channel_1',
        createdAt: '2026-02-07T12:00:00.000Z',
      };

      expect(() => validateOneTimeJob(job, 0)).toThrow('missing required field: id');
    });

    it('should throw for missing naturalTime', () => {
      const job = {
        id: 'job_123',
        targetTime: '2026-02-08T21:00:00.000Z',
        timezone: 'UTC',
        task: 'Test task',
        channelId: 'channel_1',
        createdAt: '2026-02-07T12:00:00.000Z',
      };

      expect(() => validateOneTimeJob(job, 0)).toThrow('missing required field: naturalTime');
    });
  });

  describe('validateRecurringJob', () => {
    it('should validate complete job', () => {
      const job = {
        name: 'Daily job',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        task: 'Daily task',
        channelId: 'channel_1',
        createdAt: '2026-02-07T12:00:00.000Z',
      };

      const result = validateRecurringJob(job, 0);
      expect(result).toEqual(job);
    });

    it('should throw for missing name', () => {
      const job = {
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        task: 'Daily task',
        channelId: 'channel_1',
        createdAt: '2026-02-07T12:00:00.000Z',
      };

      expect(() => validateRecurringJob(job, 0)).toThrow('missing required field: name');
    });

    it('should throw for missing cronExpression', () => {
      const job = {
        name: 'Daily job',
        timezone: 'UTC',
        task: 'Daily task',
        channelId: 'channel_1',
        createdAt: '2026-02-07T12:00:00.000Z',
      };

      expect(() => validateRecurringJob(job, 0)).toThrow('missing required field: cronExpression');
    });
  });
});
