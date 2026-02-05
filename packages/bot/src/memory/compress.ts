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
 * Returns both summary and cost
 */
async function summarizeWithClaude(content: string, context: string): Promise<{
  summary: string;
  cost: number;
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

    return {
      summary: summary.trim() || content,
      cost,
    };
  } catch (error) {
    console.error('Failed to summarize with Claude:', error);
    return {
      summary: content,
      cost: 0,
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
  const { summary, cost } = await summarizeWithClaude(
    combinedContent,
    `You are summarizing the conversation outcomes from ${date} in a Discord channel.`
  );

  // Write daily summary
  await writeDailyMemory(channelId, date, summary);

  // Log compression
  await logDailyCompression(
    channelId,
    date,
    rawEntries.length,
    summary.length,
    countTokens(summary)
  );

  return cost;
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
  const { summary, cost } = await summarizeWithClaude(
    combinedContent,
    `You are summarizing a week (${weekIdentifier}) of activity in a Discord channel.`
  );

  // Write weekly summary
  await writeWeeklyMemory(channelId, weekIdentifier, summary);

  // Log compression
  await logWeeklyCompression(
    channelId,
    weekIdentifier,
    weeklyDailies.length,
    summary.length,
    countTokens(summary)
  );

  return cost;
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
  const { summary, cost } = await summarizeWithClaude(
    combinedContent,
    `You are summarizing a month (${monthIdentifier}) of activity in a Discord channel.`
  );

  // Write monthly summary
  await writeMonthlyMemory(channelId, monthIdentifier, summary);

  // Log compression
  await logMonthlyCompression(
    channelId,
    monthIdentifier,
    monthlyWeeklies.length,
    summary.length,
    countTokens(summary)
  );

  // Clean up old monthly memories based on retention policy
  await cleanupOldMonthlyMemories(channelId);

  return cost;
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


/**
 * Main compression job that runs daily and checks for boundary conditions
 */
export async function runDailyMemoryCompression(
  channelIds: string[],
  guildId?: string,
  queryLimitManager?: any
): Promise<void> {
  console.log('\n[Memory] Starting daily compression job');
  console.log(`[Memory] Processing ${channelIds.length} channels`);

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

  for (const channelId of channelIds) {
    try {
      // Always: Compress yesterday's raw messages
      const dailyCost = await compressDailyMemories(channelId, yesterdayStr);
      totalCost += dailyCost;

      // If Monday: Compress last week
      if (dateInfo.isMonday) {
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        const weekIdentifier = getWeekIdentifier(lastWeek);
        const weeklyCost = await compressWeeklyMemories(channelId, weekIdentifier);
        totalCost += weeklyCost;
      }

      // If 1st of month: Compress last month
      if (dateInfo.isFirstOfMonth) {
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const monthIdentifier = getMonthIdentifier(lastMonth);
        const monthlyCost = await compressMonthlyMemories(channelId, monthIdentifier);
        totalCost += monthlyCost;
      }
    } catch (error) {
      console.error(`[Memory] Error compressing memories for channel ${channelId}:`, error);
      success = false;
      // Continue with other channels
    }
  }

  // Track query usage (doesn't reduce query count, only tracks cost)
  if (queryLimitManager && totalCost > 0) {
    await queryLimitManager.trackQuery('summarize_query', totalCost, success);
    console.log(`[Memory] Tracked compression cost: $${totalCost.toFixed(4)}`);
  }

  console.log('[Memory] Daily compression job completed\n');
}
