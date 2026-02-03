import type {
  IMemoryStore,
  RawMemoryEntry,
  MemoryLoadResult,
} from '../../interfaces/storage.js';
import {
  getMemoriesPath,
  appendRawMemory as storageAppendRawMemory,
  readRawMemories as storageReadRawMemories,
  writeDailyMemory,
  readDailyMemory,
  writeWeeklyMemory,
  readWeeklyMemory,
  writeMonthlyMemory,
  readMonthlyMemory,
  writeYearlyMemory,
  readYearlyMemory,
} from '../../memory/storage.js';
import { loadMemoriesForChannel } from '../../memory/loader.js';

/**
 * Filesystem memory store implementation
 * Wraps the existing memory storage functions
 */
export class FileSystemMemoryStore implements IMemoryStore {
  async saveRawMemory(channelId: string, entries: RawMemoryEntry[]): Promise<void> {
    // Convert interface format to storage format and append each entry
    for (const entry of entries) {
      await storageAppendRawMemory(channelId, {
        timestamp: new Date(entry.timestamp).toISOString(),
        message: `[${entry.author}] ${entry.content}`,
        sessionId: '', // Not used in current implementation
        threadId: entry.channelId,
      });
    }
  }

  async loadRawMemories(channelId: string, date: string): Promise<RawMemoryEntry[]> {
    const storageEntries = await storageReadRawMemories(channelId, date);

    // Convert storage format to interface format
    return storageEntries.map(entry => {
      // Parse out author from message format: [author] content
      const match = entry.message.match(/^\[([^\]]+)\] (.+)$/);
      const author = match ? match[1] : 'unknown';
      const content = match ? match[2] : entry.message;

      return {
        timestamp: new Date(entry.timestamp).getTime(),
        author,
        content,
        channelId: entry.threadId || channelId,
      };
    });
  }

  async saveDailyMemory(channelId: string, date: string, content: string): Promise<void> {
    await writeDailyMemory(channelId, date, content);
  }

  async loadDailyMemory(channelId: string, date: string): Promise<string | null> {
    return await readDailyMemory(channelId, date);
  }

  async saveWeeklyMemory(channelId: string, weekStart: string, content: string): Promise<void> {
    await writeWeeklyMemory(channelId, weekStart, content);
  }

  async loadWeeklyMemory(channelId: string, weekStart: string): Promise<string | null> {
    return await readWeeklyMemory(channelId, weekStart);
  }

  async saveMonthlyMemory(channelId: string, month: string, content: string): Promise<void> {
    await writeMonthlyMemory(channelId, month, content);
  }

  async loadMonthlyMemory(channelId: string, month: string): Promise<string | null> {
    return await readMonthlyMemory(channelId, month);
  }

  async saveYearlyMemory(channelId: string, year: string, content: string): Promise<void> {
    await writeYearlyMemory(channelId, year, content);
  }

  async loadYearlyMemory(channelId: string, year: string): Promise<string | null> {
    return await readYearlyMemory(channelId, year);
  }

  async loadMemoriesForChannel(channelId: string, tokenBudget: number): Promise<MemoryLoadResult> {
    const result = await loadMemoriesForChannel(channelId, tokenBudget);

    // Convert to interface format
    const content = result.memories
      .map(m => `# ${m.type.toUpperCase()} - ${m.identifier}\n\n${m.content}`)
      .join('\n\n---\n\n');

    const sources: MemoryLoadResult['sources'] = {};
    for (const memory of result.memories) {
      if (memory.type === 'raw') sources.raw = (sources.raw || 0) + 1;
      if (memory.type === 'daily') sources.daily = (sources.daily || 0) + 1;
      if (memory.type === 'weekly') sources.weekly = (sources.weekly || 0) + 1;
      if (memory.type === 'monthly') sources.monthly = (sources.monthly || 0) + 1;
      if (memory.type === 'yearly') sources.yearly = (sources.yearly || 0) + 1;
    }

    return {
      content,
      tokensUsed: result.totalTokens,
      sources,
    };
  }

  getChannelMemoryPath(channelId: string): string {
    return getMemoriesPath(channelId);
  }
}
