/**
 * Utility functions for scheduling tools
 */
import path from 'path';
import fs from 'fs';

/**
 * Get the path to cron_v2.yaml, creating it if it doesn't exist
 * @param workingDir The bot's working directory
 * @returns Absolute path to cron_v2.yaml
 */
export function getCronV2FilePath(workingDir: string): string {
  const filePath = path.join(workingDir, 'cron_v2.yaml');

  // Create empty file with default structure if it doesn't exist
  if (!fs.existsSync(filePath)) {
    const defaultContent = 'oneTimeJobs: []\nrecurringJobs: []\n';
    fs.writeFileSync(filePath, defaultContent, 'utf-8');
  }

  return filePath;
}

/**
 * Generate a unique job ID for one-time schedules
 * @returns Unique ID in format "job_<timestamp>"
 */
export function generateJobId(): string {
  return `job_${Date.now()}`;
}

/**
 * Format time remaining until a target date in human-readable form
 * @param targetDate Target date/time
 * @returns Human-readable string (e.g., "2 hours 30 minutes", "5 minutes", "30 seconds")
 */
export function formatTimeUntil(targetDate: Date): string {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();

  // If in the past, return negative indicator
  if (diffMs < 0) {
    return 'overdue';
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }

  const remainingHours = hours % 24;
  if (remainingHours > 0) {
    parts.push(`${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}`);
  }

  const remainingMinutes = minutes % 60;
  if (remainingMinutes > 0 && days === 0) {
    // Only show minutes if less than a day away
    parts.push(`${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`);
  }

  const remainingSeconds = seconds % 60;
  if (remainingSeconds > 0 && hours === 0) {
    // Only show seconds if less than an hour away
    parts.push(`${remainingSeconds} ${remainingSeconds === 1 ? 'second' : 'seconds'}`);
  }

  return parts.length > 0 ? parts.join(' ') : 'less than 1 second';
}
