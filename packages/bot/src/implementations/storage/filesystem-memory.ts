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
} from '../../memory/storage.js';
import { loadMemoriesForChannel, loadMemoriesForServer } from '../../memory/loader.js';

/**
 * Filesystem memory store implementation
 * Wraps the existing memory storage functions
 */
export class FileSystemMemoryStore implements IMemoryStore {
  constructor(private homeDirectory: string) {}

  async saveRawMemory(channelId: string, entries: RawMemoryEntry[]): Promise<void> {
    // This implementation is kept for backward compatibility
    // But new code should use appendRawMemoryServerWide directly
    // For now, just a placeholder - not actively used
  }

  async loadRawMemories(channelId: string, date: string): Promise<RawMemoryEntry[]> {
    const storageEntries = await storageReadRawMemories(channelId, date);

    // Return entries as-is (they already match the new RawMemoryEntry interface)
    return storageEntries;
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
    }

    return {
      content,
      tokensUsed: result.totalTokens,
      sources,
    };
  }

  async loadMemoriesForServer(
    currentChannelId: string,
    allChannelIds: string[],
    tokenBudget: number
  ): Promise<MemoryLoadResult> {
    // For now, just delegate to the single-channel loader
    // In a full implementation, this would call the server-wide loader
    // But the interface mismatch makes it complex to implement here
    // The actual code uses the loader directly in sync.ts
    return this.loadMemoriesForChannel(currentChannelId, tokenBudget);
  }

  getChannelMemoryPath(channelId: string): string {
    return getMemoriesPath(channelId, this.homeDirectory);
  }
}
