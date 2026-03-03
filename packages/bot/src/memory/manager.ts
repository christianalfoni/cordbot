import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Format an ISO timestamp to a compact HH:MM UTC string
 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

/**
 * Raw message structure stored in memory
 */
export interface RawMessage {
  messageId: string;
  username: string;
  timestamp: string; // ISO 8601 UTC string
  text: string;
  thread?: ThreadReply[];
}

export interface ThreadReply {
  username: string;
  timestamp: string; // ISO 8601 UTC string
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
  private readonly RETENTION_DAYS = 7;

  private getMemoryV2Path(): string {
    const home = process.env.HOME || os.homedir();
    return path.join(home, '.claude', 'memory_v2');
  }

  private getTodayFilePath(): string {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.getMemoryV2Path(), `${today}.json`);
  }

  /**
   * Add a channel message
   */
  addChannelMessage(
    channelId: string,
    messageId: string,
    username: string,
    text: string,
    createdAt: Date = new Date()
  ): void {
    if (!this.memories.has(channelId)) {
      this.memories.set(channelId, []);
    }

    const messages = this.memories.get(channelId)!;
    messages.push({
      messageId,
      username,
      timestamp: createdAt.toISOString(),
      text,
    });

    this.scheduleThrottledWrite(channelId);
  }

  /**
   * Add an action entry (tool use or file upload) to memory
   */
  addAction(
    channelId: string,
    description: string,
    timestamp: Date = new Date()
  ): void {
    if (!this.memories.has(channelId)) {
      this.memories.set(channelId, []);
    }

    const messages = this.memories.get(channelId)!;
    messages.push({
      messageId: `action-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      username: 'Cord',
      timestamp: timestamp.toISOString(),
      text: description,
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
    text: string,
    createdAt: Date = new Date()
  ): void {
    const messages = this.memories.get(channelId);
    if (!messages) {
      console.error(`[Memory] No messages for channel ${channelId}`);
      return;
    }

    // Find the message that started this thread
    const starterMessage = messages.find(m => m.messageId === threadId);

    if (starterMessage) {
      if (!starterMessage.thread) {
        starterMessage.thread = [];
      }
      starterMessage.thread.push({ username, timestamp: createdAt.toISOString(), text });
    } else {
      console.warn(`[Memory] Thread starter ${threadId} not found in channel ${channelId}`);
      // Fallback: add as a regular message with a note
      messages.push({
        messageId: `thread-${threadId}-${Date.now()}`,
        username,
        timestamp: createdAt.toISOString(),
        text: `[In thread] ${text}`,
      });
    }

    this.scheduleThrottledWrite(channelId);
  }

  /**
   * Schedule throttled write to disk
   */
  private scheduleThrottledWrite(channelId: string): void {
    const now = Date.now();
    const lastWrite = this.lastWriteTimes.get(channelId) || 0;
    const timeSinceLastWrite = now - lastWrite;

    if (this.writeTimers.has(channelId)) {
      return;
    }

    if (timeSinceLastWrite >= this.THROTTLE_MS) {
      this.writeToDisk();
      this.lastWriteTimes.set(channelId, now);
      return;
    }

    const delay = this.THROTTLE_MS - timeSinceLastWrite;
    const timer = setTimeout(() => {
      this.writeToDisk();
      this.lastWriteTimes.set(channelId, Date.now());
      this.writeTimers.delete(channelId);
    }, delay);

    this.writeTimers.set(channelId, timer);
  }

  /**
   * Write all channel memories to today's date file
   */
  private async writeToDisk(): Promise<void> {
    const dirPath = this.getMemoryV2Path();
    await fs.mkdir(dirPath, { recursive: true });

    const filePath = this.getTodayFilePath();

    const data: Record<string, RawMessage[]> = {};
    for (const [chId, messages] of this.memories.entries()) {
      data[chId] = messages;
    }

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[Memory] Wrote memories for ${this.memories.size} channels to ${path.basename(filePath)}`);
  }

  /**
   * Force write all channels to disk (for shutdown)
   */
  async flushAll(): Promise<void> {
    for (const timer of this.writeTimers.values()) {
      clearTimeout(timer);
    }
    this.writeTimers.clear();

    if (this.memories.size > 0) {
      await this.writeToDisk();
      console.log(`[Memory] Flushed ${this.memories.size} channels`);
    }
  }

  /**
   * Load today's memories from disk on startup, and prune old files
   */
  async loadFromDisk(): Promise<void> {
    await this.pruneOldFiles();

    const filePath = this.getTodayFilePath();
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data: Record<string, RawMessage[]> = JSON.parse(content);

      let totalMessages = 0;
      for (const [channelId, messages] of Object.entries(data)) {
        this.memories.set(channelId, messages);
        totalMessages += messages.length;
      }

      console.log(`[Memory] Loaded ${totalMessages} messages across ${Object.keys(data).length} channels from today's file`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('[Memory] No existing file for today - starting fresh');
        return;
      }
      throw error;
    }
  }

  /**
   * Delete memory files older than RETENTION_DAYS
   */
  private async pruneOldFiles(): Promise<void> {
    const dirPath = this.getMemoryV2Path();
    try {
      await fs.mkdir(dirPath, { recursive: true });
      const files = await fs.readdir(dirPath);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.RETENTION_DAYS);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const date = file.replace('.json', '');
        if (date < cutoffStr) {
          await fs.unlink(path.join(dirPath, file));
          console.log(`[Memory] Pruned old file: ${file}`);
        }
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') return;
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
      const time = formatTime(message.timestamp);
      markdown += `[${time}] ${message.username}: ${message.text}\n`;

      if (message.thread && message.thread.length > 0) {
        for (const reply of message.thread) {
          const replyTime = formatTime(reply.timestamp);
          markdown += `  [${replyTime}] ${reply.username}: ${reply.text}\n`;
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
}

// Singleton instance
export const memoryManager = new MemoryManager();
