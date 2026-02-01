import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Memory storage structure:
 * ~/.claude/
 *   channels/
 *     [channel-id]/
 *       CLAUDE.md
 *       cron.yaml
 *       memories/
 *         raw/
 *           2026-01-31.jsonl
 *         daily/
 *           2026-01-31.md
 *         weekly/
 *           2026-W04.md
 *         monthly/
 *           2026-01.md
 *         yearly/
 *           2026.md
 */

export interface RawMemoryEntry {
  timestamp: string;
  message: string;
  sessionId: string;
  threadId?: string;
}

/**
 * Get the memories directory path for a channel
 */
export function getMemoriesPath(channelId: string): string {
  const homeDir = os.homedir(); // /workspace (set via ENV HOME=/workspace)
  return path.join(homeDir, '.claude', 'channels', channelId, 'memories');
}

/**
 * Get the raw memories directory path
 */
export function getRawMemoriesPath(channelId: string): string {
  return path.join(getMemoriesPath(channelId), 'raw');
}

/**
 * Get the daily memories directory path
 */
export function getDailyMemoriesPath(channelId: string): string {
  return path.join(getMemoriesPath(channelId), 'daily');
}

/**
 * Get the weekly memories directory path
 */
export function getWeeklyMemoriesPath(channelId: string): string {
  return path.join(getMemoriesPath(channelId), 'weekly');
}

/**
 * Get the monthly memories directory path
 */
export function getMonthlyMemoriesPath(channelId: string): string {
  return path.join(getMemoriesPath(channelId), 'monthly');
}

/**
 * Get the yearly memories directory path
 */
export function getYearlyMemoriesPath(channelId: string): string {
  return path.join(getMemoriesPath(channelId), 'yearly');
}

/**
 * Initialize memory storage structure for a channel
 */
export async function initializeMemoryStorage(channelId: string): Promise<void> {
  // Create all subdirectories
  await fs.mkdir(getRawMemoriesPath(channelId), { recursive: true });
  await fs.mkdir(getDailyMemoriesPath(channelId), { recursive: true });
  await fs.mkdir(getWeeklyMemoriesPath(channelId), { recursive: true });
  await fs.mkdir(getMonthlyMemoriesPath(channelId), { recursive: true });
  await fs.mkdir(getYearlyMemoriesPath(channelId), { recursive: true });
}

/**
 * Append a raw memory entry to today's file
 */
export async function appendRawMemory(
  channelId: string,
  entry: RawMemoryEntry
): Promise<void> {
  const rawPath = getRawMemoriesPath(channelId);
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filePath = path.join(rawPath, `${today}.jsonl`);

  // Ensure directory exists
  await fs.mkdir(rawPath, { recursive: true });

  // Append entry as JSON line
  const line = JSON.stringify(entry) + '\n';
  await fs.appendFile(filePath, line, 'utf-8');
}

/**
 * Read raw memory entries from a specific date
 */
export async function readRawMemories(
  channelId: string,
  date: string
): Promise<RawMemoryEntry[]> {
  const filePath = path.join(getRawMemoriesPath(channelId), `${date}.jsonl`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []; // File doesn't exist yet
    }
    throw error;
  }
}

/**
 * Write a daily memory summary
 */
export async function writeDailyMemory(
  channelId: string,
  date: string,
  content: string
): Promise<void> {
  const dailyPath = getDailyMemoriesPath(channelId);
  const filePath = path.join(dailyPath, `${date}.md`);

  await fs.mkdir(dailyPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a daily memory summary
 */
export async function readDailyMemory(
  channelId: string,
  date: string
): Promise<string | null> {
  const filePath = path.join(getDailyMemoriesPath(channelId), `${date}.md`);

  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * List all daily memory files for a channel
 */
export async function listDailyMemories(
  channelId: string
): Promise<string[]> {
  const dailyPath = getDailyMemoriesPath(channelId);

  try {
    const files = await fs.readdir(dailyPath);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse(); // Most recent first
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Write a weekly memory summary
 */
export async function writeWeeklyMemory(
  channelId: string,
  weekIdentifier: string, // e.g., "2026-W04"
  content: string
): Promise<void> {
  const weeklyPath = getWeeklyMemoriesPath(channelId);
  const filePath = path.join(weeklyPath, `${weekIdentifier}.md`);

  await fs.mkdir(weeklyPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a weekly memory summary
 */
export async function readWeeklyMemory(
  channelId: string,
  weekIdentifier: string
): Promise<string | null> {
  const filePath = path.join(getWeeklyMemoriesPath(channelId), `${weekIdentifier}.md`);

  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * List all weekly memory files for a channel
 */
export async function listWeeklyMemories(
  channelId: string
): Promise<string[]> {
  const weeklyPath = getWeeklyMemoriesPath(channelId);

  try {
    const files = await fs.readdir(weeklyPath);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse(); // Most recent first
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Write a monthly memory summary
 */
export async function writeMonthlyMemory(
  channelId: string,
  monthIdentifier: string, // e.g., "2026-01"
  content: string
): Promise<void> {
  const monthlyPath = getMonthlyMemoriesPath(channelId);
  const filePath = path.join(monthlyPath, `${monthIdentifier}.md`);

  await fs.mkdir(monthlyPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a monthly memory summary
 */
export async function readMonthlyMemory(
  channelId: string,
  monthIdentifier: string
): Promise<string | null> {
  const filePath = path.join(getMonthlyMemoriesPath(channelId), `${monthIdentifier}.md`);

  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * List all monthly memory files for a channel
 */
export async function listMonthlyMemories(
  channelId: string
): Promise<string[]> {
  const monthlyPath = getMonthlyMemoriesPath(channelId);

  try {
    const files = await fs.readdir(monthlyPath);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse(); // Most recent first
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Write a yearly memory summary
 */
export async function writeYearlyMemory(
  channelId: string,
  year: string, // e.g., "2026"
  content: string
): Promise<void> {
  const yearlyPath = getYearlyMemoriesPath(channelId);
  const filePath = path.join(yearlyPath, `${year}.md`);

  await fs.mkdir(yearlyPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a yearly memory summary
 */
export async function readYearlyMemory(
  channelId: string,
  year: string
): Promise<string | null> {
  const filePath = path.join(getYearlyMemoriesPath(channelId), `${year}.md`);

  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * List all yearly memory files for a channel
 */
export async function listYearlyMemories(
  channelId: string
): Promise<string[]> {
  const yearlyPath = getYearlyMemoriesPath(channelId);

  try {
    const files = await fs.readdir(yearlyPath);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse(); // Most recent first
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
