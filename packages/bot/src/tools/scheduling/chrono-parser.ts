/**
 * Natural language date/time parsing using chrono-node
 */
import * as chrono from 'chrono-node';

/**
 * Parse natural language time input into ISO 8601 timestamp
 * @param naturalTime Natural language input (e.g., "tomorrow at 9pm", "in 10 minutes")
 * @param timezone IANA timezone identifier (e.g., "America/New_York")
 * @param referenceDate Optional reference date for parsing (defaults to now)
 * @returns ISO 8601 timestamp string
 * @throws Error if parsing fails or time is in the past
 */
export function parseNaturalTime(
  naturalTime: string,
  timezone: string,
  referenceDate?: Date
): string {
  // Validate timezone first
  if (!validateTimezone(timezone)) {
    throw new Error(
      `Invalid timezone: "${timezone}". Must be a valid IANA timezone (e.g., "America/New_York", "Europe/London", "UTC").`
    );
  }

  const refDate = referenceDate || new Date();

  // Parse using chrono-node
  // Note: chrono parses relative to the reference date, the timezone is used for output formatting
  const parsedResults = chrono.parse(naturalTime, refDate);

  if (!parsedResults || parsedResults.length === 0) {
    throw new Error(
      `Could not parse "${naturalTime}". Examples of valid inputs:\n` +
        getExampleNaturalTimes()
          .map((ex) => `  - "${ex}"`)
          .join('\n')
    );
  }

  // Use the first parsed result
  const parsed = parsedResults[0];
  const targetDate = parsed.start.date();

  // Validate the parsed time is in the future
  if (targetDate <= refDate) {
    throw new Error(
      `Parsed time "${targetDate.toISOString()}" is in the past. Current time: ${refDate.toISOString()}`
    );
  }

  // Return ISO 8601 string
  return targetDate.toISOString();
}

/**
 * Validate that a timezone is a valid IANA timezone identifier
 * @param timezone IANA timezone identifier to validate
 * @returns true if valid, false otherwise
 */
export function validateTimezone(timezone: string): boolean {
  try {
    // Try to format a date with this timezone
    // If invalid, Intl.DateTimeFormat will throw
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get example natural language time inputs for error messages
 */
export function getExampleNaturalTimes(): string[] {
  return [
    'tomorrow at 9pm',
    'in 10 minutes',
    'in 2 hours',
    'next Monday at 3pm',
    'December 25th at noon',
    'Friday at 5:30pm',
    'in 30 seconds',
    'next week',
  ];
}
