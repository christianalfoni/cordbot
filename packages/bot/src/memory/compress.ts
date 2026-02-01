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
  writeYearlyMemory,
} from './storage.js';
import {
  logDailyCompression,
  logWeeklyCompression,
  logMonthlyCompression,
  logYearlyCompression,
} from './logger.js';
import { countTokens } from './loader.js';

/**
 * Get date info for boundary checks
 */
function getDateInfo(date: Date) {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday
  const dayOfMonth = date.getDate();
  const month = date.getMonth(); // 0 = January

  return {
    isMonday: dayOfWeek === 1,
    isFirstOfMonth: dayOfMonth === 1,
    isJanuary1st: month === 0 && dayOfMonth === 1,
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
 * Get year identifier (YYYY)
 */
function getYearIdentifier(date: Date): string {
  return String(date.getFullYear());
}

/**
 * Use Claude to summarize content
 */
async function summarizeWithClaude(content: string, context: string): Promise<string> {
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
      }
    }

    return summary.trim() || content; // Fallback to original if no summary
  } catch (error) {
    console.error('Failed to summarize with Claude:', error);
    return content; // Fallback to original content
  }
}

/**
 * Compress yesterday's raw messages into a daily summary
 */
async function compressDailyMemories(
  channelId: string,
  date: string
): Promise<void> {
  console.log(`[Memory] Compressing daily memories for ${channelId} on ${date}`);

  const rawEntries = await readRawMemories(channelId, date);

  if (rawEntries.length === 0) {
    console.log(`[Memory] No raw memories to compress for ${date}`);
    return;
  }

  // Combine all raw messages
  const combinedContent = rawEntries
    .map(entry => `[${entry.timestamp}]\n${entry.message}`)
    .join('\n\n---\n\n');

  // Summarize with Claude
  const summary = await summarizeWithClaude(
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
}

/**
 * Compress last week's daily summaries into a weekly summary
 */
async function compressWeeklyMemories(
  channelId: string,
  weekIdentifier: string
): Promise<void> {
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
    return;
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
  const summary = await summarizeWithClaude(
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
}

/**
 * Compress last month's weekly summaries into a monthly summary
 */
async function compressMonthlyMemories(
  channelId: string,
  monthIdentifier: string
): Promise<void> {
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
    return;
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
  const summary = await summarizeWithClaude(
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
}

/**
 * Compress last year's monthly summaries into a yearly summary
 */
async function compressYearlyMemories(
  channelId: string,
  year: string
): Promise<void> {
  console.log(`[Memory] Compressing yearly memories for ${channelId} (${year})`);

  // Get all monthly summaries from last year
  const allMonthlies = await listMonthlyMemories(channelId);

  // Filter to only last year's months
  const yearlyMonthlies = allMonthlies.filter(monthId => monthId.startsWith(year));

  if (yearlyMonthlies.length === 0) {
    console.log(`[Memory] No monthly summaries to compress for ${year}`);
    return;
  }

  // Combine all monthly summaries
  let combinedContent = '';
  for (const monthId of yearlyMonthlies) {
    const monthly = await readMonthlyMemory(channelId, monthId);
    if (monthly) {
      combinedContent += `## ${monthId}\n\n${monthly}\n\n`;
    }
  }

  // Summarize with Claude
  const summary = await summarizeWithClaude(
    combinedContent,
    `You are summarizing a year (${year}) of activity in a Discord channel.`
  );

  // Write yearly summary
  await writeYearlyMemory(channelId, year, summary);

  // Log compression
  await logYearlyCompression(
    channelId,
    year,
    yearlyMonthlies.length,
    summary.length,
    countTokens(summary)
  );
}

/**
 * Main compression job that runs daily and checks for boundary conditions
 */
export async function runDailyMemoryCompression(
  channelIds: string[]
): Promise<void> {
  console.log('\n[Memory] Starting daily compression job');
  console.log(`[Memory] Processing ${channelIds.length} channels`);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateInfo = getDateInfo(today);
  const yesterdayStr = formatDate(yesterday);

  for (const channelId of channelIds) {
    try {
      // Always: Compress yesterday's raw messages
      await compressDailyMemories(channelId, yesterdayStr);

      // If Monday: Compress last week
      if (dateInfo.isMonday) {
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        const weekIdentifier = getWeekIdentifier(lastWeek);
        await compressWeeklyMemories(channelId, weekIdentifier);
      }

      // If 1st of month: Compress last month
      if (dateInfo.isFirstOfMonth) {
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const monthIdentifier = getMonthIdentifier(lastMonth);
        await compressMonthlyMemories(channelId, monthIdentifier);
      }

      // If Jan 1st: Compress last year
      if (dateInfo.isJanuary1st) {
        const lastYear = new Date(today);
        lastYear.setFullYear(lastYear.getFullYear() - 1);
        const yearIdentifier = getYearIdentifier(lastYear);
        await compressYearlyMemories(channelId, yearIdentifier);
      }
    } catch (error) {
      console.error(`[Memory] Error compressing memories for channel ${channelId}:`, error);
      // Continue with other channels
    }
  }

  console.log('[Memory] Daily compression job completed\n');
}
