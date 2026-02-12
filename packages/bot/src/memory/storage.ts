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
 */

export interface RawMemoryEntry {
  timestamp: string;
  message: string;
  sessionId: string;
  threadId?: string;
  channelId: string;      // NEW: For server-wide storage
  channelName: string;    // NEW: For server-wide storage
}

/**
 * Get the memories directory path for a channel
 */
export function getMemoriesPath(channelId: string, homeDirectory?: string): string {
  const home = homeDirectory || process.env.HOME || os.homedir();
  return path.join(home, '.claude', 'channels', channelId, 'memories');
}

/**
 * Get the raw memories directory path
 */
export function getRawMemoriesPath(channelId: string, homeDirectory?: string): string {
  return path.join(getMemoriesPath(channelId, homeDirectory), 'raw');
}

/**
 * Get the daily memories directory path
 */
export function getDailyMemoriesPath(channelId: string, homeDirectory?: string): string {
  return path.join(getMemoriesPath(channelId, homeDirectory), 'daily');
}

/**
 * Get the weekly memories directory path
 */
export function getWeeklyMemoriesPath(channelId: string, homeDirectory?: string): string {
  return path.join(getMemoriesPath(channelId, homeDirectory), 'weekly');
}

/**
 * Get the monthly memories directory path
 */
export function getMonthlyMemoriesPath(channelId: string, homeDirectory?: string): string {
  return path.join(getMemoriesPath(channelId, homeDirectory), 'monthly');
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
 * Delete a monthly memory summary
 */
export async function deleteMonthlyMemory(
  channelId: string,
  monthIdentifier: string
): Promise<void> {
  const filePath = path.join(getMonthlyMemoriesPath(channelId), `${monthIdentifier}.md`);

  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, that's fine
      return;
    }
    throw error;
  }
}

// ============================================================================
// Server-Wide Memory Storage (NEW)
// ============================================================================

/**
 * Get the server-wide memories directory path
 */
export function getServerMemoriesPath(homeDirectory?: string): string {
  const home = homeDirectory || process.env.HOME || os.homedir();
  return path.join(home, '.claude', 'memories');
}

/**
 * Get the server-wide raw memories directory path
 */
export function getServerRawMemoriesPath(homeDirectory?: string): string {
  return path.join(getServerMemoriesPath(homeDirectory), 'raw');
}

/**
 * Get the server-wide daily memories directory path
 */
export function getServerDailyMemoriesPath(homeDirectory?: string): string {
  return path.join(getServerMemoriesPath(homeDirectory), 'daily');
}

/**
 * Get the server-wide weekly memories directory path
 */
export function getServerWeeklyMemoriesPath(homeDirectory?: string): string {
  return path.join(getServerMemoriesPath(homeDirectory), 'weekly');
}

/**
 * Get the server-wide monthly memories directory path
 */
export function getServerMonthlyMemoriesPath(homeDirectory?: string): string {
  return path.join(getServerMemoriesPath(homeDirectory), 'monthly');
}

/**
 * Append a message to raw memory file (simple MD format)
 * Creates CHANNEL_ID.md or CHANNEL_ID-THREAD_ID.md
 */
export async function appendRawMessageToFile(
  channelId: string,
  username: string,
  message: string,
  threadId?: string
): Promise<void> {
  const rawPath = getServerRawMemoriesPath();

  // Determine filename
  const filename = threadId
    ? `${channelId}-${threadId}.md`
    : `${channelId}.md`;

  const filePath = path.join(rawPath, filename);

  // Ensure directory exists
  await fs.mkdir(rawPath, { recursive: true });

  // Append in simple format: [username]: message
  const line = `[${username}]: ${message}\n`;
  await fs.appendFile(filePath, line, 'utf-8');
}

/**
 * Read all raw memory files (returns Map of filename -> content)
 */
export async function readAllRawFiles(): Promise<Map<string, string>> {
  const rawPath = getServerRawMemoriesPath();
  const files = new Map<string, string>();

  try {
    await fs.mkdir(rawPath, { recursive: true });
    const fileNames = await fs.readdir(rawPath);

    for (const fileName of fileNames) {
      if (fileName.endsWith('.md')) {
        const filePath = path.join(rawPath, fileName);
        const content = await fs.readFile(filePath, 'utf-8');
        files.set(fileName, content);
      }
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return files; // Directory doesn't exist yet
    }
    throw error;
  }

  return files;
}

/**
 * Read a specific raw memory file
 */
export async function readRawFile(
  channelId: string,
  threadId?: string
): Promise<string> {
  const rawPath = getServerRawMemoriesPath();
  const filename = threadId
    ? `${channelId}-${threadId}.md`
    : `${channelId}.md`;
  const filePath = path.join(rawPath, filename);

  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return ''; // File doesn't exist yet
    }
    throw error;
  }
}

/**
 * Clear all raw memory files (called after compression)
 */
export async function clearRawFiles(): Promise<void> {
  const memoriesPath = getServerMemoriesPath();
  const filePath = path.join(memoriesPath, 'raw.json');

  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return; // File doesn't exist yet
    }
    throw error;
  }
}

/**
 * Write daily summary (single file with all channels)
 */
export async function writeDailySummary(
  date: string,
  channelSummaries: Map<string, string> // channelName -> summary
): Promise<void> {
  const dailyPath = getServerDailyMemoriesPath();
  await fs.mkdir(dailyPath, { recursive: true });

  const filePath = path.join(dailyPath, `${date}.md`);

  // Format with arrow bracket delimiters
  let content = `# Daily Summary: ${date}\n\n`;

  for (const [channelName, summary] of channelSummaries) {
    content += `< #${channelName} >\n${summary}\n\n`;
  }

  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read daily summary (entire file)
 */
export async function readDailySummary(
  date: string
): Promise<string | null> {
  const dailyPath = getServerDailyMemoriesPath();
  const filePath = path.join(dailyPath, `${date}.md`);

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
 * Write weekly summary (single file with all channels)
 */
export async function writeWeeklySummary(
  weekIdentifier: string,
  channelSummaries: Map<string, string>
): Promise<void> {
  const weeklyPath = getServerWeeklyMemoriesPath();
  await fs.mkdir(weeklyPath, { recursive: true });

  const filePath = path.join(weeklyPath, `${weekIdentifier}.md`);

  // Format with arrow bracket delimiters
  let content = `# Weekly Summary: ${weekIdentifier}\n\n`;

  for (const [channelName, summary] of channelSummaries) {
    content += `< #${channelName} >\n${summary}\n\n`;
  }

  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read weekly summary (entire file)
 */
export async function readWeeklySummary(
  weekIdentifier: string
): Promise<string | null> {
  const weeklyPath = getServerWeeklyMemoriesPath();
  const filePath = path.join(weeklyPath, `${weekIdentifier}.md`);

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
 * Write monthly summary (single file with all channels)
 */
export async function writeMonthlySummary(
  monthIdentifier: string,
  channelSummaries: Map<string, string>
): Promise<void> {
  const monthlyPath = getServerMonthlyMemoriesPath();
  await fs.mkdir(monthlyPath, { recursive: true });

  const filePath = path.join(monthlyPath, `${monthIdentifier}.md`);

  // Format with arrow bracket delimiters
  let content = `# Monthly Summary: ${monthIdentifier}\n\n`;

  for (const [channelName, summary] of channelSummaries) {
    content += `< #${channelName} >\n${summary}\n\n`;
  }

  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read monthly summary (entire file)
 */
export async function readMonthlySummary(
  monthIdentifier: string
): Promise<string | null> {
  const monthlyPath = getServerMonthlyMemoriesPath();
  const filePath = path.join(monthlyPath, `${monthIdentifier}.md`);

  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

