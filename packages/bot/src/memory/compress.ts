import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  readRawMemories,
  listDailyMemories,
  listWeeklyMemories,
  listMonthlyMemories,
  readDailyMemory,
  readWeeklyMemory,
  readMonthlyMemory,
  writeDailyMemory,
  writeWeeklyMemory,
  writeMonthlyMemory,
  deleteMonthlyMemory,
  readAllRawFiles,
  clearRawFiles,
  writeDailySummary,
  writeWeeklySummary,
  writeMonthlySummary,
  readDailySummary,
  readWeeklySummary,
} from './storage.js';
import {
  logDailyCompression,
  logWeeklyCompression,
  logMonthlyCompression,
  logMonthlyMemoryDeleted,
} from './logger.js';
import { countTokens } from './loader.js';

/**
 * Get date info for boundary checks
 */
function getDateInfo(date: Date) {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday
  const dayOfMonth = date.getDate();

  return {
    isMonday: dayOfWeek === 1,
    isFirstOfMonth: dayOfMonth === 1,
  };
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get week identifier (ISO week: YYYY-WNN)
 */
function getWeekIdentifier(date: Date): string {
  const year = date.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const daysOffset = Math.floor((date.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((daysOffset + firstDayOfYear.getDay() + 1) / 7);
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Get month identifier (YYYY-MM)
 */
function getMonthIdentifier(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Use Claude to summarize content
 * Returns summary, cost, and token count
 */
async function summarizeWithClaude(content: string, context: string): Promise<{
  text: string;
  cost: number;
  tokenCount: number;
}> {
  const prompt = `${context}

Please summarize the following content into a concise memory summary. Focus on:
- Key events and decisions
- Important user preferences or learnings
- Significant code changes or features added
- Problems solved or bugs fixed

Keep the summary clear and factual. Remove unnecessary details but preserve important context.

Content to summarize:
${content}

Summary:`;

  try {
    // Use Claude SDK with haiku model for cost efficiency
    const result = query({
      prompt,
      options: {
        model: 'claude-3-5-haiku-20241022',
        allowDangerouslySkipPermissions: true,
      },
    });

    let summary = '';
    let cost = 0;

    for await (const message of result) {
      if (message.type === 'assistant') {
        // Extract text from assistant message
        const messageContent = message.message.content;
        if (Array.isArray(messageContent)) {
          for (const block of messageContent) {
            if (block.type === 'text') {
              summary += block.text;
            }
          }
        }

        // Extract cost from usage
        if (message.message.usage?.total_cost) {
          cost = message.message.usage.total_cost;
        }
      }
    }

    const finalSummary = summary.trim() || content;
    return {
      text: finalSummary,
      cost,
      tokenCount: countTokens(finalSummary),
    };
  } catch (error) {
    console.error('Failed to summarize with Claude:', error);
    return {
      text: content,
      cost: 0,
      tokenCount: countTokens(content),
    };
  }
}

/**
 * Compress yesterday's raw messages into a daily summary
 * Returns cost in dollars
 */
async function compressDailyMemories(
  channelId: string,
  date: string
): Promise<number> {
  console.log(`[Memory] Compressing daily memories for ${channelId} on ${date}`);

  const rawEntries = await readRawMemories(channelId, date);

  if (rawEntries.length === 0) {
    console.log(`[Memory] No raw memories to compress for ${date}`);
    return 0;
  }

  // Combine all raw messages
  const combinedContent = rawEntries
    .map(entry => `[${entry.timestamp}]\n${entry.message}`)
    .join('\n\n---\n\n');

  // Summarize with Claude
  const result = await summarizeWithClaude(
    combinedContent,
    `You are summarizing the conversation outcomes from ${date} in a Discord channel.`
  );

  // Write daily summary
  await writeDailyMemory(channelId, date, result.text);

  // Log compression
  await logDailyCompression(
    channelId,
    date,
    rawEntries.length,
    result.text.length,
    result.tokenCount
  );

  return result.cost;
}

/**
 * Compress last week's daily summaries into a weekly summary
 * Returns cost in dollars
 */
async function compressWeeklyMemories(
  channelId: string,
  weekIdentifier: string
): Promise<number> {
  console.log(`[Memory] Compressing weekly memories for ${channelId} (${weekIdentifier})`);

  // Get all daily summaries from last week
  const allDailies = await listDailyMemories(channelId);

  // Filter to only last week's dates
  const weekPrefix = weekIdentifier.split('-W')[0]; // Get year
  const weeklyDailies = allDailies.filter(date => {
    // Check if date belongs to this week
    const dateObj = new Date(date);
    return getWeekIdentifier(dateObj) === weekIdentifier;
  });

  if (weeklyDailies.length === 0) {
    console.log(`[Memory] No daily summaries to compress for ${weekIdentifier}`);
    return 0;
  }

  // Combine all daily summaries
  let combinedContent = '';
  for (const date of weeklyDailies) {
    const daily = await readDailyMemory(channelId, date);
    if (daily) {
      combinedContent += `## ${date}\n\n${daily}\n\n`;
    }
  }

  // Summarize with Claude
  const result = await summarizeWithClaude(
    combinedContent,
    `You are summarizing a week (${weekIdentifier}) of activity in a Discord channel.`
  );

  // Write weekly summary
  await writeWeeklyMemory(channelId, weekIdentifier, result.text);

  // Log compression
  await logWeeklyCompression(
    channelId,
    weekIdentifier,
    weeklyDailies.length,
    result.text.length,
    result.tokenCount
  );

  return result.cost;
}

/**
 * Compress last month's weekly summaries into a monthly summary
 * Returns cost in dollars
 */
async function compressMonthlyMemories(
  channelId: string,
  monthIdentifier: string
): Promise<number> {
  console.log(`[Memory] Compressing monthly memories for ${channelId} (${monthIdentifier})`);

  // Get all weekly summaries from last month
  const allWeeklies = await listWeeklyMemories(channelId);

  // Filter to only last month's weeks
  const [year, month] = monthIdentifier.split('-');
  const monthlyWeeklies = allWeeklies.filter(weekId => {
    return weekId.startsWith(`${year}-W`);
  });

  if (monthlyWeeklies.length === 0) {
    console.log(`[Memory] No weekly summaries to compress for ${monthIdentifier}`);
    return 0;
  }

  // Combine all weekly summaries
  let combinedContent = '';
  for (const weekId of monthlyWeeklies) {
    const weekly = await readWeeklyMemory(channelId, weekId);
    if (weekly) {
      combinedContent += `## Week ${weekId}\n\n${weekly}\n\n`;
    }
  }

  // Summarize with Claude
  const result = await summarizeWithClaude(
    combinedContent,
    `You are summarizing a month (${monthIdentifier}) of activity in a Discord channel.`
  );

  // Write monthly summary
  await writeMonthlyMemory(channelId, monthIdentifier, result.text);

  // Log compression
  await logMonthlyCompression(
    channelId,
    monthIdentifier,
    monthlyWeeklies.length,
    result.text.length,
    result.tokenCount
  );

  // Clean up old monthly memories based on retention policy
  await cleanupOldMonthlyMemories(channelId);

  return result.cost;
}

/**
 * Clean up old monthly memories beyond the retention limit
 * Keeps the most recent X months where X = MEMORY_RETENTION_MONTHS env variable
 */
async function cleanupOldMonthlyMemories(channelId: string): Promise<void> {
  const retentionMonths = parseInt(process.env.MEMORY_RETENTION_MONTHS || '0', 10);

  // If retention is 0, delete all monthly memories
  // Otherwise, keep the most recent X months
  if (retentionMonths < 0) {
    console.log('[Memory] Invalid MEMORY_RETENTION_MONTHS value, skipping cleanup');
    return;
  }

  console.log(`[Memory] Cleaning up monthly memories (retention: ${retentionMonths} months)`);

  // Get all monthly summaries
  const allMonthlies = await listMonthlyMemories(channelId);

  // Calculate how many to delete (keep the most recent retentionMonths)
  const toDelete = allMonthlies.slice(retentionMonths);

  if (toDelete.length === 0) {
    console.log('[Memory] No old monthly memories to clean up');
    return;
  }

  console.log(`[Memory] Deleting ${toDelete.length} old monthly memories`);

  // Delete old monthly memories
  for (const monthId of toDelete) {
    await deleteMonthlyMemory(channelId, monthId);
    await logMonthlyMemoryDeleted(channelId, monthId);
    console.log(`[Memory] Deleted monthly memory: ${monthId}`);
  }

  console.log(`[Memory] Cleanup completed - kept ${Math.min(allMonthlies.length, retentionMonths)} most recent months`);
}


// ============================================================================
// Server-Wide Compression Functions (NEW)
// ============================================================================

/**
 * Compress yesterday's raw messages into a server-wide daily summary
 * Returns cost in dollars
 */
async function compressDailyMemoriesServerWide(
  date: string,
  channels: Array<{ channelId: string; channelName: string }>
): Promise<number> {
  console.log(`[Memory] Compressing server-wide daily memories for ${date}`);

  // 1. Import memory manager
  const { memoryManager } = await import('./manager.js');

  // 2. Get all channel IDs with messages
  const channelIds = memoryManager.getChannelIds();

  if (channelIds.length === 0) {
    console.log(`[Memory] No raw memories to compress`);
    return 0;
  }

  // 3. Build lookup map for channel names
  const channelMap = new Map<string, string>();
  for (const channel of channels) {
    channelMap.set(channel.channelId, channel.channelName);
  }

  // 4. Concatenate all content with section headers
  let concatenatedText = `# ${getDayName(date)} ${date}\n\n`;

  for (const channelId of channelIds) {
    const channelName = channelMap.get(channelId) || channelId;
    const markdown = memoryManager.convertToMarkdown(channelId);

    if (markdown.trim()) {
      concatenatedText += `## ${channelName}\n\n${markdown}\n`;
    }
  }

  // 5. Send concatenated text to Claude for summarization
  const result = await summarizeWithClaude(
    concatenatedText,
    `Summarize the day's conversations from ${date}. Preserve the channel/thread structure in your summary.`
  );

  // 6. Write daily summary
  await writeDailySummary(date, new Map([[date, result.text]]));

  // Log compression
  await logDailyCompression(
    'server-wide',
    date,
    channelIds.length,
    result.text.length,
    result.tokenCount
  );

  // 7. Clear in-memory data and JSON files after successful compression
  await memoryManager.flushAll(); // Write any pending changes
  memoryManager.clearAll(); // Clear memory
  await clearRawFiles(); // Delete JSON files
  console.log(`[Memory] Cleared ${channelIds.length} channel memories`);

  return result.cost;
}

/**
 * Helper to get day name from date string
 */
function getDayName(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Compress last week's daily summaries into a server-wide weekly summary
 * Returns cost in dollars
 */
async function compressWeeklyMemoriesServerWide(
  weekIdentifier: string,
  channels: Array<{ channelId: string; channelName: string }>
): Promise<number> {
  console.log(`[Memory] Compressing server-wide weekly memories (${weekIdentifier})`);

  // Get the week's dates
  const dates: string[] = [];
  // Simple approach: get last 7 days from the week's Monday
  const weekMatch = weekIdentifier.match(/(\d{4})-W(\d{2})/);
  if (!weekMatch) return 0;

  // For simplicity, read the last 7 daily summaries
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i - 1); // Start from yesterday
    dates.push(date.toISOString().split('T')[0]);
  }

  const channelSummaries = new Map<string, string>();
  let totalCost = 0;

  // For each channel, collect and summarize their daily summaries
  for (const channel of channels) {
    let combinedContent = '';

    for (const date of dates) {
      const daily = await readDailyMemory(channel.channelId, date);
      if (daily) {
        combinedContent += `## ${date}\n\n${daily}\n\n`;
      }
    }

    if (combinedContent) {
      // Summarize with Claude
      const result = await summarizeWithClaude(
        combinedContent,
        `Summarize week (${weekIdentifier}) of activity in #${channel.channelName}`
      );

      channelSummaries.set(channel.channelName, result.text);
      totalCost += result.cost;

      // Log compression
      await logWeeklyCompression(
        channel.channelId,
        weekIdentifier,
        dates.length,
        result.text.length,
        result.tokenCount
      );
    }
  }

  // Write single weekly summary file
  if (channelSummaries.size > 0) {
    await writeWeeklySummary(weekIdentifier, channelSummaries);
  }

  return totalCost;
}

/**
 * Compress last month's weekly summaries into a server-wide monthly summary
 * Returns cost in dollars
 */
async function compressMonthlyMemoriesServerWide(
  monthIdentifier: string,
  channels: Array<{ channelId: string; channelName: string }>
): Promise<number> {
  console.log(`[Memory] Compressing server-wide monthly memories (${monthIdentifier})`);

  // Get all weekly summaries from last month
  const allWeeklies = await listWeeklyMemories(channels[0].channelId); // Use first channel to get list

  // Filter to only last month's weeks
  const [year, month] = monthIdentifier.split('-');
  const monthlyWeeklies = allWeeklies.filter(weekId => {
    return weekId.startsWith(`${year}-W`);
  });

  const channelSummaries = new Map<string, string>();
  let totalCost = 0;

  // For each channel, collect and summarize their weekly summaries
  for (const channel of channels) {
    let combinedContent = '';

    for (const weekId of monthlyWeeklies) {
      const weekly = await readWeeklyMemory(channel.channelId, weekId);
      if (weekly) {
        combinedContent += `## Week ${weekId}\n\n${weekly}\n\n`;
      }
    }

    if (combinedContent) {
      // Summarize with Claude
      const result = await summarizeWithClaude(
        combinedContent,
        `Summarize month (${monthIdentifier}) of activity in #${channel.channelName}`
      );

      channelSummaries.set(channel.channelName, result.text);
      totalCost += result.cost;

      // Log compression
      await logMonthlyCompression(
        channel.channelId,
        monthIdentifier,
        monthlyWeeklies.length,
        result.text.length,
        result.tokenCount
      );
    }
  }

  // Write single monthly summary file
  if (channelSummaries.size > 0) {
    await writeMonthlySummary(monthIdentifier, channelSummaries);
  }

  return totalCost;
}

/**
 * Main compression job that runs daily and checks for boundary conditions
 * NEW: Accepts channels with names for server-wide storage
 */
export async function runDailyMemoryCompression(
  channels: Array<{ channelId: string; channelName: string }>,
  guildId?: string,
  queryLimitManager?: any
): Promise<void> {
  console.log('\n[Memory] Starting server-wide daily compression job');
  console.log(`[Memory] Processing ${channels.length} channels`);

  // Check query limit before proceeding
  if (queryLimitManager) {
    const canProceed = await queryLimitManager.canProceedWithQuery();
    if (!canProceed) {
      console.log('[Memory] ⚠️  Query limit reached - skipping memory compression');
      return;
    }
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateInfo = getDateInfo(today);
  const yesterdayStr = formatDate(yesterday);

  let totalCost = 0;
  let success = true;

  try {
    // Always: Compress yesterday's raw messages (server-wide)
    const dailyCost = await compressDailyMemoriesServerWide(yesterdayStr, channels);
    totalCost += dailyCost;

    // If Monday: Compress last week (server-wide)
    if (dateInfo.isMonday) {
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const weekIdentifier = getWeekIdentifier(lastWeek);
      const weeklyCost = await compressWeeklyMemoriesServerWide(weekIdentifier, channels);
      totalCost += weeklyCost;
    }

    // If 1st of month: Compress last month (server-wide)
    if (dateInfo.isFirstOfMonth) {
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const monthIdentifier = getMonthIdentifier(lastMonth);
      const monthlyCost = await compressMonthlyMemoriesServerWide(monthIdentifier, channels);
      totalCost += monthlyCost;
    }
  } catch (error) {
    console.error(`[Memory] Error compressing server-wide memories:`, error);
    success = false;
  }

  // Track query usage (doesn't reduce query count, only tracks cost)
  if (queryLimitManager && totalCost > 0) {
    await queryLimitManager.trackQuery('summarize_query', totalCost, success);
    console.log(`[Memory] Tracked compression cost: $${totalCost.toFixed(4)}`);
  }

  console.log('[Memory] Server-wide daily compression job completed\n');
}
