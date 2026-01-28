export interface ToolManifest {
  userId: string;
  toolsConfig: Record<string, string[]>; // e.g., { gmail: ['send_email', 'list_messages'] }
  tokens: { gmail?: { accessToken: string; expiresAt: number } };
  generatedAt: string;
}

export interface ToolContext {
  /**
   * Get a valid token for a category
   * Automatically refreshes if expired
   */
  getToken: (category: string) => Promise<{ accessToken: string; expiresAt: number } | null>;

  /**
   * Request permission from user via Discord
   * Shows a permission dialog with Yes/No buttons
   * Resolves if approved, rejects if denied or timeout
   */
  requestPermission: (message: string) => Promise<void>;
}
