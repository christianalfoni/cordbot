import {
  listDailyMemories,
  listWeeklyMemories,
  listMonthlyMemories,
  readDailyMemory,
  readWeeklyMemory,
  readMonthlyMemory,
  readRawMemories,
  readAllRawFiles,
  readRawFile,
  readDailySummary,
  readWeeklySummary,
  readMonthlySummary,
  type RawMemoryEntry,
} from './storage.js';

/**
 * Count tokens in a string using rough approximation
 * Average is ~4 characters per token for English text
 */
export function countTokens(text: string): number {
  // Rough approximation: 4 chars per token
  // This is good enough for budget estimation
  return Math.ceil(text.length / 4);
}

export interface LoadedMemory {
  type: 'raw' | 'daily' | 'weekly' | 'monthly';
  identifier: string; // date, week, or month
  channelName: string; // NEW: For server-wide memory
  content: string;
  tokenCount: number;
}

export interface MemoryLoadResult {
  memories: LoadedMemory[];
  totalTokens: number;
  budgetUsed: number;
}

/**
 * Load memories for a channel, working backwards from most recent to oldest,
 * until the token budget is exhausted.
 */
export async function loadMemoriesForChannel(
  channelId: string,
  tokenBudget: number
): Promise<MemoryLoadResult> {
  const memories: LoadedMemory[] = [];
  let totalTokens = 0;

  // Helper to add memory if it fits in budget
  const tryAddMemory = (memory: LoadedMemory): boolean => {
    if (totalTokens + memory.tokenCount <= tokenBudget) {
      memories.push(memory);
      totalTokens += memory.tokenCount;
      return true;
    }
    return false;
  };

  // 1. Load today's raw memories (most recent, highest fidelity)
  const today = new Date().toISOString().split('T')[0];
  const rawEntries = await readRawMemories(channelId, today);

  if (rawEntries.length > 0) {
    const rawContent = rawEntries.map(e => e.message).join('\n\n');
    const rawMemory: LoadedMemory = {
      type: 'raw',
      identifier: today,
      channelName: rawEntries[0]?.channelName || 'current',
      content: rawContent,
      tokenCount: countTokens(rawContent),
    };

    if (!tryAddMemory(rawMemory)) {
      // Even today's raw doesn't fit, truncate it
      const truncatedContent = truncateToTokenBudget(rawContent, tokenBudget);
      memories.push({
        type: 'raw',
        identifier: today,
        channelName: rawEntries[0]?.channelName || 'current',
        content: truncatedContent,
        tokenCount: countTokens(truncatedContent),
      });
      totalTokens = countTokens(truncatedContent);

      return {
        memories,
        totalTokens,
        budgetUsed: (totalTokens / tokenBudget) * 100,
      };
    }
  }

  // 2. Load recent daily summaries (last N days)
  const dailyDates = await listDailyMemories(channelId);
  for (const date of dailyDates) {
    if (date === today) continue; // Already handled raw for today

    const content = await readDailyMemory(channelId, date);
    if (!content) continue;

    const memory: LoadedMemory = {
      type: 'daily',
      identifier: date,
      channelName: 'current',
      content,
      tokenCount: countTokens(content),
    };

    if (!tryAddMemory(memory)) {
      break; // Budget exhausted
    }
  }

  // If still have budget, load weekly summaries
  if (totalTokens < tokenBudget) {
    const weeklyIdentifiers = await listWeeklyMemories(channelId);
    for (const weekId of weeklyIdentifiers) {
      const content = await readWeeklyMemory(channelId, weekId);
      if (!content) continue;

      const memory: LoadedMemory = {
        type: 'weekly',
        identifier: weekId,
        channelName: 'current',
        content,
        tokenCount: countTokens(content),
      };

      if (!tryAddMemory(memory)) {
        break;
      }
    }
  }

  // If still have budget, load monthly summaries
  if (totalTokens < tokenBudget) {
    const monthlyIdentifiers = await listMonthlyMemories(channelId);
    for (const monthId of monthlyIdentifiers) {
      const content = await readMonthlyMemory(channelId, monthId);
      if (!content) continue;

      const memory: LoadedMemory = {
        type: 'monthly',
        identifier: monthId,
        channelName: 'current',
        content,
        tokenCount: countTokens(content),
      };

      if (!tryAddMemory(memory)) {
        break;
      }
    }
  }

  return {
    memories,
    totalTokens,
    budgetUsed: (totalTokens / tokenBudget) * 100,
  };
}

/**
 * Truncate text to fit within a token budget
 */
function truncateToTokenBudget(text: string, tokenBudget: number): string {
  const estimatedTokens = countTokens(text);

  if (estimatedTokens <= tokenBudget) {
    return text;
  }

  // Rough calculation: if we need X tokens, we need ~4X characters
  const targetChars = tokenBudget * 4;
  const truncated = text.substring(0, targetChars);

  return truncated + '\n\n[... truncated to fit memory budget]';
}

/**
 * Format loaded memories into a markdown section for CLAUDE.md
 */
export function formatMemoriesForClaudeMd(loadResult: MemoryLoadResult): string {
  if (loadResult.memories.length === 0) {
    return '';
  }

  // Group by type
  const rawMemories = loadResult.memories.filter(m => m.type === 'raw');
  const dailyMemories = loadResult.memories.filter(m => m.type === 'daily');
  const weeklyMemories = loadResult.memories.filter(m => m.type === 'weekly');
  const monthlyMemories = loadResult.memories.filter(m => m.type === 'monthly');

  let output = '';

  // Recent Memory: Today and recent days
  const hasRecentMemory = rawMemories.length > 0 || dailyMemories.length > 0;
  if (hasRecentMemory) {
    output += '## Recent Memory\n\n';

    // Raw (today's activity)
    if (rawMemories.length > 0) {
      output += '### Today\n\n';
      for (const mem of rawMemories) {
        output += mem.content + '\n\n';
      }
    }

    // Daily summaries
    if (dailyMemories.length > 0) {
      for (const mem of dailyMemories) {
        output += `### ${mem.identifier}\n\n${mem.content}\n\n`;
      }
    }
  }

  // Long Term Memory: Weeks and months
  const hasLongTermMemory = weeklyMemories.length > 0 || monthlyMemories.length > 0;
  if (hasLongTermMemory) {
    output += '## Long Term Memory\n\n';

    // Weekly summaries
    if (weeklyMemories.length > 0) {
      for (const mem of weeklyMemories) {
        output += `### Week ${mem.identifier}\n\n${mem.content}\n\n`;
      }
    }

    // Monthly summaries
    if (monthlyMemories.length > 0) {
      for (const mem of monthlyMemories) {
        output += `### ${mem.identifier}\n\n${mem.content}\n\n`;
      }
    }
  }

  return output;
}

// ============================================================================
// Server-Wide Memory Loading (NEW)
// ============================================================================

/**
 * Helper to get recent date strings
 */
function getRecentDates(count: number, skipDays: number = 0): string[] {
  const dates: string[] = [];
  for (let i = skipDays; i < count + skipDays; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

/**
 * Helper to get recent week identifiers
 */
function getRecentWeeks(count: number): string[] {
  const weeks: string[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    weeks.push(`${year}-W${week.toString().padStart(2, '0')}`);
  }

  return weeks;
}

/**
 * Helper to get week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Helper to get recent month identifiers
 */
function getRecentMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    months.push(`${year}-${month}`);
  }

  return months;
}

/**
 * Load memories server-wide with current channel prioritization
 * Uses in-memory manager with markdown conversion
 */
export async function loadMemoriesForServer(
  currentChannelId: string,
  currentChannelName: string,
  allChannelNames: string[],
  tokenBudget: number
): Promise<MemoryLoadResult> {
  const memories: LoadedMemory[] = [];
  let totalTokens = 0;

  // Helper to add memory if it fits budget
  const tryAddMemory = (memory: LoadedMemory): boolean => {
    if (totalTokens + memory.tokenCount <= tokenBudget) {
      memories.push(memory);
      totalTokens += memory.tokenCount;
      return true;
    }
    return false;
  };

  // 1. Load today's raw messages from memory manager (current channel first)
  const { memoryManager } = await import('./manager.js');
  const allChannelIds = memoryManager.getChannelIds();

  // Load current channel first
  if (allChannelIds.includes(currentChannelId)) {
    const markdown = memoryManager.convertToMarkdown(currentChannelId);
    if (markdown.trim()) {
      const tokenCount = countTokens(markdown);

      if (!tryAddMemory({
        type: 'raw',
        identifier: 'today',
        channelName: currentChannelName,
        content: markdown,
        tokenCount,
      })) {
        // Budget exhausted
        return { memories, totalTokens, budgetUsed: 100 };
      }
    }
  }

  // Then load other channels
  for (const channelId of allChannelIds) {
    if (channelId === currentChannelId) continue; // Already loaded

    const markdown = memoryManager.convertToMarkdown(channelId);
    if (markdown.trim()) {
      const tokenCount = countTokens(markdown);

      // Find channel name if available
      const channelName = channelId; // Use ID as fallback

      if (!tryAddMemory({
        type: 'raw',
        identifier: 'today',
        channelName,
        content: markdown,
        tokenCount,
      })) {
        // Budget exhausted
        return { memories, totalTokens, budgetUsed: 100 };
      }
    }
  }

  // 3. Load recent daily summaries (entire file, all channels)
  const dates = getRecentDates(7, 2); // Last 7 days, skip today and yesterday

  for (const date of dates) {
    const summary = await readDailySummary(date);

    if (summary) {
      const tokenCount = countTokens(summary);
      if (!tryAddMemory({
        type: 'daily',
        identifier: date,
        channelName: 'all', // Single file contains all channels
        content: summary,
        tokenCount,
      })) {
        return { memories, totalTokens, budgetUsed: 100 };
      }
    }
  }

  // 4. Load weekly summaries (entire file, all channels)
  if (totalTokens < tokenBudget) {
    const weeks = getRecentWeeks(4); // Last 4 weeks
    for (const week of weeks) {
      const summary = await readWeeklySummary(week);

      if (summary) {
        const tokenCount = countTokens(summary);
        if (!tryAddMemory({
          type: 'weekly',
          identifier: week,
          channelName: 'all',
          content: summary,
          tokenCount,
        })) {
          return { memories, totalTokens, budgetUsed: 100 };
        }
      }
    }
  }

  // 5. Load monthly summaries (entire file, all channels)
  if (totalTokens < tokenBudget) {
    const months = getRecentMonths(6); // Last 6 months
    for (const month of months) {
      const summary = await readMonthlySummary(month);

      if (summary) {
        const tokenCount = countTokens(summary);
        if (!tryAddMemory({
          type: 'monthly',
          identifier: month,
          channelName: 'all',
          content: summary,
          tokenCount,
        })) {
          return { memories, totalTokens, budgetUsed: 100 };
        }
      }
    }
  }

  const budgetUsed = (totalTokens / tokenBudget) * 100;
  return { memories, totalTokens, budgetUsed };
}

/**
 * Format server-wide memories for CLAUDE.md with channel grouping
 */
export function formatMemoriesForServerWideClaudeMd(
  loadResult: MemoryLoadResult,
  currentChannelName: string
): string {
  if (loadResult.memories.length === 0) {
    return '';
  }

  let output = '## Recent Memory\n\n';

  // Group by type and date
  const byTypeAndDate = new Map<string, LoadedMemory[]>();

  for (const memory of loadResult.memories) {
    const key = `${memory.type}:${memory.identifier}`;
    const existing = byTypeAndDate.get(key) || [];
    existing.push(memory);
    byTypeAndDate.set(key, existing);
  }

  // Output in chronological order, current channel highlighted
  for (const [key, memories] of byTypeAndDate) {
    const [type, identifier] = key.split(':');

    output += `### ${identifier} (${type})\n\n`;

    // Current channel first
    const currentChannel = memories.find(m => m.channelName === currentChannelName);
    if (currentChannel) {
      output += `**#${currentChannel.channelName}** (current):\n${currentChannel.content}\n\n`;
    }

    // Other channels
    for (const memory of memories) {
      if (memory.channelName === currentChannelName) continue;
      if (memory.channelName === 'all') {
        // Summary file containing all channels
        output += `${memory.content}\n\n`;
      } else {
        output += `**#${memory.channelName}**:\n${memory.content}\n\n`;
      }
    }
  }

  return output;
}
