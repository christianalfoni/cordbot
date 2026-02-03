import type { ILogger } from '../interfaces/logger.js';

/**
 * Production logger implementation using console
 */
export class ConsoleLogger implements ILogger {
  info(message: string, ...args: any[]): void {
    console.log(message, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    console.log(message, ...args);
  }
}
