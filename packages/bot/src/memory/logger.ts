import { promises as fs } from 'fs';
import path from 'path';

/**
 * Memory operation log entry types
 */
export type MemoryLogType =
  | 'raw_captured'      // Raw message captured
  | 'daily_compressed'  // Daily compression completed
  | 'weekly_compressed' // Weekly compression completed
  | 'monthly_compressed' // Monthly compression completed
  | 'yearly_compressed' // Yearly compression completed
  | 'memory_loaded';    // Memories loaded for a query

export interface MemoryLogEntry {
  timestamp: string;
  type: MemoryLogType;
  channelId: string;
  details: Record<string, any>;
}

/**
 * Get the memory logs file path
 */
function getMemoryLogsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.claude', 'storage', 'memory-logs.jsonl');
}

/**
 * Ensure the logs directory exists
 */
async function ensureLogsDirectory(workspaceRoot: string): Promise<void> {
  const logsDir = path.dirname(getMemoryLogsPath(workspaceRoot));
  await fs.mkdir(logsDir, { recursive: true });
}

/**
 * Append a log entry to the memory logs file
 */
async function appendLogEntry(workspaceRoot: string, entry: MemoryLogEntry): Promise<void> {
  await ensureLogsDirectory(workspaceRoot);
  const logPath = getMemoryLogsPath(workspaceRoot);
  const line = JSON.stringify(entry) + '\n';
  await fs.appendFile(logPath, line, 'utf-8');
}

/**
 * Log when a raw message is captured
 */
export async function logRawMemoryCaptured(
  workspaceRoot: string,
  channelId: string,
  messageLength: number,
  sessionId: string
): Promise<void> {
  const entry: MemoryLogEntry = {
    timestamp: new Date().toISOString(),
    type: 'raw_captured',
    channelId,
    details: {
      messageLength,
      sessionId,
    },
  };

  await appendLogEntry(workspaceRoot, entry);
  console.log(`[Memory] Raw message captured for channel ${channelId} (${messageLength} chars)`);
}

/**
 * Log when daily compression is completed
 */
export async function logDailyCompression(
  workspaceRoot: string,
  channelId: string,
  date: string,
  rawMessageCount: number,
  summaryLength: number,
  tokenCount: number
): Promise<void> {
  const entry: MemoryLogEntry = {
    timestamp: new Date().toISOString(),
    type: 'daily_compressed',
    channelId,
    details: {
      date,
      rawMessageCount,
      summaryLength,
      tokenCount,
    },
  };

  await appendLogEntry(workspaceRoot, entry);
  console.log(
    `[Memory] Daily compression completed for ${channelId} on ${date}: ${rawMessageCount} messages → ${tokenCount} tokens`
  );
}

/**
 * Log when weekly compression is completed
 */
export async function logWeeklyCompression(
  workspaceRoot: string,
  channelId: string,
  weekIdentifier: string,
  dailySummaryCount: number,
  summaryLength: number,
  tokenCount: number
): Promise<void> {
  const entry: MemoryLogEntry = {
    timestamp: new Date().toISOString(),
    type: 'weekly_compressed',
    channelId,
    details: {
      weekIdentifier,
      dailySummaryCount,
      summaryLength,
      tokenCount,
    },
  };

  await appendLogEntry(workspaceRoot, entry);
  console.log(
    `[Memory] Weekly compression completed for ${channelId} (${weekIdentifier}): ${dailySummaryCount} days → ${tokenCount} tokens`
  );
}

/**
 * Log when monthly compression is completed
 */
export async function logMonthlyCompression(
  workspaceRoot: string,
  channelId: string,
  monthIdentifier: string,
  weeklySummaryCount: number,
  summaryLength: number,
  tokenCount: number
): Promise<void> {
  const entry: MemoryLogEntry = {
    timestamp: new Date().toISOString(),
    type: 'monthly_compressed',
    channelId,
    details: {
      monthIdentifier,
      weeklySummaryCount,
      summaryLength,
      tokenCount,
    },
  };

  await appendLogEntry(workspaceRoot, entry);
  console.log(
    `[Memory] Monthly compression completed for ${channelId} (${monthIdentifier}): ${weeklySummaryCount} weeks → ${tokenCount} tokens`
  );
}

/**
 * Log when yearly compression is completed
 */
export async function logYearlyCompression(
  workspaceRoot: string,
  channelId: string,
  year: string,
  monthlySummaryCount: number,
  summaryLength: number,
  tokenCount: number
): Promise<void> {
  const entry: MemoryLogEntry = {
    timestamp: new Date().toISOString(),
    type: 'yearly_compressed',
    channelId,
    details: {
      year,
      monthlySummaryCount,
      summaryLength,
      tokenCount,
    },
  };

  await appendLogEntry(workspaceRoot, entry);
  console.log(
    `[Memory] Yearly compression completed for ${channelId} (${year}): ${monthlySummaryCount} months → ${tokenCount} tokens`
  );
}

/**
 * Log when memories are loaded for a query
 */
export async function logMemoryLoaded(
  workspaceRoot: string,
  channelId: string,
  sessionId: string,
  memoriesLoaded: Array<{ type: string; identifier: string; tokenCount: number }>,
  totalTokens: number,
  budgetUsed: number
): Promise<void> {
  const entry: MemoryLogEntry = {
    timestamp: new Date().toISOString(),
    type: 'memory_loaded',
    channelId,
    details: {
      sessionId,
      memoriesLoaded,
      totalTokens,
      budgetUsed,
    },
  };

  await appendLogEntry(workspaceRoot, entry);
  console.log(
    `[Memory] Loaded ${memoriesLoaded.length} memories for ${channelId}: ${totalTokens} tokens (${Math.round(budgetUsed)}% of budget)`
  );
}

/**
 * Read recent memory log entries (last N entries)
 */
export async function readRecentLogs(
  workspaceRoot: string,
  limit: number = 100
): Promise<MemoryLogEntry[]> {
  const logPath = getMemoryLogsPath(workspaceRoot);

  try {
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const entries = lines.map(line => JSON.parse(line) as MemoryLogEntry);

    // Return last N entries
    return entries.slice(-limit);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []; // Log file doesn't exist yet
    }
    throw error;
  }
}

/**
 * Get memory statistics for a channel
 */
export async function getChannelMemoryStats(
  workspaceRoot: string,
  channelId: string
): Promise<{
  rawMessagesCaptured: number;
  dailyCompressionsCount: number;
  weeklyCompressionsCount: number;
  monthlyCompressionsCount: number;
  yearlyCompressionsCount: number;
  memoriesLoadedCount: number;
}> {
  const logs = await readRecentLogs(workspaceRoot, 10000); // Read last 10k entries
  const channelLogs = logs.filter(entry => entry.channelId === channelId);

  return {
    rawMessagesCaptured: channelLogs.filter(e => e.type === 'raw_captured').length,
    dailyCompressionsCount: channelLogs.filter(e => e.type === 'daily_compressed').length,
    weeklyCompressionsCount: channelLogs.filter(e => e.type === 'weekly_compressed').length,
    monthlyCompressionsCount: channelLogs.filter(e => e.type === 'monthly_compressed').length,
    yearlyCompressionsCount: channelLogs.filter(e => e.type === 'yearly_compressed').length,
    memoriesLoadedCount: channelLogs.filter(e => e.type === 'memory_loaded').length,
  };
}
