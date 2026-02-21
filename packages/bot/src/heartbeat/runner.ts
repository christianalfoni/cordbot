import path from 'path';
import { promises as fs } from 'fs';
import { loadMemoriesForServer, formatMemoriesForServerWideClaudeMd } from '../memory/loader.js';
import type { SessionManager } from '../agent/manager.js';
import type { ChannelMapping } from '../discord/sync.js';
import type { ILogger } from '../interfaces/logger.js';
import type { IFileStore } from '../interfaces/file.js';
import type { QueryLimitManager } from '../service/query-limit-manager.js';

const HEARTBEAT_TEMPLATE = `# Heartbeat Log

Cord reads and updates this file on each heartbeat cycle to track recent activity.

## Last Run

_No heartbeats run yet_

## Notes

_Cord can add notes here for context between heartbeat cycles_
`;

function buildPrompt(heartbeatLog: string): string {
  return `Here is your heartbeat log from previous runs:

<heartbeat_log>
${heartbeatLog}
</heartbeat_log>

Based on the community memory in your context, decide if there is something genuinely helpful to do right now.
- Act if warranted using Discord tools (send a message, follow up on something, etc.)
- Update HEARTBEAT.md with a timestamped entry for this run - what you did, or why you chose not to act`;
}

function buildSystemPrompt(
  now: Date,
  serverDescription: string,
  memoryContent: string,
  channelNames: string[]
): string {
  const timestamp = now.toUTCString();

  let prompt = `# Cord Heartbeat

You are Cord, running a periodic heartbeat evaluation for this Discord community.

**Current UTC time:** ${timestamp}
**Channels monitored:** ${channelNames.length > 0 ? channelNames.join(', ') : 'none'}

`;

  if (serverDescription) {
    prompt += `## Server\n\n${serverDescription}\n\n`;
  }

  prompt += `## Your Heartbeat Role

This is a proactive, autonomous check. You are NOT responding to a user message - you are evaluating whether there is anything genuinely helpful you could contribute to the community right now.

**Critical principles:**
- **Silence is better than noise.** Only act when there is real, clear value to the community.
- **Consider timezone.** Infer the community's likely timezone from memory context. Avoid sending messages when members are likely asleep or inactive.
- **Don't repeat yourself.** Your previous heartbeat log is included in the prompt - do not redo something you recently did.
- **No announcements.** Never tell the community you ran a heartbeat check.
- **Be specific.** Actions should be meaningful: answer an unanswered question, share a relevant resource, follow up on something important, welcome a new member, etc.

`;

  if (memoryContent) {
    prompt += `## Community Memory\n\n${memoryContent}`;
  } else {
    prompt += `## Community Memory\n\n_No memory available yet - the community may be new or quiet._`;
  }

  return prompt;
}

export class HeartbeatRunner {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private sessionManager: SessionManager,
    private cordbotWorkingDir: string,
    private workspaceRoot: string,
    private channelMappings: ChannelMapping[],
    private memoryContextSize: number,
    private fileStore: IFileStore,
    private logger: ILogger,
    private queryLimitManager?: QueryLimitManager
  ) {}

  start(intervalMinutes: number): void {
    const intervalMs = intervalMinutes * 60 * 1000;
    this.logger.info(`[Heartbeat] Starting with ${intervalMinutes}-minute interval`);

    this.timer = setInterval(async () => {
      if (this.isRunning) {
        this.logger.info('[Heartbeat] Skipping - previous heartbeat still running');
        return;
      }

      this.isRunning = true;
      try {
        await this.runHeartbeat();
      } catch (error) {
        this.logger.error('[Heartbeat] Error during heartbeat:', error);
      } finally {
        this.isRunning = false;
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('[Heartbeat] Stopped');
    }
  }

  private async runHeartbeat(): Promise<void> {
    this.logger.info('[Heartbeat] Running heartbeat evaluation...');

    if (this.queryLimitManager) {
      const canProceed = await this.queryLimitManager.canProceedWithQuery();
      if (!canProceed) {
        this.logger.info('[Heartbeat] Skipping - query limit reached');
        return;
      }
    }

    // Read HEARTBEAT.md (create from template if it doesn't exist yet)
    const heartbeatPath = path.join(this.cordbotWorkingDir, 'HEARTBEAT.md');
    let heartbeatLog: string;
    try {
      heartbeatLog = await fs.readFile(heartbeatPath, 'utf-8');
    } catch {
      heartbeatLog = HEARTBEAT_TEMPLATE;
      await fs.writeFile(heartbeatPath, heartbeatLog, 'utf-8');
      this.logger.info('[Heartbeat] Created HEARTBEAT.md');
    }

    // Load server-wide memory across all channels
    const allChannels = this.channelMappings.map(m => ({
      channelId: m.channelId,
      channelName: m.channelName,
    }));

    const memoryResult = await loadMemoriesForServer(
      '', // no specific current channel - load all equally
      'heartbeat',
      allChannels,
      this.memoryContextSize
    );

    const memoryContent = formatMemoriesForServerWideClaudeMd(memoryResult, 'heartbeat');

    // Read server description
    let serverDescription = '';
    const serverDescPath = path.join(this.workspaceRoot, '.claude', 'SERVER_DESCRIPTION.md');
    if (this.fileStore.exists(serverDescPath)) {
      serverDescription = this.fileStore.readFile(serverDescPath, 'utf-8');
    }

    // Build system prompt with memory and server context
    const now = new Date();
    const systemPrompt = buildSystemPrompt(
      now,
      serverDescription,
      memoryContent,
      allChannels.map(c => c.channelName)
    );

    const sessionId = `heartbeat_${Date.now()}`;
    this.sessionManager.setWorkingDirContext(sessionId, this.cordbotWorkingDir);

    let success = false;
    let cost = 0;

    try {
      const query = this.sessionManager.createQuery(
        buildPrompt(heartbeatLog),
        null, // always fresh session
        this.cordbotWorkingDir,
        systemPrompt
      );

      // Drain the stream - the agent uses Discord tools to take action internally
      for await (const event of query as any) {
        if (event.type === 'text' && event.text) {
          this.logger.info(`[Heartbeat] ${event.text.trim()}`);
        }
      }

      success = true;
      this.logger.info('[Heartbeat] Heartbeat evaluation complete');
    } finally {
      this.sessionManager.clearWorkingDirContext(sessionId);

      if (this.queryLimitManager) {
        await this.queryLimitManager.trackQuery('heartbeat', cost, success);
      }
    }
  }
}
