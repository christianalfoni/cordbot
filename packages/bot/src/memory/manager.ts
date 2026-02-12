import { promises as fs } from 'fs';
import path from 'path';
import { getServerMemoriesPath } from './storage.js';

/**
 * Raw message structure stored in memory
 */
export interface RawMessage {
  messageId: string;
  username: string;
  text: string;
  thread?: ThreadReply[];
}

export interface ThreadReply {
  username: string;
  text: string;
}

/**
 * In-memory storage for raw messages
 * Key: channelId, Value: array of messages with nested threads
 */
class MemoryManager {
  private memories = new Map<string, RawMessage[]>();
  private writeTimers = new Map<string, NodeJS.Timeout>();
  private lastWriteTimes = new Map<string, number>();
  private readonly THROTTLE_MS = 30000; // 30 seconds

  /**
   * Add a channel message
   */
  addChannelMessage(
    channelId: string,
    messageId: string,
    username: string,
    text: string
  ): void {
    if (!this.memories.has(channelId)) {
      this.memories.set(channelId, []);
    }

    const messages = this.memories.get(channelId)!;
    messages.push({
      messageId,
      username,
      text,
    });

    this.scheduleThrottledWrite(channelId);
  }

  /**
   * Add a thread reply
   */
  addThreadReply(
    channelId: string,
    threadId: string,
    username: string,
    text: string
  ): void {
    const messages = this.memories.get(channelId);
    if (!messages) {
      console.error(`[Memory] No messages for channel ${channelId}`);
      return;
    }

    // Find the message that started this thread
    // In Discord, the threadId is often the same as the starter message ID
    const starterMessage = messages.find(m => m.messageId === threadId);

    if (starterMessage) {
      if (!starterMessage.thread) {
        starterMessage.thread = [];
      }
      starterMessage.thread.push({ username, text });
    } else {
      console.warn(`[Memory] Thread starter ${threadId} not found in channel ${channelId}`);
      // Fallback: add as a regular message with a note
      messages.push({
        messageId: `thread-${threadId}-${Date.now()}`,
        username,
        text: `[In thread] ${text}`,
      });
    }

    this.scheduleThrottledWrite(channelId);
  }

  /**
   * Schedule throttled write to disk
   * Ensures writes happen at most once every THROTTLE_MS
   */
  private scheduleThrottledWrite(channelId: string): void {
    const now = Date.now();
    const lastWrite = this.lastWriteTimes.get(channelId) || 0;
    const timeSinceLastWrite = now - lastWrite;

    // If we already have a timer scheduled, don't schedule another
    if (this.writeTimers.has(channelId)) {
      return;
    }

    // If enough time has passed, write immediately
    if (timeSinceLastWrite >= this.THROTTLE_MS) {
      this.writeToDisk(channelId);
      this.lastWriteTimes.set(channelId, now);
      return;
    }

    // Otherwise, schedule a write for when the throttle period expires
    const delay = this.THROTTLE_MS - timeSinceLastWrite;
    const timer = setTimeout(() => {
      this.writeToDisk(channelId);
      this.lastWriteTimes.set(channelId, Date.now());
      this.writeTimers.delete(channelId);
    }, delay);

    this.writeTimers.set(channelId, timer);
  }

  /**
   * Write all channel memories to disk (single file)
   */
  private async writeToDisk(channelId: string): Promise<void> {
    // Write entire memory map to single file
    const memoriesPath = getServerMemoriesPath();
    await fs.mkdir(memoriesPath, { recursive: true });

    const filePath = path.join(memoriesPath, 'raw.json');

    // Convert Map to object for JSON serialization
    const data: Record<string, RawMessage[]> = {};
    for (const [chId, messages] of this.memories.entries()) {
      data[chId] = messages;
    }

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`[Memory] Wrote memories for ${this.memories.size} channels to raw.json`);
  }

  /**
   * Force write all channels to disk (for shutdown)
   */
  async flushAll(): Promise<void> {
    // Clear all timers
    for (const timer of this.writeTimers.values()) {
      clearTimeout(timer);
    }
    this.writeTimers.clear();

    // Write entire memory map to single file
    if (this.memories.size > 0) {
      const memoriesPath = getServerMemoriesPath();
      await fs.mkdir(memoriesPath, { recursive: true });

      const filePath = path.join(memoriesPath, 'raw.json');

      // Convert Map to object for JSON serialization
      const data: Record<string, RawMessage[]> = {};
      for (const [chId, messages] of this.memories.entries()) {
        data[chId] = messages;
      }

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

      console.log(`[Memory] Flushed ${this.memories.size} channels to raw.json`);
    }
  }

  /**
   * Load memories from disk on startup
   */
  async loadFromDisk(): Promise<void> {
    const memoriesPath = getServerMemoriesPath();
    const filePath = path.join(memoriesPath, 'raw.json');

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data: Record<string, RawMessage[]> = JSON.parse(content);

      // Load data into memory Map
      let totalMessages = 0;
      for (const [channelId, messages] of Object.entries(data)) {
        this.memories.set(channelId, messages);
        totalMessages += messages.length;
      }

      console.log(`[Memory] Loaded ${totalMessages} messages across ${Object.keys(data).length} channels from raw.json`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('[Memory] No existing raw.json found - starting fresh');
        return;
      }
      throw error;
    }
  }

  /**
   * Convert channel memories to markdown format
   */
  convertToMarkdown(channelId: string): string {
    const messages = this.memories.get(channelId);
    if (!messages || messages.length === 0) {
      return '';
    }

    let markdown = '';

    for (const message of messages) {
      // Main message
      markdown += `[${message.username}]: ${message.text}\n`;

      // Thread replies (indented)
      if (message.thread && message.thread.length > 0) {
        for (const reply of message.thread) {
          markdown += `  [${reply.username}]: ${reply.text}\n`;
        }
      }
    }

    return markdown;
  }

  /**
   * Get all channel IDs with messages
   */
  getChannelIds(): string[] {
    return Array.from(this.memories.keys());
  }

  /**
   * Clear all memories (after compression)
   */
  clearAll(): void {
    this.memories.clear();
    console.log('[Memory] Cleared all in-memory messages');
  }

  /**
   * Clear memories for a specific channel
   */
  clearChannel(channelId: string): void {
    this.memories.delete(channelId);
    console.log(`[Memory] Cleared messages for channel ${channelId}`);
  }
}

// Singleton instance
export const memoryManager = new MemoryManager();
