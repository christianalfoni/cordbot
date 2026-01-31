# Multi-Bot Support with Personal and Shared Modes

## Overview

Transform Cordbot from single-bot-per-user to multi-bot-per-user architecture with two operating modes:

- **Personal Mode**: Responds to all messages (current behavior)
- **Shared Mode**: Mention-triggered with smart thread behavior and username attribution

## Key Requirements

### 1. Multi-Bot Architecture

- Support up to 10 bots per user
- Each bot gets unique Fly.io deployment (separate app, machine, volume)
- Each bot has own Discord token, guild, and configuration
- Firestore schema changes from single `hostedBot` object to `hostedBots` array

### 2. Bot Modes

**Personal Mode** (current behavior):

- Responds to all messages in synced channels
- Auto-creates threads from channel messages
- No username prefixing needed (single user context)

**Shared Mode** (new):

- Only responds to @mentions in channels
- Creates threads from mentions
- Prefixes user messages to Claude with `[username]: message`
- Smart thread behavior:
  - Single user (thread creator): Respond to all messages
  - Multiple users: Only respond when @mentioned
  - Always track all messages for context even when not responding

### 3. Bot Identity

- Pass bot's Discord username to CLI on startup
- Include bot name in CLAUDE.md or system prompt
- Bot should understand it's acting as a named assistant in shared contexts

## Implementation Tasks

### Phase 1: Firestore Schema (packages/functions)

**Files**: `src/fly-hosting.ts`, `src/index.ts`

**Changes**:

1. Update Firestore schema:

   ```typescript
   interface HostedBotConfig {
     botId: string; // UUID
     botName: string; // User-friendly name
     botDiscordUsername?: string; // Bot's Discord username (fetched after provision)
     mode: "personal" | "shared";
     appName: string;
     machineId: string;
     volumeId: string;
     region: string;
     status: "provisioning" | "running" | "stopped" | "error";
     version: string;
     provisionedAt: string;
     discordBotToken: string; // Per-bot token
     discordGuildId: string; // Per-bot guild
   }

   interface UserDoc {
     hostedBots: HostedBotConfig[]; // Array instead of single object
   }
   ```

2. Create new Cloud Functions:

   - `createHostedBot(botName, mode, discordBotToken, discordGuildId, anthropicApiKey, region)` - Replaces `provisionHostedBot`
   - `listHostedBots()` - Returns user's bots
   - Update existing functions to accept `botId` parameter:
     - `getBotStatus(botId)`
     - `restartBot(botId)`
     - `deployBot(botId)`
     - `redeployBot(botId)`
     - `deprovisionBot(botId)`
     - `getBotLogs(botId)`

3. Update naming strategy:

   - App name: `cordbot-{userPrefix}-{botPrefix}` (uses botId)
   - Volume name: `cb_{userPrefix}_{botPrefix}`
   - Ensures unique names per bot

4. Add environment variables to Fly.io machine:

   ```bash
   BOT_MODE=personal|shared
   BOT_ID={unique bot ID}
   DISCORD_BOT_USERNAME={bot's Discord username}
   ```

5. Implement bot limit enforcement (max 10 per user)

### Phase 2: Bot Message Handling (packages/bot)

**Files**: `src/discord/events.ts`, `src/index.ts`, `src/cli.ts`

**Changes**:

1. **Environment Variables** (`src/cli.ts`):

   - Add optional `BOT_MODE` (defaults to 'personal')
   - Add optional `BOT_ID` for logging
   - Add optional `DISCORD_BOT_USERNAME` for bot identity
   - Validate mode is 'personal' or 'shared'

2. **Bot Initialization** (`src/index.ts`):

   - Read bot mode and ID from environment
   - Pass bot mode and username to event handlers
   - Log mode on startup

3. **Message Filtering** (`src/discord/events.ts` - handleMessage function):

   **Shared Mode Channel Logic**:

   ```typescript
   if (botMode === "shared" && !message.channel.isThread()) {
     const botMentioned = message.mentions.has(message.client.user!);
     if (!botMentioned) {
       return; // Ignore messages without mention
     }
     // Keep mention in message (don't strip)
   }
   ```

   **Smart Thread Logic**:

   ```typescript
   if (botMode === "shared" && message.channel.isThread()) {
     // Track unique users in thread
     const threadUsers = await getThreadParticipants(message.channel);

     if (threadUsers.size === 1) {
       // Only thread creator - respond to all messages
       shouldRespond = true;
     } else {
       // Multiple users - only respond to mentions
       shouldRespond = message.mentions.has(message.client.user!);
     }

     // IMPORTANT: Always track message for context, even if not responding
     if (!shouldRespond) {
       await addMessageToThreadContext(message, sessionId);
       return; // Don't respond, but message is in context
     }
   }
   ```

4. **Message Prefixing** (`src/discord/events.ts`):

   ```typescript
   // Only prefix in shared mode for user messages to Claude
   if (botMode === "shared") {
     const displayName = message.member?.displayName || message.author.username;
     userMessage = `[${displayName}]: ${message.content}`;
   }
   ```

5. **Thread Participant Tracking**:

   - Create helper function `getThreadParticipants(threadChannel)`
   - Fetch recent messages from thread
   - Return Set of unique author IDs (excluding bots)

6. **Session Context Management**:

   - Create `addMessageToThreadContext()` function
   - Stores message in session without triggering response
   - Ensures Claude has full thread context when eventually mentioned
   - Clear messages from internal thread context

7. **Bot Identity** (`src/discord/sync.ts` or `src/index.ts`):

   - Update CLAUDE.md template to include bot username:

     ```markdown
     # Bot Identity

     You are ${botUsername}, a Discord bot assistant.
     ${mode === 'shared' ? 'You are in a shared server. Users will @mention you when they need help.' : ''}
     ```

   - Ensure all channel CLAUDE.md is prefixed with the contents of the root CLAUDE.md file

8. **Thread Creation** (`src/discord/events.ts` and `src/agent/stream.ts`):

   **Lazy Thread Creation** - Create threads when sending first response, not when receiving message:

   - In `handleMessage()`: Don't create thread immediately
   - Check if message is in a thread or channel
   - If in channel, store channel message for later thread creation
   - Pass original message to streaming function

   - In `streamToDiscord()`: Create thread before sending first message

     ```typescript
     async function streamToDiscord(
       queryResult,
       channelOrMessage: TextChannel | ThreadChannel | Message,
       ...
     ) {
       let targetChannel: TextChannel | ThreadChannel;

       if (channelOrMessage instanceof Message) {
         // Message from channel - create thread from this message
         const message = channelOrMessage;
         const textChannel = message.channel as TextChannel;

         const threadName = botMode === 'shared'
           ? `${textChannel.client.user!.username}: ${message.content.slice(0, 40)}...`
           : `${message.author.username}: ${message.content.slice(0, 50)}...`;

         const thread = await textChannel.threads.create({
           name: threadName,
           autoArchiveDuration: 1440,
           reason: 'Claude conversation',
           startMessage: message,
         });

         targetChannel = thread;
       } else {
         // Already in thread or handling thread message
         targetChannel = channelOrMessage;
       }

       // Stream response to targetChannel...
     }
     ```

   **Benefits**:

   - No empty threads created when bot doesn't respond (shared mode without mention)
   - Thread only created when bot actually has something to say
   - Cleaner UX - thread appears with bot's response immediately

### Phase 3: Web Service UI (packages/web-service)

**Files**: `src/hooks/useHostedBot.ts`, new components

**Changes**:

1. **Update Hook** (`src/hooks/useHostedBot.ts` → `useHostedBots.ts`):

   - Change from single bot to array of bots
   - Update all functions to accept `botId` parameter
   - Add `createBot()`, `listBots()` functions
   - Track `canCreateMore` (limit 10)

2. **New Components**:

   - `BotList.tsx` - Grid/list view of all user's bots
   - `BotCard.tsx` - Individual bot card with mode badge, status
   - `CreateBotForm.tsx` - Multi-step form:
     - Bot name input
     - Mode selection (radio cards with descriptions)
     - Discord token/guild inputs
     - Anthropic API key input
     - Region selection
   - `BotDetails.tsx` - Individual bot management page
   - `BotActions.tsx` - Restart, deploy, delete buttons

3. **Mode Selection UI**:

   ```
   ○ 👤 Personal Mode
     Responds to all messages in synced channels.
     Best for private servers or dedicated channels.

   ○ 👥 Shared Mode
     Only responds when @mentioned. Creates threads
     and tracks conversations. Best for shared servers.
   ```

4. **Bot Management UI**:
   - Dashboard shows all bots with status indicators
   - Filter/sort by mode, status, region
   - Quick actions: view logs, restart, delete
   - Visual distinction between personal/shared bots

### Phase 4: Critical Files

**Must modify**:

1. `/packages/functions/src/fly-hosting.ts` - Multi-bot provisioning logic
2. `/packages/functions/src/index.ts` - New and updated Cloud Functions
3. `/packages/bot/src/discord/events.ts` - Smart thread behavior and message filtering
4. `/packages/bot/src/index.ts` - Bot mode initialization
5. `/packages/web-service/src/hooks/useHostedBot.ts` - Multi-bot frontend state

## Verification

### Manual Testing

- [ ] Create bot with personal mode
- [ ] Create bot with shared mode
- [ ] Send channel messages (personal responds, shared ignores)
- [ ] @mention shared bot in channel
- [ ] Verify thread created with bot username in title
- [ ] Send messages in thread (only thread creator)
- [ ] Verify shared bot responds to all messages
- [ ] Add another user to thread
- [ ] Send message without mention
- [ ] Verify shared bot does not respond
- [ ] @mention shared bot
- [ ] Verify response includes context from previous non-responded message
- [ ] Verify messages prefixed with `[username]: ...` in Claude's context
- [ ] Delete bot, verify removed from list
- [ ] Verify personal mode has no username prefixing

## Rollout Strategy

### Week 1: Backend Foundation

- Implement Firestore schema changes (breaking - replace `hostedBot` with `hostedBots`)
- Create new Cloud Functions with botId support
- Deploy to staging
- Test with test accounts

### Week 2: Bot Updates

- Implement BOT_MODE environment variable
- Add smart thread behavior logic
- Add message prefixing
- Add bot identity features
- Test with staging bots in Discord

### Week 3: Frontend

- Create multi-bot UI components
- Update hooks for array-based operations
- Build bot creation flow
- Test end-to-end flows

### Week 4: Testing & Deployment

- End-to-end testing in staging
- Deploy to production
- Create new bots with fresh schema

## Edge Cases

1. **Bot leaves/rejoins guild**: Handle gracefully, update status
2. **Thread archived**: Session persists, can resume if unarchived
3. **Multiple bots in same guild**: Each operates independently
4. **User deletes bot on Discord**: Status shows error, allow cleanup
5. **Thread with 50+ participants**: Pagination when fetching participants
6. **Non-responded messages limit**: Consider max context size
7. **Bot mentioned multiple times in one message**: Handle as single mention

## Future Enhancements

- Bot templates (pre-configured modes/settings)
- Bot cloning (duplicate configuration)
- Per-bot OAuth connections (different Gmail accounts)
- Bot analytics (usage metrics, response rates)
- Cross-bot communication
- Bot scheduling (active hours)
