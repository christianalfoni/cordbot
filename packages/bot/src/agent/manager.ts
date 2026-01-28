import { query, Query, SdkMcpToolDefinition, createSdkMcpServer, McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { ThreadChannel, TextChannel } from 'discord.js';
import { SessionDatabase } from "../storage/database.js";
import { randomUUID } from "crypto";
import { fetchManifest } from "../service/manifest.js";
import { loadDynamicTools } from "../tools/loader.js";
import { loadBuiltinTools } from "../tools/builtin-loader.js";
import { SERVICE_URL } from "../service/config.js";
import { TokenManager } from "../service/token-manager.js";

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
  private dynamicMcpServer: McpSdkServerConfigWithInstance | null = null;
  private tokenManager: TokenManager | null = null;
  private currentChannels = new Map<string, ThreadChannel | TextChannel>();
  private currentWorkingDirs = new Map<string, string>();
  private filesToShare = new Map<string, string[]>(); // sessionId -> file paths

  constructor(
    private db: SessionDatabase,
    private sessionsDir: string
  ) {}

  async initialize(botToken: string): Promise<void> {
    // Load built-in tools (always available, no auth needed)
    const builtinTools = loadBuiltinTools(
      () => {
        // Get the working directory for the currently executing session
        const entries = Array.from(this.currentWorkingDirs.entries());
        return entries.length > 0 ? entries[0][1] : process.cwd();
      },
      (filePath: string) => {
        // Queue file for sharing - get current session
        const entries = Array.from(this.currentWorkingDirs.entries());
        if (entries.length > 0) {
          const sessionId = entries[0][0];
          this.queueFileForSharing(sessionId, filePath);
        }
      }
    );

    // Fetch manifest from service for authenticated tools
    const manifest = await fetchManifest(botToken, SERVICE_URL);

    let dynamicTools: SdkMcpToolDefinition<any>[] = [];

    if (manifest) {
      const toolCount = Object.values(manifest.toolsConfig || {}).reduce((sum, tools) => sum + tools.length, 0);
      console.log(`📦 Manifest loaded: ${toolCount} authenticated tools available`);

      // Create token manager
      this.tokenManager = new TokenManager(botToken, SERVICE_URL, manifest);
      this.tokenManager.startBackgroundRefresh();

      // Load dynamic tools with token manager and channel getter
      dynamicTools = await loadDynamicTools(
        manifest,
        this.tokenManager,
        () => {
          // Get the channel for the currently executing session
          // This will be set before each query execution
          const entries = Array.from(this.currentChannels.entries());
          return entries.length > 0 ? entries[0][1] : null;
        }
      );

      if (dynamicTools.length > 0) {
        console.log(`  ✓ Loaded ${dynamicTools.length} authenticated tools`);
      }
    } else {
      console.log('ℹ️  No manifest - authenticated tools disabled');
    }

    // Combine built-in and dynamic tools
    const allTools = [...builtinTools, ...dynamicTools];

    if (allTools.length > 0) {
      // Create SDK MCP server with all tools
      this.dynamicMcpServer = createSdkMcpServer({
        name: 'cordbot-tools',
        version: '1.0.0',
        tools: allTools
      });
      console.log(`✅ Total tools available: ${allTools.length} (${builtinTools.length} built-in + ${dynamicTools.length} authenticated)`);
    }
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
   * Set the Discord channel for the current session
   * Must be called before createQuery to enable permission requests
   */
  setChannelContext(sessionId: string, channel: ThreadChannel | TextChannel): void {
    this.currentChannels.set(sessionId, channel);
  }

  /**
   * Clear the channel context after query execution
   */
  clearChannelContext(sessionId: string): void {
    this.currentChannels.delete(sessionId);
  }

  /**
   * Set the working directory for the current session
   * Must be called before createQuery to enable built-in tools (cron, etc.)
   */
  setWorkingDirContext(sessionId: string, workingDir: string): void {
    this.currentWorkingDirs.set(sessionId, workingDir);
  }

  /**
   * Clear the working directory context after query execution
   */
  clearWorkingDirContext(sessionId: string): void {
    this.currentWorkingDirs.delete(sessionId);
  }

  /**
   * Create a query for a user message
   * Automatically resumes session if sessionId exists
   */
  createQuery(
    userMessage: string,
    sessionId: string | null,
    workingDir: string
  ): Query {
    const options: any = {
      cwd: workingDir,
      resume: sessionId || undefined, // Resume if existing, else new
      includePartialMessages: true, // Get streaming events
      settingSources: ["project"], // Load root CLAUDE.md + channel CLAUDE.md files + .claude/skills
      allowDangerouslySkipPermissions: true,
      permissionMode: "bypassPermissions",
      tools: { type: "preset", preset: "claude_code" }, // Enable all Claude Code tools
    };

    // Add dynamic MCP server if available
    if (this.dynamicMcpServer) {
      options.mcpServers = {
        'cordbot-dynamic-tools': this.dynamicMcpServer
      };
    }

    return query({
      prompt: userMessage,
      options,
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

  /**
   * Queue a file to be shared with the user (attached to Discord)
   */
  queueFileForSharing(sessionId: string, filePath: string): void {
    const existing = this.filesToShare.get(sessionId) || [];
    existing.push(filePath);
    this.filesToShare.set(sessionId, existing);
  }

  /**
   * Get and clear files queued for sharing
   */
  getFilesToShare(sessionId: string): string[] {
    const files = this.filesToShare.get(sessionId) || [];
    this.filesToShare.delete(sessionId);
    return files;
  }

  /**
   * Cleanup token manager on shutdown
   */
  shutdown(): void {
    if (this.tokenManager) {
      this.tokenManager.stopBackgroundRefresh();
    }
  }
}
