import { query, Query } from "@anthropic-ai/claude-agent-sdk";
import { SessionDatabase } from "../storage/database.js";
import { randomUUID } from "crypto";
import { MCPServerConfig } from "../mcp/integration.js";

export interface SessionData {
  sessionId: string;
  threadId: string;
  channelId: string;
  workingDirectory: string;
  created: Date;
  lastActive: Date;
  status: "active" | "archived";
}

interface PendingCronSession {
  sessionId: string;
  timestamp: number;
  workingDir: string;
}

export class SessionManager {
  private pendingCronSessions = new Map<string, PendingCronSession>();
  public mcpServers: Record<string, MCPServerConfig>;

  constructor(
    private db: SessionDatabase,
    private sessionsDir: string,
    mcpServers: Record<string, MCPServerConfig> = {}
  ) {
    this.mcpServers = mcpServers;
  }

  /**
   * Get or create a session for a Discord thread
   * Returns the session ID to use with query({ resume: sessionId })
   */
  async getOrCreateSession(
    threadId: string,
    channelId: string,
    messageId: string,
    workingDir: string
  ): Promise<{
    sessionId: string;
    isNew: boolean;
  }> {
    // Check database for existing session
    const existing = this.db.getMapping(threadId);

    if (existing) {
      // Update last active
      this.db.updateLastActive(threadId);

      return {
        sessionId: existing.session_id,
        isNew: false,
      };
    }

    // Create new session - first query will initialize it
    const sessionId = `sess_${Date.now()}_${randomUUID()}`;

    // Store in database
    this.db.createMapping({
      discord_thread_id: threadId,
      discord_channel_id: channelId,
      discord_message_id: messageId,
      session_id: sessionId,
      working_directory: workingDir,
      status: "active",
    });

    return {
      sessionId,
      isNew: true,
    };
  }

  /**
   * Create a session mapping with a specific session ID (for cron sessions)
   */
  createMappingWithSessionId(
    threadId: string,
    channelId: string,
    messageId: string,
    sessionId: string,
    workingDir: string
  ): void {
    this.db.createMapping({
      discord_thread_id: threadId,
      discord_channel_id: channelId,
      discord_message_id: messageId,
      session_id: sessionId,
      working_directory: workingDir,
      status: "active",
    });
  }

  /**
   * Create a query for a user message
   * Automatically resumes session if sessionId exists
   */
  createQuery(
    userMessage: string,
    sessionId: string | null,
    workingDir: string,
    mcpServers?: Record<string, MCPServerConfig>
  ): Query {
    const servers = mcpServers || this.mcpServers;

    return query({
      prompt: userMessage,
      options: {
        cwd: workingDir,
        resume: sessionId || undefined, // Resume if existing, else new
        includePartialMessages: true, // Get streaming events
        settingSources: ["project"], // Load root CLAUDE.md + channel CLAUDE.md files + .claude/skills
        allowDangerouslySkipPermissions: true,
        permissionMode: "bypassPermissions",
        tools: { type: "preset", preset: "claude_code" }, // Enable all Claude Code tools
        mcpServers: Object.keys(servers).length > 0 ? servers : undefined, // Add MCP servers if available
      },
    });
  }

  async updateSession(sessionId: string, threadId: string): Promise<void> {
    this.db.updateLastActive(threadId);
  }

  async updateSessionId(
    oldSessionId: string,
    newSessionId: string,
    threadId: string
  ): Promise<void> {
    // Update the database mapping with the real SDK session ID
    const mapping = this.db.getMapping(threadId);
    if (mapping && mapping.session_id === oldSessionId) {
      this.db.updateSessionId(threadId, newSessionId);
      console.log(`📝 Updated session ID: ${oldSessionId} → ${newSessionId}`);
    }
  }

  async archiveOldSessions(daysInactive: number): Promise<number> {
    const cutoff = Date.now() - daysInactive * 24 * 60 * 60 * 1000;
    const oldSessions = this.db.getAllActive().filter((s) => {
      return new Date(s.last_active_at).getTime() < cutoff;
    });

    for (const session of oldSessions) {
      this.db.archiveSession(session.discord_thread_id);
    }

    return oldSessions.length;
  }

  getActiveSessionCount(): number {
    return this.db.getActiveCount();
  }

  getSessionByThreadId(threadId: string): SessionData | undefined {
    const mapping = this.db.getMapping(threadId);
    if (!mapping) return undefined;

    return {
      sessionId: mapping.session_id,
      threadId: mapping.discord_thread_id,
      channelId: mapping.discord_channel_id,
      workingDirectory: mapping.working_directory,
      created: new Date(mapping.created_at),
      lastActive: new Date(mapping.last_active_at),
      status: mapping.status,
    };
  }

  /**
   * Store a cron session that can be continued with the next message in the channel
   */
  setPendingCronSession(channelId: string, sessionId: string, workingDir: string): void {
    this.pendingCronSessions.set(channelId, {
      sessionId,
      timestamp: Date.now(),
      workingDir,
    });
  }

  /**
   * Get and remove a pending cron session if one exists and is recent (within 1 hour)
   */
  getPendingCronSession(channelId: string): PendingCronSession | null {
    const pending = this.pendingCronSessions.get(channelId);

    if (!pending) return null;

    // Check if it's still valid (within 1 hour)
    const age = Date.now() - pending.timestamp;
    const oneHour = 60 * 60 * 1000;

    if (age > oneHour) {
      // Expired, remove it
      this.pendingCronSessions.delete(channelId);
      return null;
    }

    // Valid, remove it (one-time use)
    this.pendingCronSessions.delete(channelId);
    return pending;
  }
}
