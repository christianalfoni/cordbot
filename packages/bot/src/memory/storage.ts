import { promises as fs } from 'fs';
import path from 'path';

/**
 * Memory storage structure:
 * .claude/
 *   memories/
 *     [channel-id]/
 *       raw/
 *         2026-01-31.jsonl
 *       daily/
 *         2026-01-31.md
 *       weekly/
 *         2026-W04.md
 *       monthly/
 *         2026-01.md
 *       yearly/
 *         2026.md
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
export function getMemoriesPath(workspaceRoot: string, channelId: string): string {
  return path.join(workspaceRoot, '.claude', 'memories', channelId);
}

/**
 * Get the raw memories directory path
 */
export function getRawMemoriesPath(workspaceRoot: string, channelId: string): string {
  return path.join(getMemoriesPath(workspaceRoot, channelId), 'raw');
}

/**
 * Get the daily memories directory path
 */
export function getDailyMemoriesPath(workspaceRoot: string, channelId: string): string {
  return path.join(getMemoriesPath(workspaceRoot, channelId), 'daily');
}

/**
 * Get the weekly memories directory path
 */
export function getWeeklyMemoriesPath(workspaceRoot: string, channelId: string): string {
  return path.join(getMemoriesPath(workspaceRoot, channelId), 'weekly');
}

/**
 * Get the monthly memories directory path
 */
export function getMonthlyMemoriesPath(workspaceRoot: string, channelId: string): string {
  return path.join(getMemoriesPath(workspaceRoot, channelId), 'monthly');
}

/**
 * Get the yearly memories directory path
 */
export function getYearlyMemoriesPath(workspaceRoot: string, channelId: string): string {
  return path.join(getMemoriesPath(workspaceRoot, channelId), 'yearly');
}

/**
 * Initialize memory storage structure for a channel
 */
export async function initializeMemoryStorage(workspaceRoot: string, channelId: string): Promise<void> {
  const memoriesPath = getMemoriesPath(workspaceRoot, channelId);

  // Create all subdirectories
  await fs.mkdir(getRawMemoriesPath(workspaceRoot, channelId), { recursive: true });
  await fs.mkdir(getDailyMemoriesPath(workspaceRoot, channelId), { recursive: true });
  await fs.mkdir(getWeeklyMemoriesPath(workspaceRoot, channelId), { recursive: true });
  await fs.mkdir(getMonthlyMemoriesPath(workspaceRoot, channelId), { recursive: true });
  await fs.mkdir(getYearlyMemoriesPath(workspaceRoot, channelId), { recursive: true });
}

/**
 * Append a raw memory entry to today's file
 */
export async function appendRawMemory(
  workspaceRoot: string,
  channelId: string,
  entry: RawMemoryEntry
): Promise<void> {
  const rawPath = getRawMemoriesPath(workspaceRoot, channelId);
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
  workspaceRoot: string,
  channelId: string,
  date: string
): Promise<RawMemoryEntry[]> {
  const filePath = path.join(getRawMemoriesPath(workspaceRoot, channelId), `${date}.jsonl`);

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
  workspaceRoot: string,
  channelId: string,
  date: string,
  content: string
): Promise<void> {
  const dailyPath = getDailyMemoriesPath(workspaceRoot, channelId);
  const filePath = path.join(dailyPath, `${date}.md`);

  await fs.mkdir(dailyPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a daily memory summary
 */
export async function readDailyMemory(
  workspaceRoot: string,
  channelId: string,
  date: string
): Promise<string | null> {
  const filePath = path.join(getDailyMemoriesPath(workspaceRoot, channelId), `${date}.md`);

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
  workspaceRoot: string,
  channelId: string
): Promise<string[]> {
  const dailyPath = getDailyMemoriesPath(workspaceRoot, channelId);

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
  workspaceRoot: string,
  channelId: string,
  weekIdentifier: string, // e.g., "2026-W04"
  content: string
): Promise<void> {
  const weeklyPath = getWeeklyMemoriesPath(workspaceRoot, channelId);
  const filePath = path.join(weeklyPath, `${weekIdentifier}.md`);

  await fs.mkdir(weeklyPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a weekly memory summary
 */
export async function readWeeklyMemory(
  workspaceRoot: string,
  channelId: string,
  weekIdentifier: string
): Promise<string | null> {
  const filePath = path.join(getWeeklyMemoriesPath(workspaceRoot, channelId), `${weekIdentifier}.md`);

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
  workspaceRoot: string,
  channelId: string
): Promise<string[]> {
  const weeklyPath = getWeeklyMemoriesPath(workspaceRoot, channelId);

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
  workspaceRoot: string,
  channelId: string,
  monthIdentifier: string, // e.g., "2026-01"
  content: string
): Promise<void> {
  const monthlyPath = getMonthlyMemoriesPath(workspaceRoot, channelId);
  const filePath = path.join(monthlyPath, `${monthIdentifier}.md`);

  await fs.mkdir(monthlyPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a monthly memory summary
 */
export async function readMonthlyMemory(
  workspaceRoot: string,
  channelId: string,
  monthIdentifier: string
): Promise<string | null> {
  const filePath = path.join(getMonthlyMemoriesPath(workspaceRoot, channelId), `${monthIdentifier}.md`);

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
  workspaceRoot: string,
  channelId: string
): Promise<string[]> {
  const monthlyPath = getMonthlyMemoriesPath(workspaceRoot, channelId);

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
  workspaceRoot: string,
  channelId: string,
  year: string, // e.g., "2026"
  content: string
): Promise<void> {
  const yearlyPath = getYearlyMemoriesPath(workspaceRoot, channelId);
  const filePath = path.join(yearlyPath, `${year}.md`);

  await fs.mkdir(yearlyPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a yearly memory summary
 */
export async function readYearlyMemory(
  workspaceRoot: string,
  channelId: string,
  year: string
): Promise<string | null> {
  const filePath = path.join(getYearlyMemoriesPath(workspaceRoot, channelId), `${year}.md`);

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
  workspaceRoot: string,
  channelId: string
): Promise<string[]> {
  const yearlyPath = getYearlyMemoriesPath(workspaceRoot, channelId);

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
