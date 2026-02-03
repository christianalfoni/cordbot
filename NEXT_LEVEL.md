# CordBot Pivot: Personal Assistant → Discord Community Assistant

## Executive Summary

This plan pivots the product from a **personal assistant** to **CordBot, a Discord Community Assistant**. The key insight: personal assistants require OS-level integration (Apple/Google's territory), but Discord communities need better AI tools.

**Architecture: Multi-bot token pool + per-guild deployment + free trial system**
- Multiple "CordBot" Discord applications (we manage multiple tokens)
- Round-robin assignment: guilds distributed across available tokens
- Configurable capacity: e.g., 50 guilds per token (avoids excessive event waste)
- **Free trial pool**: 10 concurrent free slots (100 messages OR 7 days)
- **Waitlist system**: Queue when free slots full, auto-promote when slot opens
- Users simply invite CordBot via OAuth (no token creation needed!)
- Each guild gets its own Fly.io machine for complete isolation
- Admin can add more bot tokens as needed to scale

---

## What's Changing vs What's Staying

### ✅ Keep (Current Architecture Works Great)
- Per-guild Fly.io deployments (~$2-3/month per guild)
- User-provided Anthropic API keys (users pay for their own inference)
- Individual workspaces per guild (`/workspace/`)
- Session management and Claude Agent SDK integration
- Cron jobs, file operations (Read, Write, Edit, Glob, Grep)
- Web search
- Complete isolation between guilds

### ❌ Remove (Simplify for Community Focus)
- OAuth integrations (Gmail, Calendar) - Not needed for Discord communities
- Bash tool - Security risk, not needed for bot operations
- Personal assistant features - Pivoting away from this

### 🔄 Change (Product Pivot)
1. **Single Shared Bot**: One "CordBot" Discord app (we manage token) instead of user-created bots
2. **OAuth Invite Flow**: Users simply click invite link → no token creation needed!
3. **Auto-Provisioning**: Backend detects guild join → provisions Fly.io machine automatically
4. **Message Tracking**: Track ALL public messages (not just bot interactions)
5. **Daily Summaries**: Compress messages into channel-based activity reports
6. **Discord API Tools**: Add 12+ tools for managing Discord (roles, channels, members)
7. **System Prompts**: Update CLAUDE.md to focus on community management
8. **Web Service**: Rebrand as CordBot with community focus

---

## Why This Approach is Better

**Simplicity:**
- No sharding complexity
- No shared volume management
- No guild isolation security concerns
- No quota management system
- No architectural rewrite

**Reliability:**
- Complete isolation between guilds
- One guild's issues don't affect others
- Proven deployment model

**Cost Model:**
- Clear per-guild pricing: ~$2-3/month infrastructure
- Users provide API keys (we don't pay for inference)
- Easy to pass through costs or monetize

**Time to Market:**
- 2-3 weeks instead of 6-8 weeks
- Leverage existing infrastructure
- Focus on features, not architecture

---

## Bot Token Pool Architecture

### Multi-Bot Scaling Strategy

Instead of one shared token (inefficient at scale), we use **multiple managed bot tokens** with load balancing:

```
CordBot-1 (token 1) → 50 guilds max
  ├─ Machine for Guild 1 (uses token 1)
  ├─ Machine for Guild 2 (uses token 1)
  └─ ... (50 machines total, each receives 50 guilds' events)

CordBot-2 (token 2) → 50 guilds max
  ├─ Machine for Guild 51 (uses token 2)
  ├─ Machine for Guild 52 (uses token 2)
  └─ ... (50 machines total, each receives 50 guilds' events)

CordBot-3 (token 3) → 50 guilds max (available for expansion)
```

**Key Points:**
- Each bot token serves up to N guilds (configurable, default: 50)
- Machines using the same token receive events from all guilds on that token
- Each machine filters to only its assigned guild
- Event waste is bounded: max 50x redundancy per token (vs 1000x with single token)
- Add more tokens when capacity reached

### Bot Token Registry

**New Firestore Collection: `botTokens/{tokenId}`**

```typescript
interface BotToken {
  tokenId: string;              // e.g., "cordbot-1"
  clientId: string;             // Discord application client ID
  botToken: string;             // Encrypted Discord bot token (secret)
  botUsername: string;          // e.g., "CordBot-1"
  maxGuilds: number;            // Capacity (default: 50)
  currentGuilds: number;        // Current usage
  guilds: string[];             // Array of guild IDs using this token
  status: 'active' | 'full' | 'disabled';
  createdAt: string;
  updatedAt: string;
}
```

**Admin Configuration:**
```typescript
// Add new bot token
await db.collection('botTokens').doc('cordbot-1').set({
  tokenId: 'cordbot-1',
  clientId: 'DISCORD_CLIENT_ID_1',
  botToken: 'ENCRYPTED_BOT_TOKEN_1',
  botUsername: 'CordBot-1',
  maxGuilds: 50,
  currentGuilds: 0,
  guilds: [],
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
```

### Architecture Diagram
```
User → CordBot OAuth Invite → Discord
                                  ↓
                         Bot joins Guild X
                                  ↓
                    Webhook to Firebase Function
                                  ↓
                    Create Fly.io Machine for Guild X
                                  ↓
        Machine starts with:
        - DISCORD_BOT_TOKEN (shared, same for all)
        - DISCORD_GUILD_ID (unique per guild)
        - ANTHROPIC_API_KEY (from user)
                                  ↓
        Bot connects to Discord with shared token
        Filters events: only handle guildId === DISCORD_GUILD_ID
                                  ↓
        ✅ Bot active for Guild X
```

### Key Points

**One Discord Application:**
- Application name: "CordBot"
- Client ID: Shared across all deployments
- Bot token: Stored securely in Firebase/Fly secrets
- OAuth permissions: Administrator (or specific permissions)

**Per-Guild Machines:**
- Each guild gets dedicated Fly.io machine
- Complete isolation (CPU, RAM, volume, processes)
- Environment variable `DISCORD_GUILD_ID` filters events
- All use same `DISCORD_BOT_TOKEN` but handle different guilds

**How Event Filtering Works:**
```typescript
// In each machine's bot code
client.on('messageCreate', async (message) => {
  const expectedGuildId = process.env.DISCORD_GUILD_ID;

  // Ignore events from other guilds
  if (message.guildId !== expectedGuildId) {
    return;
  }

  // Handle message for this guild
  await handleMessage(message);
});
```

**Why This Works:**
- Discord.js sends events from all guilds the bot is in
- Each machine filters to only its assigned guild
- No crosstalk between guilds (filtered at application level)
- Complete isolation via separate machines

---

## Implementation Plan

## Phase 0: OAuth & Auto-Provisioning

### 0.1 Create Shared CordBot Discord Application

**Discord Developer Portal Setup:**
1. Create new application: "CordBot"
2. Add bot user with appropriate permissions
3. Generate bot token → store in Firebase secret
4. Configure OAuth2 redirect: `https://cordbot.io/auth/discord/callback`

**Required Permissions:**
- Read Messages/View Channels
- Send Messages
- Manage Channels
- Manage Roles
- Kick Members
- Ban Members
- (All permissions CordBot needs for Discord tools)

### 0.2 Bot Token Pool Management

**Admin Functions for Managing Bot Tokens:**

**New File: `/packages/functions/src/bot-token-management.ts`**

```typescript
import { onCall } from 'firebase-functions/v2/https';

/**
 * Add new bot token to the pool (admin only)
 */
export const addBotToken = onCall(async (request) => {
  // Verify admin auth
  if (!request.auth || !isAdmin(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const { tokenId, clientId, botToken, botUsername, maxGuilds = 50 } = request.data;

  await db.collection('botTokens').doc(tokenId).set({
    tokenId,
    clientId,
    botToken,  // Store encrypted in production
    botUsername,
    maxGuilds,
    currentGuilds: 0,
    guilds: [],
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return { success: true, tokenId };
});

/**
 * Get bot token pool status (admin only)
 */
export const getBotTokenStatus = onCall(async (request) => {
  if (!request.auth || !isAdmin(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const tokensSnapshot = await db.collection('botTokens').get();

  const tokens = tokensSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      tokenId: data.tokenId,
      botUsername: data.botUsername,
      currentGuilds: data.currentGuilds,
      maxGuilds: data.maxGuilds,
      utilizationPercent: (data.currentGuilds / data.maxGuilds) * 100,
      status: data.status,
    };
  });

  return {
    tokens,
    totalCapacity: tokens.reduce((sum, t) => sum + t.maxGuilds, 0),
    totalUsed: tokens.reduce((sum, t) => sum + t.currentGuilds, 0),
  };
});

/**
 * Update bot token capacity (admin only)
 */
export const updateBotTokenCapacity = onCall(async (request) => {
  if (!request.auth || !isAdmin(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const { tokenId, maxGuilds } = request.data;

  const tokenDoc = await db.collection('botTokens').doc(tokenId).get();
  const currentGuilds = tokenDoc.data().currentGuilds;

  await db.collection('botTokens').doc(tokenId).update({
    maxGuilds,
    status: currentGuilds >= maxGuilds ? 'full' : 'active',
    updatedAt: new Date().toISOString(),
  });

  return { success: true };
});
```

**Admin Dashboard Page:** `/packages/web-service/src/pages/AdminBotTokens.tsx`

Show token pool status, utilization, add new tokens.

### 0.3 OAuth Invite URL Generator

**Update: `/packages/web-service/src/utils/discord-oauth.ts`**

Use ANY available bot token's client ID (all CordBot tokens have same permissions):

```typescript
export async function generateCordBotInviteUrl(userId: string): Promise<string> {
  // Get any active bot token's client ID (they're all equivalent)
  const tokenSnapshot = await db.collection('botTokens')
    .where('status', 'in', ['active', 'full'])  // Can invite even if full
    .limit(1)
    .get();

  if (tokenSnapshot.empty) {
    throw new Error('No bot tokens available');
  }

  const clientId = tokenSnapshot.docs[0].data().clientId;
  const redirectUri = encodeURIComponent('https://cordbot.io/auth/discord/callback');

  // Permissions integer (Administrator = 8, or specific perms)
  const permissions = '8';

  // State contains user ID to track who added the bot
  const state = encodeURIComponent(JSON.stringify({ userId }));

  return `https://discord.com/oauth2/authorize?` +
    `client_id=${clientId}&` +
    `permissions=${permissions}&` +
    `scope=bot&` +
    `redirect_uri=${redirectUri}&` +
    `state=${state}`;
}
```

### 0.3 OAuth Callback Handler

**New Page: `/packages/web-service/src/pages/DiscordCallback.tsx`**

```typescript
export function DiscordCallback() {
  const [status, setStatus] = useState<'need_api_key' | 'provisioning' | 'success' | 'error'>('need_api_key');
  const [guildInfo, setGuildInfo] = useState<any>(null);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');

  const handleProvision = async () => {
    if (!anthropicApiKey || !anthropicApiKey.startsWith('sk-ant-')) {
      alert('Please enter a valid Anthropic API key');
      return;
    }

    setStatus('provisioning');

    try {
      // Parse URL params
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const guildId = params.get('guild_id');

      if (!code || !guildId) {
        throw new Error('Missing OAuth parameters');
      }

      // Extract userId from state
      const { userId } = JSON.parse(decodeURIComponent(state));

      // Call Firebase function to provision bot
      const result = await provisionCordBot({
        userId,
        guildId,
        code,
        anthropicApiKey, // User-provided API key
      });

      setGuildInfo(result.guild);
      setStatus('success');
    } catch (error) {
      console.error('Provisioning error:', error);
      setStatus('error');
    }
  };

  if (status === 'need_api_key') {
    return (
      <div className="callback-page">
        <h2>One More Step!</h2>
        <p>CordBot needs your Anthropic API key to run Claude AI.</p>

        <ApiKeyInput
          value={anthropicApiKey}
          onChange={setAnthropicApiKey}
          placeholder="sk-ant-..."
        />

        <p className="note">
          Don't have an API key? <a href="https://console.anthropic.com" target="_blank">
            Get one from Anthropic →
          </a>
        </p>

        <Button onClick={handleProvision} disabled={!anthropicApiKey}>
          Deploy CordBot
        </Button>
      </div>
    );
  }

  if (status === 'processing') {
    return (
      <div className="callback-page">
        <Spinner />
        <h2>Setting up CordBot...</h2>
        <p>This will take about 30 seconds</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="callback-page">
        <ErrorIcon />
        <h2>Setup Failed</h2>
        <p>Something went wrong. Please try again or contact support.</p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="callback-page">
      <SuccessIcon />
      <h2>CordBot Added Successfully! 🎉</h2>
      <GuildCard guild={guildInfo} />
      <p>CordBot is now active in your server and ready to help!</p>
      <Button onClick={() => navigate(`/guild/${guildInfo.id}`)}>
        Manage CordBot
      </Button>
    </div>
  );
}
```

### 0.4 Auto-Provisioning Cloud Function

**New Function: `/packages/functions/src/cordbot-provisioning.ts`**

```typescript
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const flyApiToken = defineSecret('FLY_API_TOKEN');

/**
 * Find available bot token using round-robin strategy
 */
async function findAvailableBotToken(): Promise<BotTokenData | null> {
  // Get all active tokens sorted by current load (least loaded first)
  const tokensSnapshot = await db.collection('botTokens')
    .where('status', '==', 'active')
    .orderBy('currentGuilds', 'asc')
    .limit(1)
    .get();

  if (tokensSnapshot.empty) {
    console.error('No active bot tokens available');
    return null;
  }

  const tokenDoc = tokensSnapshot.docs[0];
  const tokenData = tokenDoc.data() as BotToken;

  // Check if this token has capacity
  if (tokenData.currentGuilds >= tokenData.maxGuilds) {
    console.error('All bot tokens at capacity');
    return null;
  }

  return {
    tokenId: tokenData.tokenId,
    botToken: tokenData.botToken,
    clientId: tokenData.clientId,
    maxGuilds: tokenData.maxGuilds,
    currentGuilds: tokenData.currentGuilds,
  };
}

export const provisionCordBot = onCall(
  { secrets: [flyApiToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, guildId, code, anthropicApiKey } = request.data;

    if (!anthropicApiKey || !anthropicApiKey.startsWith('sk-ant-')) {
      throw new HttpsError('invalid-argument', 'Valid Anthropic API key required');
    }

    // Check if bot already provisioned for this guild
    const existing = await db.collection('guilds').doc(guildId).get();
    if (existing.exists) {
      throw new HttpsError('already-exists', 'CordBot already active in this guild');
    }

    // Find available bot token (round-robin)
    const assignedToken = await findAvailableBotToken();

    if (!assignedToken) {
      throw new HttpsError(
        'resource-exhausted',
        'CordBot is at capacity. Please try again later or contact support.'
      );
    }

    // Fetch guild info from Discord (optional, using code)
    const guildInfo = await fetchGuildInfo(guildId, code);

    // Generate unique app name
    const appName = `cordbot-${guildId.substring(0, 8)}`;

    // Provision Fly.io machine
    try {
      // 1. Create app
      await flyApi.createApp(appName, flyApiToken.value());

      // 2. Create volume (1GB)
      const volumeName = `cordbot_vol_${guildId}`;
      await flyApi.createVolume(appName, volumeName, 1, flyApiToken.value());

      // 3. Create machine
      const machineConfig = {
        image: 'christianalfoni/cordbot-agent:latest',
        env: {
          DISCORD_BOT_TOKEN: assignedToken.botToken,   // Assigned from pool
          DISCORD_GUILD_ID: guildId,                   // Unique per guild
          ANTHROPIC_API_KEY: anthropicApiKey,          // User-provided (they pay)
          BOT_MODE: 'shared',
          MEMORY_CONTEXT_SIZE: '10000',
          FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT,
          BOT_TOKEN_ID: assignedToken.tokenId,         // Track which token this uses
        },
        mounts: [{
          volume: volumeName,
          path: '/workspace',
        }],
        guest: {
          cpus: 1,
          memory_mb: 1024,
        },
      };

      const machine = await flyApi.createMachine(
        appName,
        machineConfig,
        flyApiToken.value()
      );

      // 4. Poll until machine starts
      await pollMachineStatus(appName, machine.id, flyApiToken.value());

      // 5. Update bot token registry
      await db.collection('botTokens').doc(assignedToken.tokenId).update({
        currentGuilds: FieldValue.increment(1),
        guilds: FieldValue.arrayUnion(guildId),
        updatedAt: new Date().toISOString(),
      });

      // Check if token is now full
      const updatedToken = await db.collection('botTokens').doc(assignedToken.tokenId).get();
      const tokenData = updatedToken.data();
      if (tokenData.currentGuilds >= tokenData.maxGuilds) {
        await db.collection('botTokens').doc(assignedToken.tokenId).update({
          status: 'full',
        });
      }

      // 6. Store in Firestore
      await db.collection('guilds').doc(guildId).set({
        guildId,
        guildName: guildInfo.name,
        guildIcon: guildInfo.icon,
        guildOwnerId: guildInfo.owner_id,
        addedBy: userId,
        appName,
        machineId: machine.id,
        volumeId: volumeName,
        status: 'running',
        botTokenId: assignedToken.tokenId,  // Track which token is used
        features: {
          trackMessages: true,
          dailySummaries: true,
          discordTools: true,
        },
        stats: {
          messagesTracked: 0,
          dailySummariesGenerated: 0,
          discordToolCalls: 0,
          activeChannels: 0,
        },
        createdAt: new Date().toISOString(),
      });

      // 6. Add to user's guilds list
      await db.collection('users').doc(userId).update({
        guilds: FieldValue.arrayUnion(guildId),
      });

      return {
        success: true,
        guild: {
          id: guildId,
          name: guildInfo.name,
          icon: guildInfo.icon,
        },
      };
    } catch (error) {
      console.error('Provisioning error:', error);

      // Cleanup on failure
      try {
        await flyApi.deleteApp(appName, flyApiToken.value());
      } catch {}

      throw new HttpsError('internal', 'Failed to provision CordBot');
    }
  }
);
```

### 0.5 Bot Startup with Guild Filtering

**Update: `/packages/bot/src/index.ts`**

```typescript
export async function startBot(cwd: string): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!guildId) {
    throw new Error('DISCORD_GUILD_ID is required');
  }

  console.log(`
╔═══════════════════════════════════════╗
║     CordBot Community Assistant       ║
║   Discord Server Management AI        ║
╚═══════════════════════════════════════╝
  `);
  console.log(`[CordBot] Guild: ${guildId}`);
  console.log(`[CordBot] Shared bot token (filtering for this guild only)`);

  // Connect to Discord (shared token)
  await client.login(process.env.DISCORD_BOT_TOKEN);

  // Wait for ready
  await new Promise(resolve => client.once('ready', resolve));

  // Verify we're in the guild
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Bot not in guild ${guildId}. Please re-invite CordBot.`);
  }

  console.log(`[CordBot] ✅ Connected to guild: ${guild.name}`);

  // Sync channels for THIS guild only
  const channelMappings = await syncChannelsOnStartup(client, guildId, basePath, botConfig);

  // Setup event handlers (with guild filtering)
  setupEventHandlers(client, sessionManager, channelMappings, basePath, guildId, cronRunner, botConfig);

  console.log(`[CordBot] 🚀 Ready to assist ${guild.name}!`);
}
```

**Update: `/packages/bot/src/discord/events.ts`**

Add guild filtering to ALL event handlers:

```typescript
export function setupEventHandlers(
  client: Client,
  sessionManager: SessionManager,
  channelMappings: Map<string, ChannelMapping>,
  basePath: string,
  expectedGuildId: string, // NEW: Guild ID this machine handles
  cronRunner: CronRunner,
  botConfig: BotConfig
): void {

  client.on('messageCreate', async (message) => {
    // CRITICAL: Filter to only our guild
    if (message.guildId !== expectedGuildId) {
      return; // Ignore messages from other guilds
    }

    // Existing message handling logic
    try {
      // Track messages
      if (!message.author.bot && !message.channel.isThread()) {
        await trackMessage(message);
      }

      // Handle bot interactions
      if (shouldBotRespond(message, botConfig)) {
        await handleMessageWithLock(message, sessionManager, channelMappings, botConfig);
      }
    } catch (error) {
      console.error('Error in messageCreate:', error);
    }
  });

  client.on('channelCreate', async (channel) => {
    // Filter to our guild
    if (channel.guildId !== expectedGuildId) return;

    // Existing channel create logic
    await syncNewChannel(channel, basePath, botConfig);
  });

  client.on('channelUpdate', async (oldChannel, newChannel) => {
    // Filter to our guild
    if (newChannel.guildId !== expectedGuildId) return;

    // Existing channel update logic
    await updateChannelClaudeMdTopic(newChannel, channelMappings);
  });

  client.on('channelDelete', async (channel) => {
    // Filter to our guild
    if (channel.guildId !== expectedGuildId) return;

    // Existing channel delete logic
    await deleteChannelWorkspace(channel, channelMappings, cronRunner);
  });

  // ... other event handlers with same filtering
}
```

---

## Phase 0.6: Free Trial Pool & Waitlist System

### Free Trial Economics

**Budget:** $100/month
**Trial limits:** 100 messages OR 7 days (whichever comes first)
**Starting capacity:** 10 concurrent slots
**Scalable to:** 20 slots (based on conversion rate)

**Cost per trial:**
- Infrastructure: $0.60-$3.58 (depends on duration)
- API (if uses all 100 messages): ~$2.50
- Average total cost: ~$3-6 per trial

**Expected turnover:**
- Average trial duration: 5 days (users test quickly)
- New trials per month: 20-30 (with turnover)
- Conversions (10-15% rate): 2-4 paying customers/month
- Revenue from conversions: $60-120/month
**ROI:** Break-even to profitable in month 1-2!

### Firestore Schema

**Collection: `trialPool/config`**
```typescript
interface TrialPoolConfig {
  maxSlots: number;              // 10 (scalable to 20)
  currentSlots: number;
  waitlistSize: number;
  monthlyBudget: number;         // $100
  currentSpend: number;
  maxMessages: number;           // 100
  maxDays: number;               // 7
}
```

**Collection: `trials/{guildId}`**
```typescript
interface Trial {
  guildId: string;
  userId: string;
  appName: string;
  botTokenId: string;
  status: 'active' | 'exhausted' | 'expired' | 'upgraded';
  messagesUsed: number;
  maxMessages: number;           // 100
  createdAt: string;
  expiresAt: string;             // 7 days from creation
  endedAt: string | null;
  endReason: 'messages' | 'time' | 'upgrade' | null;
  workspaceBackupUrl: string | null;
}
```

**Collection: `waitlist/{userId}`**
```typescript
interface WaitlistEntry {
  userId: string;
  guildId: string;
  addedAt: string;
  position: number;
  notified: boolean;
  expiresAt: string;             // 48hr to claim slot after notification
}
```

### Trial Request Flow

**User Journey:**
1. Click "Try CordBot Free"
2. If slots available → provision immediately
3. If full → add to waitlist with position estimate
4. When slot opens → email notification + 48hr to claim
5. Trial starts → 100 messages OR 7 days
6. Hit limit → Discord notification + upgrade prompt
7. Resources terminated → slot opens for next person

**Implementation: `/packages/functions/src/trial-system.ts`**

```typescript
export const requestCordBotTrial = onCall(async (request) => {
  const { userId, guildId } = request.data;

  // Check if user already used trial
  const existingTrial = await db.collection('trials')
    .where('userId', '==', userId)
    .get();

  if (!existingTrial.empty) {
    throw new HttpsError(
      'already-exists',
      'You already used your free trial. Upgrade at cordbot.io/upgrade'
    );
  }

  // Check capacity
  const pool = (await db.collection('trialPool').doc('config').get()).data();

  if (pool.currentSlots >= pool.maxSlots) {
    // Add to waitlist
    const position = pool.waitlistSize + 1;

    await db.collection('waitlist').doc(userId).set({
      userId,
      guildId,
      addedAt: new Date().toISOString(),
      position,
      notified: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await db.collection('trialPool').doc('config').update({
      waitlistSize: FieldValue.increment(1),
    });

    return {
      status: 'waitlisted',
      position,
      estimatedDays: Math.ceil(position / 3),
      message: `You're #${position} on the waitlist!`,
    };
  }

  // Provision free trial
  return await provisionFreeTrial(userId, guildId);
});
```

### Trial Monitoring

**Track messages (called by bot on every message):**

```typescript
export const trackTrialMessage = onCall(async (request) => {
  const { guildId } = request.data;

  const trialDoc = await db.collection('trials').doc(guildId).get();
  if (!trialDoc.exists) return { isTrial: false };

  const trial = trialDoc.data();
  if (trial.status !== 'active') return { terminated: true };

  // Increment
  const newCount = trial.messagesUsed + 1;
  await db.collection('trials').doc(guildId).update({
    messagesUsed: newCount,
  });

  // Check limits
  if (newCount >= trial.maxMessages) {
    await terminateTrial(guildId, 'messages');
    return {
      exhausted: true,
      reason: 'You've used all 100 trial messages!',
      upgradeUrl: 'https://cordbot.io/upgrade',
    };
  }

  const now = new Date();
  const expiresAt = new Date(trial.expiresAt);

  if (now > expiresAt) {
    await terminateTrial(guildId, 'time');
    return {
      exhausted: true,
      reason: 'Your 7-day trial has ended!',
      upgradeUrl: 'https://cordbot.io/upgrade',
    };
  }

  return {
    isTrial: true,
    messagesRemaining: trial.maxMessages - newCount,
    daysRemaining: Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)),
  };
});
```

### Trial Termination

```typescript
async function terminateTrial(guildId: string, reason: 'messages' | 'time') {
  const trial = (await db.collection('trials').doc(guildId).get()).data();

  // Backup workspace
  const backupUrl = await exportWorkspaceBackup(trial.appName);

  // Delete Fly.io resources (frees up infra cost)
  await flyApi.deleteApp(trial.appName, flyApiToken.value());

  // Update trial
  await db.collection('trials').doc(guildId).update({
    status: reason === 'messages' ? 'exhausted' : 'expired',
    endedAt: new Date().toISOString(),
    endReason: reason,
    workspaceBackupUrl: backupUrl,
  });

  // Free slot
  await db.collection('trialPool').doc('config').update({
    currentSlots: FieldValue.increment(-1),
  });

  // Update bot token count
  await db.collection('botTokens').doc(trial.botTokenId).update({
    currentGuilds: FieldValue.increment(-1),
    guilds: FieldValue.arrayRemove(guildId),
  });

  // Send upgrade prompt to Discord
  await sendUpgradeNotification(guildId, reason);

  // Promote next from waitlist
  await promoteFromWaitlist();
}

async function promoteFromWaitlist() {
  const nextSnapshot = await db.collection('waitlist')
    .orderBy('position', 'asc')
    .limit(1)
    .get();

  if (nextSnapshot.empty) return;

  const { userId } = nextSnapshot.docs[0].data();

  await sendEmail(userId, {
    subject: 'Your CordBot trial slot is ready!',
    body: 'Claim your free trial now: cordbot.io/claim',
  });

  await db.collection('waitlist').doc(userId).update({
    notified: true,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });
}
```

### Dynamic Scaling

**Auto-scale based on conversion rate:**

```typescript
// Run weekly
export const optimizeTrialPool = onSchedule('0 0 * * 0', async () => {
  const trials = await db.collection('trials').get();
  const upgraded = trials.docs.filter(d => d.data().status === 'upgraded').length;
  const conversionRate = upgraded / trials.size;

  const pool = await db.collection('trialPool').doc('config').get();
  const { maxSlots, waitlistSize } = pool.data();

  // High conversion (>20%) + long waitlist → increase to 20
  if (conversionRate > 0.20 && waitlistSize > 10 && maxSlots < 20) {
    await db.collection('trialPool').doc('config').update({ maxSlots: 20 });
    console.log('🔼 Increased trial slots to 20 (high conversion)');
  }

  // Low conversion (<5%) → decrease to 10
  if (conversionRate < 0.05 && maxSlots > 10) {
    await db.collection('trialPool').doc('config').update({ maxSlots: 10 });
    console.log('🔽 Decreased trial slots to 10 (low conversion)');
  }
});
```

### Cron Jobs

**Daily waitlist cleanup:**
```typescript
// Remove expired waitlist entries (didn't claim within 48hr)
export const cleanupExpiredWaitlist = onSchedule('0 0 * * *', async () => {
  const now = new Date();
  const expired = await db.collection('waitlist')
    .where('notified', '==', true)
    .where('expiresAt', '<', now.toISOString())
    .get();

  for (const doc of expired.docs) {
    await doc.ref.delete();
    await db.collection('trialPool').doc('config').update({
      waitlistSize: FieldValue.increment(-1),
    });
    await promoteFromWaitlist(); // Give slot to next person
  }
});
```

### Web UI Updates

**Trial Status Badge (in Discord channel):**
```
🎉 Free Trial Active
📊 87 messages remaining
📅 4 days left

[Upgrade to unlock unlimited messages →]
```

**Waitlist Page:** `/packages/web-service/src/pages/Waitlist.tsx`
```tsx
<WaitlistStatus>
  <h2>You're on the waitlist!</h2>
  <Position>#{position}</Position>
  <Estimate>Estimated wait: ~{estimatedDays} days</Estimate>
  <p>We'll email you when your slot is ready.</p>
  <Progress value={progress} max={100} />
</WaitlistStatus>
```

---

## Phase 0.7: Paid Tiers & Billing

### Pricing Tiers

**Free Trial:**
- 100 messages total
- 7 days max
- 1GB storage
- Community support

**Starter: $19/month**
- 500 messages/month
- Dedicated instance
- 1GB storage
- Community support
- Comparable to: MEE6 ($12) + basic AI (~$7)

**Pro: $39/month** ⭐ RECOMMENDED
- 1,200 messages/month
- Dedicated instance
- 1GB storage
- Memory & learning
- Priority support
- Comparable to: ChatGPT Plus ($20) + Premium bot ($12) + dedicated hosting

**Business: $79/month**
- 3,000 messages/month
- Dedicated instance
- 5GB storage
- Premium support
- Custom integrations
- For: Serious communities using multiple tools

### Firestore Schema Updates

**Update Guild Document:**
```typescript
interface GuildDocument {
  guildId: string;
  // ... existing fields

  // NEW: Subscription info
  subscription: {
    tier: 'trial' | 'starter' | 'pro' | 'business';
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };

  // NEW: Usage limits
  limits: {
    messagesPerMonth: number;     // 500, 1200, 3000
    storageGB: number;             // 1, 1, 5
  };

  // NEW: Current usage
  usage: {
    messagesThisMonth: number;
    lastResetAt: string;           // Monthly reset
    storageUsedGB: number;
  };
}
```

### Stripe Integration

**New File: `/packages/functions/src/stripe-billing.ts`**

```typescript
import Stripe from 'stripe';
import { defineSecret } from 'firebase-functions/params';

const stripeSecret = defineSecret('STRIPE_SECRET_KEY');
const stripe = new Stripe(stripeSecret.value(), { apiVersion: '2023-10-16' });

// Price IDs (from Stripe Dashboard)
const PRICE_IDS = {
  starter: 'price_starter_monthly',
  pro: 'price_pro_monthly',
  business: 'price_business_monthly',
};

const TIER_LIMITS = {
  trial: { messages: 100, storage: 1 },
  starter: { messages: 500, storage: 1 },
  pro: { messages: 1200, storage: 1 },
  business: { messages: 3000, storage: 5 },
};

/**
 * Create Stripe checkout session for upgrading from trial
 */
export const createCheckoutSession = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { guildId, tier } = request.data;

  if (!['starter', 'pro', 'business'].includes(tier)) {
    throw new HttpsError('invalid-argument', 'Invalid tier');
  }

  const guildDoc = await db.collection('guilds').doc(guildId).get();
  const guild = guildDoc.data();

  // Check authorization (user must be guild owner or added the bot)
  if (guild.addedBy !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Only the user who added CordBot can manage billing');
  }

  // Create or retrieve Stripe customer
  let customerId = guild.subscription?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: request.auth.token.email,
      metadata: {
        firebaseUID: request.auth.uid,
        guildId: guildId,
      },
    });
    customerId = customer.id;
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price: PRICE_IDS[tier],
      quantity: 1,
    }],
    success_url: `https://cordbot.io/guild/${guildId}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://cordbot.io/guild/${guildId}/upgrade`,
    metadata: {
      guildId,
      tier,
      firebaseUID: request.auth.uid,
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
});

/**
 * Handle Stripe webhook events
 */
export const stripeWebhook = onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle events
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { guildId, tier } = session.metadata;

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

  // Check if this was a trial upgrade
  const guildDoc = await db.collection('guilds').doc(guildId).get();
  const wasTrial = guildDoc.exists && guildDoc.data().subscription?.tier === 'trial';

  if (wasTrial) {
    // Convert trial to paid
    const trialDoc = await db.collection('trials').doc(guildId).get();
    if (trialDoc.exists) {
      await db.collection('trials').doc(guildId).update({
        status: 'upgraded',
        endReason: 'upgrade',
        endedAt: new Date().toISOString(),
      });

      // Free up trial slot
      await db.collection('trialPool').doc('config').update({
        currentSlots: FieldValue.increment(-1),
      });

      // Promote from waitlist
      await promoteFromWaitlist();
    }

    // Re-provision with user's Anthropic API key (prompt via email/UI)
    // Trial used our free API key, paid tier uses theirs
  }

  // Update guild document
  await db.collection('guilds').doc(guildId).update({
    'subscription.tier': tier,
    'subscription.status': subscription.status,
    'subscription.stripeCustomerId': session.customer,
    'subscription.stripeSubscriptionId': subscription.id,
    'subscription.currentPeriodStart': new Date(subscription.current_period_start * 1000).toISOString(),
    'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000).toISOString(),
    'subscription.cancelAtPeriodEnd': false,
    'limits.messagesPerMonth': TIER_LIMITS[tier].messages,
    'limits.storageGB': TIER_LIMITS[tier].storage,
    'usage.messagesThisMonth': 0,
    'usage.lastResetAt': new Date().toISOString(),
  });

  // Send welcome email
  await sendEmail(session.customer_email, {
    subject: `Welcome to CordBot ${tier.charAt(0).toUpperCase() + tier.slice(1)}!`,
    body: `Your subscription is active. Enjoy ${TIER_LIMITS[tier].messages} messages/month!`,
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const guildId = subscription.metadata.guildId;

  await db.collection('guilds').doc(guildId).update({
    'subscription.status': subscription.status,
    'subscription.currentPeriodStart': new Date(subscription.current_period_start * 1000).toISOString(),
    'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000).toISOString(),
    'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const guildId = subscription.metadata.guildId;

  // Deprovision
  await deprovisionCordBot({ guildId });

  await db.collection('guilds').doc(guildId).update({
    'subscription.status': 'canceled',
  });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Find guild by customer ID
  const guildSnapshot = await db.collection('guilds')
    .where('subscription.stripeCustomerId', '==', customerId)
    .get();

  if (guildSnapshot.empty) return;

  const guildId = guildSnapshot.docs[0].id;

  // Reset monthly message counter
  await db.collection('guilds').doc(guildId).update({
    'usage.messagesThisMonth': 0,
    'usage.lastResetAt': new Date().toISOString(),
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Find guild
  const guildSnapshot = await db.collection('guilds')
    .where('subscription.stripeCustomerId', '==', customerId)
    .get();

  if (guildSnapshot.empty) return;

  const guildId = guildSnapshot.docs[0].id;

  // Update status
  await db.collection('guilds').doc(guildId).update({
    'subscription.status': 'past_due',
  });

  // Send notification to Discord
  await sendPaymentFailedNotification(guildId);
}
```

### Usage Tracking & Limits

**Update: `/packages/bot/src/discord/events.ts`**

Track messages against tier limits:

```typescript
client.on('messageCreate', async (message) => {
  const guildId = message.guildId;
  if (!guildId) return;

  // Check tier limits before processing
  const guildDoc = await db.collection('guilds').doc(guildId).get();
  const guild = guildDoc.data();

  // For paid tiers, check monthly message limit
  if (guild.subscription.tier !== 'trial') {
    if (guild.usage.messagesThisMonth >= guild.limits.messagesPerMonth) {
      // Send limit reached notification
      await message.channel.send(
        `⚠️ You've reached your monthly message limit (${guild.limits.messagesPerMonth} messages). ` +
        `Upgrade your plan or wait until next billing cycle: https://cordbot.io/guild/${guildId}/upgrade`
      );
      return; // Don't process message
    }

    // Increment usage
    await db.collection('guilds').doc(guildId).update({
      'usage.messagesThisMonth': FieldValue.increment(1),
    });
  }

  // Continue with message processing...
});
```

### Upgrade/Downgrade Flow

**Web UI: `/packages/web-service/src/pages/Upgrade.tsx`**

```tsx
export function UpgradePage({ guildId }: Props) {
  const [selectedTier, setSelectedTier] = useState<'starter' | 'pro' | 'business'>('pro');

  const handleUpgrade = async () => {
    const { url } = await createCheckoutSession({ guildId, tier: selectedTier });
    window.location.href = url;
  };

  return (
    <div className="upgrade-page">
      <h1>Upgrade CordBot</h1>

      <TierCards>
        <TierCard
          name="Starter"
          price="$19"
          period="/month"
          features={[
            '500 messages/month',
            'Dedicated instance',
            '1GB storage',
            'Community support',
          ]}
          selected={selectedTier === 'starter'}
          onClick={() => setSelectedTier('starter')}
        />

        <TierCard
          name="Pro"
          price="$39"
          period="/month"
          recommended
          features={[
            '1,200 messages/month',
            'Dedicated instance',
            '1GB storage',
            'Memory & learning',
            'Priority support',
          ]}
          selected={selectedTier === 'pro'}
          onClick={() => setSelectedTier('pro')}
        />

        <TierCard
          name="Business"
          price="$79"
          period="/month"
          features={[
            '3,000 messages/month',
            'Dedicated instance',
            '5GB storage',
            'Premium support',
            'Custom integrations',
          ]}
          selected={selectedTier === 'business'}
          onClick={() => setSelectedTier('business')}
        />
      </TierCards>

      <Button onClick={handleUpgrade} size="large">
        Upgrade to {selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)}
      </Button>

      <Comparison>
        <h3>Why CordBot?</h3>
        <ComparisonTable>
          <tr>
            <th>Alternative</th>
            <th>Cost</th>
          </tr>
          <tr>
            <td>MEE6 Premium</td>
            <td>$12/mo</td>
          </tr>
          <tr>
            <td>+ Basic AI tools</td>
            <td>$7/mo</td>
          </tr>
          <tr>
            <td><strong>= Total</strong></td>
            <td><strong>$19/mo</strong></td>
          </tr>
          <tr>
            <td><strong>CordBot Starter</strong></td>
            <td><strong>$19/mo ✨</strong></td>
          </tr>
        </ComparisonTable>
      </Comparison>
    </div>
  );
}
```

### Trial → Paid Conversion

**Email after trial ends:**
```
Subject: Your CordBot trial has ended

Hi {userName},

Your 7-day CordBot trial has ended. Thanks for trying it out!

Your workspace has been backed up and is ready to restore when you upgrade.

Choose a plan:
• Starter ($19/mo) - 500 messages/month
• Pro ($39/mo) ⭐ - 1,200 messages/month
• Business ($79/mo) - 3,000 messages/month

[Upgrade Now →]

Questions? Reply to this email.
```

**Discord notification:**
```
🎉 **Trial Ended**

Thanks for trying CordBot! Your 100 free messages are used up.

Want to keep going? Upgrade now:
• **Starter**: $19/mo (500 msgs)
• **Pro**: $39/mo (1,200 msgs) ⭐
• **Business**: $79/mo (3,000 msgs)

[Upgrade at cordbot.io/upgrade →]

Your workspace is backed up and ready to restore when you upgrade!
```

---

## Phase 1: Simplify Tool Set

### 1.1 Disable Bash Tool

**Update: `/packages/bot/src/agent/manager.ts`**

Remove Bash from allowed tools:

```typescript
async createQuery(prompt: string, guildId: string, channelId: string) {
  const workingDir = `/workspace/${guildId}/${channelName}`;

  return this.sdk.query(prompt, {
    cwd: workingDir,
    tools: {
      preset: 'none',  // Don't use default preset (includes Bash)
      additional: [
        // File operations only
        'read_file',
        'write_file',
        'edit_file',
        'glob',
        'grep',
        // NO 'bash' tool
      ],
    },
    mcpServers: {
      'cordbot-tools': this.mcpServer, // Discord tools + cron tools
    },
  });
}
```

**Rationale:**
- Bash tool allows arbitrary shell commands (security risk)
- Not needed for Discord bot operations
- File tools (Read, Write, Edit) provide all necessary functionality
- Discord tools handle server management
- Web search available via separate tool

### 1.2 Remove OAuth Integrations

**Remove files:**
- `/packages/bot/src/service/gmail-service.ts`
- `/packages/bot/src/service/calendar-service.ts`
- `/packages/bot/src/tools/gmail/`
- `/packages/bot/src/tools/calendar/`
- `/packages/web-service/src/components/GmailIntegration.tsx`
- `/packages/web-service/src/components/CalendarIntegration.tsx`

**Update: `/packages/bot/src/tools/loader.ts`**

Remove Gmail/Calendar from dynamic tool loading:

```typescript
export async function loadDynamicTools(manifest: ToolsManifest): Promise<Tool[]> {
  const tools: Tool[] = [];

  // REMOVED: Gmail tools
  // REMOVED: Calendar tools

  // Keep only if we add other integrations later
  // For now, return empty array

  return tools;
}
```

**Update: `/packages/web-service/src/pages/BotPage.tsx`**

Remove integrations section:

```tsx
// REMOVE THIS ENTIRE SECTION:
<section className="integrations">
  <h3>Integrations</h3>
  <GmailIntegration />
  <CalendarIntegration />
</section>
```

**Update Firestore Schema:**

Remove OAuth fields from user document:

```typescript
interface UserDocument {
  displayName: string;
  email: string;
  discordId: string;
  photoURL: string;
  guilds: string[];
  createdAt: string;
  lastLoginAt: string;
  // REMOVED: oauthConnections
  // REMOVED: toolsManifest
}
```

---

## Phase 2: Message Tracking System

### 2.1 Track ALL Public Messages

**Update: `/packages/bot/src/discord/events.ts`**

Current behavior: Only tracks messages bot is mentioned in or threads it participates in

New behavior: Track ALL public messages for daily summaries

```typescript
client.on('messageCreate', async (message) => {
  try {
    // NEW: Track ALL public messages (not just bot interactions)
    if (!message.author.bot && message.guildId && !message.channel.isThread()) {
      await trackMessage(message);
    }

    // Existing bot interaction logic (unchanged)
    if (shouldBotRespond(message, botConfig)) {
      await handleMessageWithLock(message, sessionManager, channelMappings, botConfig);
    }
  } catch (error) {
    console.error('Error in messageCreate:', error);
  }
});
```

### 2.2 Message Storage

**New File: `/packages/bot/src/message-tracking/tracker.ts`**

```typescript
import fs from 'fs/promises';
import path from 'path';

export interface TrackedMessage {
  messageId: string;
  channelId: string;
  channelName: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  mentions: string[];
  attachmentCount: number;
  embedCount: number;
}

export async function trackMessage(message: Message): Promise<void> {
  const record: TrackedMessage = {
    messageId: message.id,
    channelId: message.channelId,
    channelName: message.channel.name,
    authorId: message.author.id,
    authorName: message.author.username,
    content: message.content,
    timestamp: new Date().toISOString(),
    mentions: message.mentions.users.map(u => u.username),
    attachmentCount: message.attachments.size,
    embedCount: message.embeds.length,
  };

  // Store in channel's messages directory
  const messagesPath = path.join(
    process.env.HOME || '/workspace',
    '.claude',
    'channels',
    message.channelId,
    'messages',
    'raw'
  );

  await fs.mkdir(messagesPath, { recursive: true });

  // Append to today's JSONL file
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(messagesPath, `${today}.jsonl`);

  await fs.appendFile(filePath, JSON.stringify(record) + '\n', 'utf-8');
}
```

**Directory Structure (per channel):**
```
~/.claude/channels/{channelId}/
├── CLAUDE.md
├── cron.yaml
├── memories/
│   ├── raw/           # Bot conversation logs
│   ├── daily/
│   └── weekly/
└── messages/          # NEW: All tracked messages
    ├── raw/
    │   ├── 2026-02-02.jsonl
    │   └── 2026-02-03.jsonl
    └── daily/
        ├── 2026-02-02.md
        └── 2026-02-03.md
```

### 2.3 Opt-Out Mechanism

Users can disable tracking per channel via CLAUDE.md:

```markdown
# Channel Instructions

---
trackMessages: false
---

[rest of instructions]
```

**Update tracker to check this setting:**
```typescript
export async function shouldTrackMessages(channelId: string): Promise<boolean> {
  const claudeMdPath = getClaudeMdPath(channelId);
  const content = await fs.readFile(claudeMdPath, 'utf-8');

  // Parse YAML frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (match) {
    const yaml = parse(match[1]);
    return yaml.trackMessages !== false;
  }

  return true; // Default: enabled
}
```

---

## Phase 3: Daily Message Summaries

### 3.1 Compression Function

**Update: `/packages/bot/src/memory/compress.ts`**

Add new function to compress daily messages:

```typescript
/**
 * Compress all tracked messages from yesterday into daily summary
 */
export async function compressDailyMessages(
  channelId: string,
  date: string
): Promise<void> {
  console.log(`[CordBot] Compressing messages for channel ${channelId} on ${date}`);

  // Read raw messages
  const messagesPath = path.join(
    process.env.HOME || '/workspace',
    '.claude',
    'channels',
    channelId,
    'messages',
    'raw',
    `${date}.jsonl`
  );

  let messages: TrackedMessage[] = [];
  try {
    const content = await fs.readFile(messagesPath, 'utf-8');
    messages = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch (error) {
    console.log(`No messages to compress for ${date}`);
    return;
  }

  if (messages.length === 0) return;

  // Group by hour for structure
  const byHour = groupMessagesByHour(messages);

  // Format for Claude
  const prompt = `You are summarizing Discord channel activity for ${date}.

Channel had ${messages.length} messages from ${new Set(messages.map(m => m.authorName)).size} users.

Messages by hour:
${formatMessagesByHour(byHour)}

Create a concise summary (2-3 paragraphs) covering:
- Key discussions and topics
- Important decisions or announcements
- Questions asked and answered
- Notable activity patterns

Be specific and actionable. This helps community members catch up on what they missed.`;

  // Use Claude to summarize
  const summary = await generateSummaryWithClaude(prompt);

  // Write daily summary
  const summaryPath = path.join(
    process.env.HOME || '/workspace',
    '.claude',
    'channels',
    channelId,
    'messages',
    'daily',
    `${date}.md`
  );

  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, summary, 'utf-8');

  console.log(`[CordBot] ✅ Daily summary saved for ${channelId}`);
}
```

### 3.2 Auto-Schedule Daily Compression

**Update: `/packages/bot/src/discord/sync.ts`**

When creating channel workspace, auto-add cron job:

```typescript
async function createChannelCronFile(channelId: string, cronPath: string) {
  const cronConfig = {
    jobs: [
      {
        name: 'daily_message_summary',
        schedule: '0 0 * * *', // Midnight UTC
        task: 'Compress yesterday\'s messages into a daily summary for this channel',
        oneTime: false,
      },
    ],
  };

  await fs.writeFile(cronPath, yaml.stringify(cronConfig), 'utf-8');
}
```

### 3.3 Message Retention Policy

**Default retention:**
- Raw messages: 30 days (then delete)
- Daily summaries: 1 year
- Weekly summaries: 5 years

**Configurable per guild via `~/.claude/settings.yaml`:**
```yaml
message_retention:
  raw_days: 30
  daily_days: 365
  weekly_days: 1825
```

**Add cleanup cron job:**
```typescript
// Auto-added to each channel
{
  name: 'cleanup_old_messages',
  schedule: '0 2 * * *', // 2 AM UTC
  task: 'Delete raw message logs older than retention policy',
  oneTime: false,
}
```

---

## Phase 4: Discord API Tools

### 4.1 New Tools Directory

**New Directory: `/packages/bot/src/tools/discord/`**

Create 12 essential Discord.js tools:

**Channel Management:**
1. `send_message.ts` - Send message to any channel
2. `list_channels.ts` - List all guild channels
3. `create_channel.ts` - Create new text/voice channel
4. `delete_channel.ts` - Delete channel (requires permission)

**Member Management:**
5. `list_members.ts` - List guild members with filters
6. `get_member.ts` - Get member info (roles, join date, etc.)
7. `kick_member.ts` - Kick member (requires permission)
8. `ban_member.ts` - Ban member (requires permission)

**Role Management:**
9. `list_roles.ts` - List all roles
10. `assign_role.ts` - Assign role to member
11. `remove_role.ts` - Remove role from member
12. `create_role.ts` - Create new role

**Example Implementation:**

**File: `/packages/bot/src/tools/discord/send_message.ts`**
```typescript
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Client, TextChannel } from 'discord.js';

export function createSendMessageTool(client: Client) {
  return tool(
    'discord_send_message',
    'Send a message to a Discord channel',
    z.object({
      channelId: z.string().describe('The Discord channel ID'),
      content: z.string().describe('Message content to send'),
    }),
    async ({ channelId, content }) => {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel || !channel.isTextBased()) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid text channel' }],
            isError: true,
          };
        }

        await (channel as TextChannel).send(content);

        return {
          content: [{
            type: 'text',
            text: `✅ Message sent to <#${channelId}>`
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true,
        };
      }
    }
  );
}
```

**File: `/packages/bot/src/tools/discord/assign_role.ts`**
```typescript
export function createAssignRoleTool(
  client: Client,
  permissionManager: DiscordPermissionManager
) {
  return tool(
    'discord_assign_role',
    'Assign a role to a guild member',
    z.object({
      userId: z.string().describe('Discord user ID'),
      roleId: z.string().describe('Discord role ID'),
      reason: z.string().optional().describe('Reason for assignment'),
    }),
    async ({ userId, roleId, reason }) => {
      // Request permission for sensitive operation
      const approved = await permissionManager.requestPermission(
        `Assign role <@&${roleId}> to <@${userId}>?`
      );

      if (!approved) {
        return {
          content: [{ type: 'text', text: 'Permission denied' }],
          isError: true,
        };
      }

      try {
        const guild = client.guilds.cache.first();
        const member = await guild.members.fetch(userId);
        const role = guild.roles.cache.get(roleId);

        await member.roles.add(role, reason);

        return {
          content: [{
            type: 'text',
            text: `✅ Assigned role ${role.name} to ${member.user.username}`
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
```

### 4.2 Tool Loader

**New File: `/packages/bot/src/tools/discord/loader.ts`**
```typescript
import { Client } from 'discord.js';
import { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { DiscordPermissionManager } from '../../permissions/discord.js';

export function loadDiscordTools(
  client: Client,
  permissionManager: DiscordPermissionManager
): SdkMcpToolDefinition[] {
  return [
    // Channel tools
    createSendMessageTool(client),
    createListChannelsTool(client),
    createCreateChannelTool(client, permissionManager),
    createDeleteChannelTool(client, permissionManager),

    // Member tools
    createListMembersTool(client),
    createGetMemberTool(client),
    createKickMemberTool(client, permissionManager),
    createBanMemberTool(client, permissionManager),

    // Role tools
    createListRolesTool(client),
    createAssignRoleTool(client, permissionManager),
    createRemoveRoleTool(client, permissionManager),
    createCreateRoleTool(client, permissionManager),
  ];
}
```

### 4.3 Integrate Discord Tools

**Update: `/packages/bot/src/agent/manager.ts`**

```typescript
import { loadDiscordTools } from '../tools/discord/loader.js';

export class SessionManager {
  private discordClient: Client;
  private permissionManager: DiscordPermissionManager;

  constructor(
    discordClient: Client,
    permissionManager: DiscordPermissionManager,
    // ... other params
  ) {
    this.discordClient = discordClient;
    this.permissionManager = permissionManager;
  }

  async createMcpServer(): Promise<McpServer> {
    // Existing built-in tools (cron, shareFile)
    const builtinTools = loadBuiltinTools(/* ... */);

    // NEW: Discord tools
    const discordTools = loadDiscordTools(
      this.discordClient,
      this.permissionManager
    );

    // Existing dynamic tools (gmail, etc.)
    const dynamicTools = await loadDynamicTools(/* ... */);

    // Combine all tools
    const allTools = [
      ...builtinTools,
      ...discordTools,
      ...dynamicTools,
    ];

    return createSdkMcpServer(allTools);
  }
}
```

### 4.4 Permission System Enhancement

Discord tools that modify state require permission approval:

**Update: `/packages/bot/src/permissions/discord.ts`**

Add permission levels:
```typescript
export enum PermissionLevel {
  LOW = 'low',      // read-only: list, get
  MEDIUM = 'medium', // modify: create, assign
  HIGH = 'high',     // destructive: delete, kick, ban
}

export const TOOL_PERMISSIONS: Record<string, PermissionLevel> = {
  // No permission needed (read-only)
  'discord_list_channels': PermissionLevel.LOW,
  'discord_list_members': PermissionLevel.LOW,
  'discord_list_roles': PermissionLevel.LOW,
  'discord_get_member': PermissionLevel.LOW,
  'discord_send_message': PermissionLevel.LOW,

  // Ask permission (modifications)
  'discord_create_channel': PermissionLevel.MEDIUM,
  'discord_assign_role': PermissionLevel.MEDIUM,
  'discord_remove_role': PermissionLevel.MEDIUM,
  'discord_create_role': PermissionLevel.MEDIUM,

  // Ask permission + log (destructive)
  'discord_delete_channel': PermissionLevel.HIGH,
  'discord_kick_member': PermissionLevel.HIGH,
  'discord_ban_member': PermissionLevel.HIGH,
};
```

---

## Phase 5: System Prompt Updates

### 5.1 New CLAUDE.md Template

**Update: `/packages/bot/src/discord/sync.ts` - `createChannelClaudeMd()`**

```markdown
# CordBot - Discord Community Assistant

You are CordBot, an AI assistant designed to help manage and support Discord communities.

## Your Core Capabilities

### 1. Community Understanding
- You track all public messages in this server
- Daily summaries are generated automatically at midnight
- You can answer questions about recent discussions and activity patterns
- Ask you: "What did people discuss yesterday?" or "Who's been most active this week?"

### 2. Discord Server Management
You have access to Discord management tools:

**Channels:**
- `discord_list_channels` - See all channels
- `discord_send_message` - Send message to any channel
- `discord_create_channel` - Create new channel
- `discord_delete_channel` - Delete channel (asks permission)

**Members:**
- `discord_list_members` - List server members
- `discord_get_member` - Get member info and roles
- `discord_kick_member` - Kick member (asks permission)
- `discord_ban_member` - Ban member (asks permission)

**Roles:**
- `discord_list_roles` - See all roles
- `discord_assign_role` - Assign role to member
- `discord_remove_role` - Remove role from member
- `discord_create_role` - Create new role

**Permission System:** You'll always ask for approval before:
- Creating or deleting channels
- Kicking or banning members
- Managing roles

### 3. Workspace & Files
- This channel has its own workspace directory for files
- You can create, read, edit, and manage files
- Share files back to Discord with the `shareFile` tool
- Organize project files, docs, or any community resources

### 4. Scheduled Tasks
- Use cron tools to schedule recurring tasks
- Examples: daily announcements, reminders, automated reports
- Schedule format: cron syntax (e.g., "0 9 * * *" = 9 AM daily)

### 5. Research & Information
- Search the web for information
- Help with coding, troubleshooting, research
- Provide answers and explanations
- Look up documentation and resources

## Communication Style
- Be friendly and conversational (not robotic)
- Respond naturally - you're a community member, not a command bot
- Use Discord markdown (bold, italic, code blocks, etc.)
- Ask clarifying questions when you need more context
- Be proactive in offering help, but not pushy

## Channel Context
**Channel:** #{channelName}
**Topic:** {channelTopic}

{additionalInstructions}

## Your Role
You're here to make this community better. Help members stay informed, manage the server efficiently, and create a positive environment. Be helpful, respectful, and always ask before taking significant actions.
```

### 5.2 Guild-Level Settings

**New File: `/workspace/.claude/GUILD.md`** (per guild)

```markdown
# Guild Settings: {guildName}

## Message Tracking
- Enabled: true
- Retention: 30 days (raw), 1 year (summaries)

## Community Guidelines
{Guild rules auto-imported from Discord}

## Custom Instructions
{User-provided guild-specific instructions}

## Timezone
UTC (configurable)
```

---

## Phase 6: Web Service Updates

### 6.1 Homepage Rebrand

**Update: `/packages/web-service/src/pages/Home.tsx`**

**New Hero Section:**
```tsx
<section className="hero">
  <h1>CordBot - Your Discord Community Assistant</h1>
  <p className="subtitle">
    AI-powered bot that understands your community, manages your server,
    and helps members stay connected.
  </p>
  <button onClick={handleAddToDiscord} className="cta-primary">
    Add CordBot to Discord
  </button>
</section>

<script>
function handleAddToDiscord() {
  const inviteUrl = generateCordBotInviteUrl(currentUser.id);
  window.location.href = inviteUrl;
}
</script>
```

**Features Section (replace personal assistant features):**
```tsx
<section className="features">
  <FeatureCard
    icon="📊"
    title="Daily Activity Summaries"
    description="CordBot tracks all conversations and generates daily summaries so members can catch up on what they missed."
  />
  <FeatureCard
    icon="🛠️"
    title="Server Management"
    description="Manage channels, roles, and members with natural language. No slash commands to remember."
  />
  <FeatureCard
    icon="💬"
    title="Natural Conversation"
    description="Just talk to CordBot like a community member. Ask questions, get help, or request actions."
  />
  <FeatureCard
    icon="📁"
    title="Workspace Per Channel"
    description="Each channel has its own workspace for files, docs, and resources. Perfect for project collaboration."
  />
  <FeatureCard
    icon="⏰"
    title="Scheduled Tasks"
    description="Set up recurring tasks like daily announcements, reminders, or automated reports."
  />
  <FeatureCard
    icon="🔍"
    title="Web Search & Research"
    description="CordBot can search the web, look up documentation, and help with technical questions."
  />
</section>
```

**How It Works Section:**
```tsx
<section className="how-it-works">
  <h2>Get Started in 2 Simple Steps</h2>

  <Step number={1}>
    <h3>Invite CordBot to Your Server</h3>
    <p>Click "Add to Discord", select your server, and approve permissions. Takes 30 seconds.</p>
  </Step>

  <Step number={2}>
    <h3>Provide Your Anthropic API Key</h3>
    <p>After CordBot joins, you'll be prompted for your API key. That's it!</p>
  </Step>

  <Note>
    <p>✨ <strong>No bot creation needed!</strong> CordBot is a single shared bot - just invite it.</p>
  </Note>
</section>
```

### 6.2 Bot Management Updates

**Update: `/packages/web-service/src/pages/BotPage.tsx`**

Add new sections:

```tsx
<section className="message-tracking">
  <h3>Message Tracking</h3>
  <p>CordBot tracks all public messages for daily summaries.</p>

  <Stats>
    <Stat label="Messages Tracked (30d)" value={bot.stats.messagesTracked} />
    <Stat label="Daily Summaries" value={bot.stats.dailySummaries} />
    <Stat label="Active Channels" value={bot.stats.activeChannels} />
  </Stats>

  <Toggle
    label="Enable Message Tracking"
    checked={bot.features.trackMessages}
    onChange={handleToggleTracking}
  />
</section>

<section className="discord-tools">
  <h3>Discord Management Tools</h3>
  <p>CordBot can help manage your server:</p>

  <ToolList>
    <Tool icon="📝" name="Send Messages" />
    <Tool icon="📁" name="Manage Channels" />
    <Tool icon="👥" name="Manage Members" />
    <Tool icon="🎭" name="Manage Roles" />
  </ToolList>

  <p className="note">
    CordBot will always ask for permission before taking sensitive actions.
  </p>
</section>
```

### 6.3 Navigation & Branding

**Update: `/packages/web-service/src/components/Navigation.tsx`**

```tsx
<nav>
  <Logo>
    <BotIcon />
    <span>CordBot</span>
  </Logo>

  <NavLinks>
    <NavLink to="/">Home</NavLink>
    <NavLink to="/bots">My Bots</NavLink>
    <NavLink to="/docs">Documentation</NavLink>
    <NavLink to="/pricing">Pricing</NavLink>
  </NavLinks>

  <UserMenu>
    {user ? (
      <>
        <CreateBotButton />
        <UserProfile user={user} />
      </>
    ) : (
      <SignInButton />
    )}
  </UserMenu>
</nav>
```

### 6.4 Documentation Updates

**New Docs Pages:**
1. **Getting Started with CordBot** - Step-by-step setup
2. **Message Tracking & Summaries** - How it works, privacy, opt-out
3. **Discord Management Tools** - What CordBot can do
4. **Channel Workspaces** - Using files and CLAUDE.md customization
5. **Scheduled Tasks** - Setting up cron jobs
6. **Privacy & Data** - What we track, retention, GDPR compliance

**Update: `/packages/web-service/src/pages/Docs.tsx`**

Reorganize docs around community management use cases instead of personal assistant features.

---

## Phase 7: Firestore Schema Updates

### 7.1 New Firestore Schema (Guild-Centric)

**New Collection: `guilds/{guildId}`**

Instead of `users/{userId}/bots/{botId}`, we now use guild-centric model:

```typescript
// NEW PRIMARY COLLECTION: guilds/{guildId}
interface GuildDocument {
  guildId: string;                    // Discord guild ID
  guildName: string;
  guildIcon: string | null;
  guildOwnerId: string;               // Discord guild owner
  addedBy: string;                    // Firebase UID who added CordBot

  // Fly.io deployment
  appName: string;
  machineId: string;
  volumeId: string;
  region: string;
  status: 'provisioning' | 'running' | 'stopped' | 'error';

  // Features (always enabled for CordBot)
  features: {
    trackMessages: boolean;           // Default: true
    dailySummaries: boolean;          // Default: true
    discordTools: boolean;            // Default: true
  };

  // Usage stats
  stats: {
    messagesTracked: number;
    dailySummariesGenerated: number;
    discordToolCalls: number;
    activeChannels: number;
  };

  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}

// UPDATED: users/{userId}
interface UserDocument {
  displayName: string;
  email: string;
  discordId: string;
  photoURL: string;
  guilds: string[];                   // Array of guild IDs where user added CordBot
  createdAt: string;
  lastLoginAt: string;
}
```

**Migration Note:** Keep legacy `users/{userId}/bots/{botId}` for existing deployments. New CordBot deployments use `guilds/{guildId}`.

### 7.2 Update Cloud Functions

**The `provisionCordBot` function** (already defined in Phase 0.4) handles:
- Creating Fly.io machine with shared bot token
- Storing guild document in Firestore
- Addingto user's guilds list

**New Function: Update Guild Stats**
```typescript
export const updateGuildStats = onCall(async (request) => {
  const { guildId, stats } = request.data;

  await db.collection('guilds')
    .doc(guildId)
    .update({
      'stats.messagesTracked': FieldValue.increment(stats.messagesTracked || 0),
      'stats.dailySummariesGenerated': FieldValue.increment(stats.dailySummaries || 0),
      'stats.discordToolCalls': FieldValue.increment(stats.toolCalls || 0),
      'stats.activeChannels': stats.activeChannels,
      lastActiveAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

  return { success: true };
});
```

---

## Phase 8: Bot Environment Updates

### 8.1 Deployment Configuration

**Keep existing Fly.io setup** - no changes needed!

Current config works perfectly:
```toml
# fly.toml (no changes)
app = "cordbot-{userId}-{botId}"

[build]
  dockerfile = "docker-image/Dockerfile"

[[mounts]]
  source = "cordbot_volume"
  destination = "/workspace"
  initial_size = "1GB"  # Can be increased per-guild as needed

[env]
  # Existing env vars (unchanged)
  DISCORD_BOT_TOKEN = "{from_user}"
  DISCORD_GUILD_ID = "{from_user}"
  ANTHROPIC_API_KEY = "{from_user}"
  BOT_MODE = "shared"  # Default for community bots
  MEMORY_CONTEXT_SIZE = "10000"
```

### 8.2 Bot Startup

**Update: `/packages/bot/src/index.ts`**

Log CordBot branding:
```typescript
console.log(`
╔═══════════════════════════════════════╗
║     CordBot Community Assistant       ║
║   Discord Server Management AI        ║
╚═══════════════════════════════════════╝
`);

console.log('[CordBot] Initializing...');
console.log('[CordBot] Guild:', process.env.DISCORD_GUILD_ID);
console.log('[CordBot] Mode:', process.env.BOT_MODE);
console.log('[CordBot] Features:');
console.log('  ✓ Message tracking');
console.log('  ✓ Daily summaries');
console.log('  ✓ Discord management tools');
console.log('  ✓ Channel workspaces');
console.log('  ✓ Scheduled tasks');
```

---

## Phase 9: Testing & Validation

### 9.1 Test Scenarios

**Message Tracking:**
1. Send 50 messages across multiple channels
2. Verify all stored in `.jsonl` files
3. Check opt-out works (set `trackMessages: false` in CLAUDE.md)
4. Verify only opted-in channels are tracked

**Daily Summaries:**
1. Trigger daily compression manually
2. Verify summary generated in `messages/daily/`
3. Ask bot "What did people discuss yesterday?"
4. Verify bot reads summary and provides accurate recap

**Discord Tools:**
1. "@CordBot list all channels"
2. "@CordBot create a new channel called test"
3. "@CordBot assign role X to user Y" (verify permission request)
4. Deny permission → verify graceful handling
5. Approve permission → verify action completed

**System Prompts:**
1. Check CLAUDE.md updated with community focus
2. Verify bot responds as community assistant
3. Ask about Discord management capabilities
4. Verify bot explains available tools

**Web UI:**
1. Create new bot → verify "community-assistant" type
2. Check stats displayed (messages tracked, summaries)
3. Toggle message tracking → verify update in Firestore
4. Check updated homepage messaging

### 9.2 Migration Testing

**Existing Bots:**
- Legacy bots should continue working unchanged
- New bots get community assistant features
- No breaking changes to existing deployments

### 9.3 Performance Validation

**Metrics:**
- Message tracking latency: <100ms
- Daily compression time: <2 minutes for 1000 messages
- Discord tool response time: <1 second
- No impact on existing bot response times

---

## Phase 10: Migration & Rollout

### 10.1 Gradual Rollout

**Week 1: Update Website**
- Deploy homepage rebrand
- Update documentation
- Add community assistant features to new bot creation

**Week 2: Internal Testing**
- Deploy CordBot to 2-3 test Discord servers
- Test all features for 1 week
- Gather feedback and fix bugs

**Week 3: Soft Launch**
- Email existing users about new community features
- Enable for all new bot deployments
- Offer existing users to "upgrade" (just enable features)

**Week 4: Public Launch**
- Announce on social media (Twitter, Reddit, Discord)
- Product Hunt launch
- Marketing push focused on Discord communities

### 10.2 Existing User Communication

**Email Template:**
```
Subject: Introducing CordBot Community Features 🎉

Hi {userName},

We've added powerful new community features to your Discord bot!

What's New:
✅ Message tracking & daily summaries - Never miss important discussions
✅ Discord management tools - Manage channels, roles, and members with AI
✅ Enhanced system prompts - Optimized for community assistance

These features are available now for your bot: {botName}

[Enable Community Features] [Learn More]

Your bot will continue working exactly as before. These are opt-in enhancements you can enable anytime.

Questions? Check out our updated docs or reply to this email.

Happy community building!
The CordBot Team
```

### 10.3 No Breaking Changes

**Critical:** Existing bots are unaffected. All changes are:
- Additive (new features)
- Opt-in (can be disabled)
- Backward compatible (existing deployments work unchanged)

---

## Phase 11: Documentation

### 11.1 User Documentation

**New/Updated Docs:**
1. **What is CordBot?** - Product overview, use cases
2. **Getting Started** - Setup guide (unchanged flow)
3. **Message Tracking** - How it works, privacy, opt-out
4. **Daily Summaries** - Reading summaries, customization
5. **Discord Management** - Available tools and permissions
6. **Channel Workspaces** - File operations, CLAUDE.md
7. **Scheduled Tasks** - Cron jobs for automation
8. **Privacy & Data** - What we track, retention, compliance
9. **Upgrading from Personal Mode** - Migration guide
10. **Troubleshooting** - Common issues

### 11.2 Developer Documentation

**Updated Docs:**
1. **Architecture Overview** - System design (unchanged)
2. **Message Tracking System** - Implementation details
3. **Adding Discord Tools** - Contributing new tools
4. **Tool Permission System** - How permissions work
5. **Deployment Guide** - Fly.io setup (unchanged)

---

## Critical Files to Modify

### Phase 0: OAuth & Auto-Provisioning
1. **`/packages/web-service/src/utils/discord-oauth.ts`** - NEW: OAuth invite URL generator
2. **`/packages/web-service/src/pages/DiscordCallback.tsx`** - NEW: OAuth callback handler
3. **`/packages/functions/src/cordbot-provisioning.ts`** - NEW: Auto-provisioning function
4. **`/packages/bot/src/index.ts`** - Add guild filtering on startup
5. **`/packages/bot/src/discord/events.ts`** - Add guild filtering to ALL event handlers

### Phases 1-3: Core Features
6. **`/packages/bot/src/message-tracking/tracker.ts`** - NEW: Message tracking system
7. **`/packages/bot/src/memory/compress.ts`** - Add daily message compression
8. **`/packages/bot/src/tools/discord/`** - NEW: 12+ Discord tool files
9. **`/packages/bot/src/tools/discord/loader.ts`** - NEW: Discord tools loader
10. **`/packages/bot/src/agent/manager.ts`** - Integrate Discord tools into MCP server

### Phase 4-5: Web Service
11. **`/packages/web-service/src/pages/Home.tsx`** - Rebrand + add OAuth invite button
12. **`/packages/web-service/src/pages/GuildPage.tsx`** - NEW: Guild management (replaces BotPage)
13. **`/packages/web-service/src/pages/GuildsList.tsx`** - NEW: List user's guilds
14. **`/packages/web-service/src/components/Navigation.tsx`** - Update branding
15. **`/packages/bot/src/discord/sync.ts`** - Update CLAUDE.md template

### Phase 6-7: Backend
16. **`/packages/functions/src/stats.ts`** - NEW: Update guild stats function
17. **`firestore.rules`** - Update for guild-centric schema

### Documentation
18. **`/packages/web-service/src/pages/Docs.tsx`** - Reorganize for community use cases
19. **`/docs/setup-guide.md`** - NEW: Updated setup guide (OAuth flow)
20. **`/docs/message-tracking.md`** - NEW: Message tracking documentation
21. **`/docs/discord-tools.md`** - NEW: Discord tools documentation

---

## Verification Plan

### End-to-End Test

**OAuth & Provisioning:**
1. **Click "Add CordBot"** → Redirects to Discord OAuth
2. **Select test guild** → Approve permissions
3. **Redirect to callback** → Shows "Setting up CordBot..." spinner
4. **Wait 30 seconds** → Fly.io machine provisions
5. **Success page** → Shows guild info, "CordBot Added!" message
6. **Check Firestore** → Guild document created with correct data
7. **Check Fly.io** → Machine running with correct env vars
8. **Check Discord** → CordBot appears in member list

**Message Tracking:**
9. **Send 20 messages** → In multiple channels
10. **Check storage** → Verify messages in `.jsonl` files
11. **Test opt-out** → Disable tracking in CLAUDE.md → verify stopped

**Daily Summaries:**
12. **Trigger compression** → Manually run or wait for midnight
13. **Check summary** → Verify `messages/daily/{date}.md` created
14. **Ask bot** → "@CordBot what did people discuss yesterday?"
15. **Verify response** → Bot reads summary and provides accurate recap

**Discord Tools:**
16. **List channels** → "@CordBot list all channels"
17. **Create channel** → "@CordBot create a channel called test"
18. **Permission request** → "@CordBot delete channel test" → should ask permission
19. **Deny permission** → Verify graceful error message
20. **Approve permission** → Verify channel deleted

**Web UI:**
21. **Visit /guilds** → See test guild listed
22. **Click guild** → View stats (messages tracked, summaries)
23. **Toggle features** → Disable message tracking → verify update
24. **Check CLAUDE.md** → Verify community assistant template

### Performance Validation
- Bot response time: <2 seconds (unchanged)
- Message tracking overhead: <50ms per message
- Daily compression: <5 minutes for 1000 messages
- Volume usage: ~50-100MB per guild (with 30-day retention)

---

## Success Metrics (First 3 Months)

### Adoption
- 50+ community bots deployed
- 100,000+ messages tracked
- 1,000+ daily summaries generated
- 500+ Discord tool calls

### Engagement
- 80%+ of new bots enable message tracking
- 50%+ users read daily summaries
- 30%+ users use Discord management tools
- Existing bots: 20%+ upgrade to community features

### Technical
- 99.5%+ uptime (unchanged)
- <2s response time (unchanged)
- <0.1% error rate
- No regressions in existing functionality

### User Satisfaction
- Net Promoter Score: >40
- Support ticket rate: <5%
- Feature request: "More Discord tools!"

---

## Timeline Estimate

**Week 1: OAuth & Auto-Provisioning (Phase 0)**
- Day 1-2: Create CordBot Discord application, setup OAuth
- Day 3-4: Build auto-provisioning Cloud Function
- Day 5: Update bot startup with guild filtering
- Day 6-7: Test OAuth flow end-to-end

**Week 2: Message Tracking & Discord Tools (Phases 1-3)**
- Day 1-2: Implement message tracking system
- Day 3-4: Daily compression function
- Day 5-7: Build 12 Discord API tools

**Week 3: System Prompts & Web Service (Phases 4-5)**
- Day 1-2: Update CLAUDE.md templates
- Day 3-4: Rebrand homepage + add OAuth invite flow
- Day 5-7: Update guild status pages, documentation

**Week 4: Testing & Launch (Phases 8-9)**
- Day 1-3: End-to-end testing (OAuth → provision → message tracking)
- Day 4-5: Bug fixes and polish
- Day 6-7: Soft launch to beta users

**Total: 3-4 weeks from start to public launch**

---

## Risk Mitigation

### Technical Risks
- **Message tracking volume** → Start with 30-day retention, aggressive compression
- **Daily compression lag** → Run at off-peak hours, limit to 1000 messages per batch
- **Discord API rate limits** → Implement exponential backoff, cache frequently accessed data
- **Volume storage growth** → Monitor usage, alert at 80% capacity, easy to expand

### Product Risks
- **Users don't want tracking** → Make it opt-in per channel, clear privacy docs
- **Discord tools too powerful** → Strong permission system, audit logging
- **Existing users confused** → Clear communication, migration guide, no breaking changes

### Mitigation Strategies
- Thorough testing with real Discord servers
- Gradual rollout (internal → soft → public)
- Clear documentation and examples
- Easy rollback (disable features via Firestore toggle)
- Support channel for questions

---

## Conclusion

This pivot transforms your product from a personal assistant (competing with Apple/Google) to a **Discord Community Assistant** - a much better market fit.

**Key Advantages of This Approach:**

✅ **Keeps current architecture** - Per-guild deployments (~$2-3/month) with proven reliability
✅ **Simple implementation** - 4 weeks to launch vs 6-8 weeks for full rewrite
✅ **No breaking changes** - Existing bots work unchanged
✅ **Clear value proposition** - "AI for Discord communities"
✅ **Better market fit** - Discord lacks good AI tools for community management
✅ **Scalable cost model** - Users provide API keys, infrastructure is cheap
✅ **Feature focused** - Message tracking, summaries, Discord tools add real value

**Ready to build CordBot?** 🤖✨
