import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { RawMessage } from '../memory/manager.js';

const TOKEN_BUDGET = 30000;
const MAX_DAYS_BACK = 7;

function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

function getDateStrings(daysBack: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates; // newest first
}

const schema = z.object({
  channelId: z.string().optional().describe('Specific channel ID to retrieve conversations from. Omit to retrieve from all channels.'),
  daysBack: z.number().optional().describe('Number of days of history to retrieve (1-7). Defaults to 3.'),
});

export function createTool(getHomeDirectory: () => string, getChannelNames: () => Map<string, string>) {
  return tool(
    'retrieve_conversations',
    'Retrieve conversation history from this Discord server. Use this when you need context about past conversations, what people discussed, or what actions were taken. Returns raw messages with timestamps, grouped by date and channel.',
    schema.shape,
    async ({ channelId, daysBack = 3 }) => {
      try {
        const clampedDaysBack = Math.min(Math.max(1, daysBack), MAX_DAYS_BACK);
        const home = getHomeDirectory() || process.env.HOME || os.homedir();
        const channelNames = getChannelNames();
        const memoryDir = path.join(home, '.claude', 'memory_v2');
        const dates = getDateStrings(clampedDaysBack);

        let totalTokens = 0;
        let truncated = false;
        const sections: string[] = [];
        const channelsFound = new Set<string>();

        for (const date of dates) {
          if (truncated) break;

          const filePath = path.join(memoryDir, `${date}.json`);

          let data: Record<string, RawMessage[]>;
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            data = JSON.parse(content);
          } catch {
            continue; // no file for this date
          }

          const channelIds = channelId ? [channelId] : Object.keys(data);
          const dateSections: string[] = [];

          for (const chId of channelIds) {
            if (truncated) break;

            const messages = data[chId];
            if (!messages || messages.length === 0) continue;

            const channelName = channelNames.get(chId) || chId;
            channelsFound.add(channelName);

            let channelMarkdown = `### #${channelName}\n`;
            for (const msg of messages) {
              const time = formatTime(msg.timestamp);
              channelMarkdown += `[${time}] ${msg.username}: ${msg.text}\n`;
              if (msg.thread) {
                for (const reply of msg.thread) {
                  const replyTime = formatTime(reply.timestamp);
                  channelMarkdown += `  [${replyTime}] ${reply.username}: ${reply.text}\n`;
                }
              }
            }

            const tokens = countTokens(channelMarkdown);
            if (totalTokens + tokens > TOKEN_BUDGET) {
              truncated = true;
              break;
            }

            totalTokens += tokens;
            dateSections.push(channelMarkdown);
          }

          if (dateSections.length > 0) {
            sections.push(`## ${date}\n\n${dateSections.join('\n')}`);
          }
        }

        const conversations = sections.join('\n\n');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                conversations: conversations || '(no conversations found)',
                metadata: {
                  dateRange: {
                    from: dates[dates.length - 1],
                    to: dates[0],
                  },
                  channels: Array.from(channelsFound),
                  tokenCount: totalTokens,
                  truncated,
                },
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Failed to retrieve conversations: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
