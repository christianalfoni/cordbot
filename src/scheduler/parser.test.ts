import { describe, it, expect } from 'vitest';
import { parseCronFile, validateCronSchedule } from './parser.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.join(__dirname, '__fixtures__');

describe('parseCronFile', () => {
  it('should parse valid cron file', () => {
    const filePath = path.join(fixturesDir, 'test.claude-cron');
    const config = parseCronFile(filePath);

    expect(config.jobs).toHaveLength(2);
    expect(config.jobs[0].name).toBe('Daily summary');
    expect(config.jobs[0].schedule).toBe('0 9 * * *');
    expect(config.jobs[0].task).toBe('Summarize recent changes');
  });

  it('should return empty jobs for empty file', () => {
    const filePath = path.join(fixturesDir, 'empty.claude-cron');
    const config = parseCronFile(filePath);

    expect(config.jobs).toEqual([]);
  });

  it('should return empty jobs for non-existent file', () => {
    const filePath = path.join(fixturesDir, 'nonexistent.claude-cron');
    const config = parseCronFile(filePath);

    expect(config.jobs).toEqual([]);
  });

  it('should throw error for invalid YAML', () => {
    const filePath = path.join(fixturesDir, 'invalid.claude-cron');

    expect(() => {
      parseCronFile(filePath);
    }).toThrow('Failed to parse cron file');
  });

  it('should throw error for missing required fields', () => {
    const filePath = path.join(fixturesDir, 'missing-fields.claude-cron');

    expect(() => {
      parseCronFile(filePath);
    }).toThrow('missing required field');
  });
});

describe('validateCronSchedule', () => {
  it('should validate correct cron schedules', () => {
    expect(validateCronSchedule('* * * * *')).toBe(true);
    expect(validateCronSchedule('0 9 * * *')).toBe(true);
    expect(validateCronSchedule('0 0 1 * *')).toBe(true);
    expect(validateCronSchedule('*/5 * * * *')).toBe(true);
    expect(validateCronSchedule('0 9-17 * * 1-5')).toBe(true);
    expect(validateCronSchedule('0 0 1,15 * *')).toBe(true);
  });

  it('should reject invalid cron schedules', () => {
    expect(validateCronSchedule('invalid')).toBe(false);
    expect(validateCronSchedule('* * *')).toBe(false);
    expect(validateCronSchedule('* * * * * *')).toBe(false);
    expect(validateCronSchedule('')).toBe(false);
    expect(validateCronSchedule('a b c d e')).toBe(false);
  });
});
