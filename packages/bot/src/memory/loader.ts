import {
  listDailyMemories,
  listWeeklyMemories,
  listMonthlyMemories,
  readDailyMemory,
  readWeeklyMemory,
  readMonthlyMemory,
  readRawMemories,
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
      content: rawContent,
      tokenCount: countTokens(rawContent),
    };

    if (!tryAddMemory(rawMemory)) {
      // Even today's raw doesn't fit, truncate it
      const truncatedContent = truncateToTokenBudget(rawContent, tokenBudget);
      memories.push({
        type: 'raw',
        identifier: today,
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
