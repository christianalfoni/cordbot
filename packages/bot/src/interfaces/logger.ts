/**
 * Logger interface - abstracts all logging operations
 *
 * This ensures no direct console.log/error/warn usage in bot code
 */
export interface ILogger {
  /**
   * Log an informational message
   */
  info(message: string, ...args: any[]): void;

  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void;

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void;

  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void;
}
