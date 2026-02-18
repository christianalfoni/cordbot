import type { Query, SdkMcpToolDefinition, McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "crypto";
import { loadBuiltinTools } from "../tools/builtin-loader.js";
import { loadDiscordTools } from "../tools/discord/loader.js";
import { spawn } from "child_process";
import { populateMemorySection } from "../discord/sync.js";
import type { IBotContext } from "../interfaces/core.js";
import type { ITextChannel, IThreadChannel } from "../interfaces/discord.js";
import type { Client } from "discord.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  private currentChannels = new Map<string, ITextChannel | IThreadChannel>();
  private currentWorkingDirs = new Map<string, string>();
  private currentChannelIds = new Map<string, string>(); // sessionId -> channelId
  private filesToShare = new Map<string, string[]>(); // sessionId -> file paths
  private memoryContextSize: number;

  constructor(
    private context: IBotContext,
    private sessionsDir: string,
    private workspaceRoot: string,
    memoryContextSize: number = 10000,
    private discordClient?: Client,
    private cordbotWorkingDir?: string,
    private baseUrl?: string
  ) {
    this.memoryContextSize = memoryContextSize;
  }

  async initialize(): Promise<void> {
    // Load built-in tools (always available, no auth needed)
    const builtinTools = loadBuiltinTools(
      () => {
        // Get the channel ID for the currently executing session
        const entries = Array.from(this.currentChannelIds.entries());
        return entries.length > 0 ? entries[0][1] : '';
      },
      (filePath: string) => {
        // Queue file for sharing - get current session
        const entries = Array.from(this.currentWorkingDirs.entries());
        if (entries.length > 0) {
          const sessionId = entries[0][0];
          this.queueFileForSharing(sessionId, filePath);
        }
      },
      () => {
        // Get the channel for the currently executing session
        const entries = Array.from(this.currentChannels.entries());
        return entries.length > 0 ? entries[0][1] : null;
      },
      () => {
        // Get the workspace root (configuration files like cron_v2.yaml)
        return this.workspaceRoot;
      },
      () => {
        // Get cordbot working directory (where cordbot writes its files)
        return this.cordbotWorkingDir || this.workspaceRoot;
      },
      this.context.documentConverter
    );

    // Load Discord tools if Discord client is provided
    let discordTools: SdkMcpToolDefinition<any>[] = [];
    if (this.discordClient) {
      discordTools = loadDiscordTools(
        this.discordClient,
        () => {
          // Get the channel for the currently executing session
          const entries = Array.from(this.currentChannels.entries());
          return entries.length > 0 ? entries[0][1] : null;
        },
        this.context.guildId
      );
    }

    // Combine built-in and Discord tools
    const allTools = [...builtinTools, ...discordTools];

    if (allTools.length > 0) {
      // Create SDK MCP server with all tools
      this.dynamicMcpServer = createSdkMcpServer({
        name: 'cordbot-tools',
        version: '1.0.0',
        tools: allTools
      });
      this.context.logger.info(`✅ Total tools available: ${allTools.length} (${builtinTools.length} built-in + ${discordTools.length} Discord)`);
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
    const existing = this.context.sessionStore.getMapping(threadId);

    if (existing) {
      // Update last active
      this.context.sessionStore.updateLastActive(threadId);

      return {
        sessionId: existing.sessionId,
        isNew: false,
      };
    }

    // Create new session - first query will initialize it
    const sessionId = `sess_${Date.now()}_${randomUUID()}`;

    // Store in database
    this.context.sessionStore.createMapping({
      threadId,
      channelId,
      messageId,
      sessionId,
      workingDirectory: workingDir,
      guildId: '', // Will be populated by Discord adapter if needed
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
    this.context.sessionStore.createMapping({
      threadId,
      channelId,
      messageId,
      sessionId,
      workingDirectory: workingDir,
      guildId: '', // Will be populated by Discord adapter if needed
    });
  }

  /**
   * Set the Discord channel for the current session
   * Must be called before createQuery to enable permission requests
   * Accepts both interface types and raw Discord.js types
   */
  setChannelContext(sessionId: string, channel: ITextChannel | IThreadChannel | any): void {
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
   * Must be called before createQuery to enable built-in tools (scheduling, etc.)
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
   * Set the channel ID for the current session
   * Must be called before createQuery to enable scheduling tools with centralized storage
   */
  setChannelIdContext(sessionId: string, channelId: string): void {
    this.currentChannelIds.set(sessionId, channelId);
  }

  /**
   * Clear the channel ID context after query execution
   */
  clearChannelIdContext(sessionId: string): void {
    this.currentChannelIds.delete(sessionId);
  }

  /**
   * Create a query for a user message
   * Automatically resumes session if sessionId exists
   */
  createQuery(
    userMessage: string,
    sessionId: string | null,
    workingDir: string,
    systemPrompt?: string
  ): Query {
    this.context.logger.info(`📝 Creating query with options:`);
    this.context.logger.info(`   - workingDir: ${workingDir}`);
    this.context.logger.info(`   - sessionId: ${sessionId || 'new'}`);
    this.context.logger.info(`   - systemPrompt: ${systemPrompt ? `${systemPrompt.length} chars` : 'none'}`);
    this.context.logger.info(`   - dynamicMcpServer: ${this.dynamicMcpServer ? 'yes' : 'no'}`);

    // Build MCP servers object if dynamic server is available
    const mcpServers = this.dynamicMcpServer
      ? { 'cordbot-dynamic-tools': this.dynamicMcpServer }
      : undefined;

    if (mcpServers) {
      this.context.logger.info(`   - MCP tools: ${Object.keys(this.dynamicMcpServer!).length}`);
    }

    try {
      this.context.logger.info(`🎯 Calling context.queryExecutor.createQuery()...`);

      const result = this.context.queryExecutor.createQuery({
        prompt: userMessage,
        workingDirectory: workingDir,
        resume: sessionId || undefined,
        includePartialMessages: true,
        settingSources: ["user"], // Load ~/.claude/skills (user) only - CLAUDE.md is manually injected as systemPrompt
        allowDangerouslySkipPermissions: true,
        permissionMode: "bypassPermissions",
        allowedTools: [
          "Skill",      // Enable Agent Skills from ~/.claude/skills/
          "Read",       // Read files
          "Write",      // Create new files
          "Edit",       // Edit existing files
          "Glob",       // Find files by pattern
          "Grep",       // Search file contents
          "WebFetch",   // Fetch web pages
          "WebSearch",  // Search the web
          "Task",       // Launch subagents
          "TodoWrite",  // Task management
        ],
        verbose: true, // Required for stream-json output format in Claude Code 2.1.x
        systemPrompt: systemPrompt ? {
          type: "preset",
          preset: "claude_code",
          append: systemPrompt
        } : undefined,
        mcpServers,
        // Custom spawn function to fix fly.io issues
        // 1. Use full path to node (instead of shell:true which breaks arg parsing)
        // 2. --print flag - Required to output to stdout instead of opening editor
        spawnClaudeCodeProcess: (spawnOptions: any) => {
          // Add --print flag after the script path (first arg)
          let args = [...spawnOptions.args];
          if (!args.includes('--print')) {
            // Insert --print after the first argument (the script path)
            args = [args[0], '--print', ...args.slice(1)];
          }

          // Use full path to node instead of relying on PATH/shell
          const command = spawnOptions.command === 'node' ? '/usr/local/bin/node' : spawnOptions.command;

          // Spawn without shell to avoid argument parsing issues
          const child = spawn(command, args, {
            ...spawnOptions,
          });

          // Log child process events for debugging
          child.on('error', (error) => {
            this.context.logger.error(`❌ Child process spawn error:`, error);
          });

          child.on('exit', (code, signal) => {
            if (signal) {
              this.context.logger.error(`⚠️  Child process exited with signal: ${signal}`);
            } else if (code !== 0) {
              this.context.logger.error(`⚠️  Child process exited with code: ${code}`);
            } else {
              this.context.logger.info(`✅ Child process exited successfully`);
            }
          });

          return child;
        },
      });

      this.context.logger.info(`✅ context.queryExecutor.createQuery() returned successfully`);
      return result;
    } catch (error) {
      this.context.logger.error(`❌ context.queryExecutor.createQuery() threw error:`, error);
      throw error;
    }
  }

  async updateSession(sessionId: string, threadId: string): Promise<void> {
    this.context.sessionStore.updateLastActive(threadId);
  }

  async updateSessionId(
    oldSessionId: string,
    newSessionId: string,
    threadId: string
  ): Promise<void> {
    // Update the database mapping with the real SDK session ID
    const mapping = this.context.sessionStore.getMapping(threadId);
    if (mapping && mapping.sessionId === oldSessionId) {
      this.context.sessionStore.updateSessionId(threadId, newSessionId);
      this.context.logger.info(`📝 Updated session ID: ${oldSessionId} → ${newSessionId}`);
    }
  }

  /**
   * Populate memory section in CLAUDE.md for a channel before query (server-wide)
   */
  async populateMemory(
    claudeMdPath: string,
    channelId: string,
    channelName: string,
    allChannels: Array<{ channelId: string; channelName: string }>,
    sessionId: string
  ): Promise<import('../memory/loader.js').MemoryLoadResult> {
    return populateMemorySection(
      claudeMdPath,
      channelId,
      channelName,
      allChannels,
      this.memoryContextSize,
      sessionId
    );
  }

  async archiveOldSessions(daysInactive: number): Promise<number> {
    const cutoff = Date.now() - daysInactive * 24 * 60 * 60 * 1000;
    const oldSessions = this.context.sessionStore.getAllActive().filter((s) => {
      return s.lastActive < cutoff;
    });

    for (const session of oldSessions) {
      this.context.sessionStore.archiveSession(session.threadId);
    }

    return oldSessions.length;
  }

  getActiveSessionCount(): number {
    return this.context.sessionStore.getActiveCount();
  }

  getSessionByThreadId(threadId: string): SessionData | undefined {
    const mapping = this.context.sessionStore.getMapping(threadId);
    if (!mapping) return undefined;

    return {
      sessionId: mapping.sessionId,
      threadId: mapping.threadId,
      channelId: mapping.channelId,
      workingDirectory: mapping.workingDirectory,
      created: new Date(mapping.createdAt),
      lastActive: new Date(mapping.lastActive),
      status: mapping.archived ? 'archived' : 'active',
    };
  }

  getSessionByMessageId(messageId: string): SessionData | undefined {
    const mapping = this.context.sessionStore.getMappingByMessageId(messageId);
    if (!mapping) return undefined;

    return {
      sessionId: mapping.sessionId,
      threadId: mapping.threadId,
      channelId: mapping.channelId,
      workingDirectory: mapping.workingDirectory,
      created: new Date(mapping.createdAt),
      lastActive: new Date(mapping.lastActive),
      status: mapping.archived ? 'archived' : 'active',
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
   * Cleanup on shutdown
   */
  shutdown(): void {
    // Token manager cleanup no longer needed - tokens refresh on-demand
  }
}
