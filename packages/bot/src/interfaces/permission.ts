import type { ITextChannel, IThreadChannel } from './discord';

/**
 * Permission levels for operations
 */
export enum PermissionLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Permission request result
 */
export interface PermissionResult {
  approved: boolean;
  userId?: string;
  timestamp: number;
}

/**
 * Permission manager interface - handles permission requests and approvals
 */
export interface IPermissionManager {
  /**
   * Request permission for an operation
   * @returns Promise that resolves when user approves/denies
   */
  requestPermission(
    channel: ITextChannel | IThreadChannel,
    message: string,
    requestId: string
  ): Promise<PermissionResult>;

  /**
   * Handle a permission approval (called by button interaction)
   */
  handleApproval(requestId: string, userId: string): void;

  /**
   * Handle a permission denial (called by button interaction)
   */
  handleDenial(requestId: string, userId: string): void;

  /**
   * Get the permission level required for a tool
   */
  getPermissionLevel(toolId: string): PermissionLevel;

  /**
   * Check if a permission request is pending
   */
  isPending(requestId: string): boolean;

  /**
   * Cancel a pending permission request
   */
  cancel(requestId: string): void;
}
