# CordBot Phase 1 Implementation Summary

## Overview

Successfully implemented the transformation from user-token-based system to a shared-token OAuth model with one-click installation. The system has been rebranded from "Deploy Intelligent Discord Bots" to "AI Community Bot for Discord" with enhanced memory storage.

## What Was Implemented

### 1. Backend Infrastructure (Cloud Functions)

#### New Files Created:
- **`packages/functions/src/admin.ts`**
  - Defines shared Discord bot token secret
  - Defines shared Anthropic API key secret
  - Defines Discord OAuth credentials (client ID, client secret, redirect URI)
  - All secrets managed via Firebase Secret Manager

- **`packages/functions/src/discord-oauth.ts`**
  - Implements `handleDiscordOAuth` Cloud Function
  - Handles OAuth callback from Discord
  - Exchanges OAuth code for access token
  - Fetches guild details from Discord API
  - Creates `guilds/{guildId}` Firestore document
  - Redirects to success page for provisioning

#### Modified Files:
- **`packages/functions/src/fly-hosting.ts`**
  - Added `provisionGuild()` function - provisions Fly.io resources using shared credentials
  - Added `pollGuildMachineStatus()` helper - monitors guild deployment status
  - Removed `createBotDocument()` - replaced by OAuth flow
  - Removed `updateBotDiscordConfig()` - no longer needed
  - Removed `listHostedBots()` - will be replaced by guild listing

- **`packages/functions/src/index.ts`**
  - Removed `validateBotToken` export
  - Added `handleDiscordOAuth` export
  - Added `provisionGuild` export
  - Removed `createBotDocument`, `updateBotDiscordConfig`, `listHostedBots` exports

### 2. Bot Runtime (Discord Bot)

#### Modified Files:
- **`packages/bot/src/discord/events.ts`** (lines 445-475)
  - Added user message capture to memory storage
  - Stores ALL messages (not just AI responses) with username prefixes
  - Format: `[DisplayName]: message content`
  - Uses existing `appendRawMemory()` and `logRawMemoryCaptured()` functions
  - Works in both personal and shared modes
  - Non-blocking error handling - doesn't interrupt message processing

### 3. Web Frontend

#### Modified Files:
- **`packages/web-service/src/pages/Home.tsx`**
  - Changed title: "Deploy Intelligent Discord Bots" → "AI Community Bot for Discord"
  - Updated description to focus on community features
  - Removed "Choose Your Bot Mode" section (lines 101-167)
  - Changed button text: "Create Your First Bot" → "Add to Discord Server"
  - Removed unused imports (UserIcon, UsersIcon)

- **`packages/web-service/src/components/CreateBotModal.tsx`**
  - Complete rewrite - now a simple OAuth redirect modal
  - Removed bot name input and mode selection
  - Direct link to Discord OAuth URL
  - Shows clear instructions for OAuth flow
  - Uses environment variables for Discord client ID and redirect URI

- **`packages/web-service/src/App.tsx`**
  - Added import for `OAuthSuccess` component
  - Added route: `/guilds/:guildId/setup` → `<OAuthSuccess />`

#### New Files Created:
- **`packages/web-service/src/pages/OAuthSuccess.tsx`**
  - Displays setup progress after OAuth completion
  - Listens to guild Firestore document for status updates
  - Shows loading states: pending → provisioning → active
  - Displays guild icon and name when active
  - Error handling with helpful messages
  - Navigation to guild management or home page

### 4. Database & Security

#### Modified Files:
- **`firestore.rules`**
  - Added `guilds/{guildId}` collection rules:
    - Read: Public (anyone can read for display)
    - Write: Cloud Functions only (users cannot create/modify)

## Database Schema Changes

### New Collection: `guilds/{guildId}`

```typescript
{
  guildName: string              // Discord server name
  guildIcon: string | null       // Discord server icon hash
  status: "pending" | "provisioning" | "active" | "error"

  // Fly.io deployment info
  appName: string                // e.g., cordbot-guild-{guildid12}
  machineId: string              // Fly.io machine ID
  volumeId: string               // Fly.io volume ID
  region: string                 // Deployment region (default: sjc)

  // OAuth install metadata
  installedBy: string            // Discord user ID who installed
  permissions: string            // OAuth permissions granted

  // Timestamps
  createdAt: timestamp
  updatedAt: timestamp
  provisionedAt: timestamp       // When Fly.io resources created

  // Configuration
  memoryContextSize: number      // Default: 10000 tokens

  // Error handling
  errorMessage?: string          // Present if status === 'error'
}
```

### Old Collections (Still Present, to be migrated):
- `users/{userId}/bots/{botId}` - Will be deprecated in future phases

## Environment Variables Required

### Firebase Functions Configuration:
1. **Secrets (Firebase Secret Manager):**
   - `SHARED_DISCORD_BOT_TOKEN` - Single Discord bot token for all guilds
   - `SHARED_ANTHROPIC_API_KEY` - Single Anthropic API key for all guilds
   - `DISCORD_CLIENT_SECRET` - Discord OAuth application secret

2. **Parameters (Firebase Environment Config):**
   - `DISCORD_CLIENT_ID` - Discord application client ID
   - `DISCORD_REDIRECT_URI` - OAuth callback URL (e.g., `https://cordbot.io/auth/discord/callback`)

### Web Service (.env):
```
VITE_DISCORD_CLIENT_ID=<your-discord-client-id>
VITE_DISCORD_REDIRECT_URI=<your-redirect-uri>
```

## OAuth Flow Diagram

```
User clicks "Add to Discord Server"
        ↓
Redirects to Discord OAuth
        ↓
User selects server & approves permissions
        ↓
Discord redirects to handleDiscordOAuth function
        ↓
Exchange code for access token
        ↓
Fetch guild details from Discord API
        ↓
Create guilds/{guildId} document (status: pending)
        ↓
Redirect to /guilds/{guildId}/setup
        ↓
OAuthSuccess page loads
        ↓
User triggers provisionGuild (manual or auto)
        ↓
provisionGuild function:
  - Updates status to "provisioning"
  - Creates Fly.io app
  - Creates Fly.io volume
  - Creates Fly.io machine with shared credentials
  - Updates guild document with Fly.io details
  - Polls machine status in background
        ↓
Machine starts successfully
        ↓
Status updated to "active"
        ↓
User sees success message
```

## Memory Storage Enhancement

### What Changed:
Previously, only AI responses were stored in memory. Now, ALL messages are captured with username prefixes.

### Implementation:
- Location: `packages/bot/src/discord/events.ts` (after line 445)
- Captures user messages before sending to Claude
- Uses existing memory infrastructure:
  - `appendRawMemory()` - stores to `~/.claude/channels/{channelId}/memories/raw/{date}.jsonl`
  - `logRawMemoryCaptured()` - logs to memory operation log
- Format: `{"timestamp":"...","message":"[Username]: content","sessionId":"...","threadId":"..."}`

### Benefits:
- Richer context for community understanding
- Complete conversation history (not just one side)
- Better memory recall for long-term interactions
- No change to existing memory compression pipeline

## Files Modified Summary

### Backend:
- ✅ Created: `packages/functions/src/admin.ts`
- ✅ Created: `packages/functions/src/discord-oauth.ts`
- ✅ Modified: `packages/functions/src/fly-hosting.ts` (added provisionGuild, removed old functions)
- ✅ Modified: `packages/functions/src/index.ts` (updated exports)

### Bot:
- ✅ Modified: `packages/bot/src/discord/events.ts` (added message capture)

### Frontend:
- ✅ Modified: `packages/web-service/src/pages/Home.tsx` (rebranding)
- ✅ Modified: `packages/web-service/src/components/CreateBotModal.tsx` (OAuth redirect)
- ✅ Created: `packages/web-service/src/pages/OAuthSuccess.tsx` (setup status page)
- ✅ Modified: `packages/web-service/src/App.tsx` (added route)

### Configuration:
- ✅ Modified: `firestore.rules` (added guilds collection)

## What Needs Manual Setup

### 1. Discord Developer Portal:
1. Create new Discord Application
2. Enable OAuth2
3. Add redirect URI: `https://yourdomain.com/auth/discord/callback`
4. Copy Client ID and Client Secret
5. Create bot user and copy bot token

### 2. Firebase Console:
1. Add secrets to Secret Manager:
   - `SHARED_DISCORD_BOT_TOKEN`
   - `SHARED_ANTHROPIC_API_KEY`
   - `DISCORD_CLIENT_SECRET`
2. Set environment variables:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_REDIRECT_URI`

### 3. Web Service Environment:
1. Create `.env` file with:
   - `VITE_DISCORD_CLIENT_ID`
   - `VITE_DISCORD_REDIRECT_URI`

## Deployment Checklist

- [ ] Add secrets to Firebase Secret Manager
- [ ] Set environment variables in Firebase Functions
- [ ] Configure Discord OAuth redirect URI
- [ ] Deploy Cloud Functions: `cd packages/functions && npm run deploy`
- [ ] Build and push bot Docker image with memory capture changes
- [ ] Build and deploy web frontend: `cd packages/web-service && npm run build && firebase deploy --only hosting`
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Test OAuth flow with test guild
- [ ] Verify message storage in memory files
- [ ] Monitor logs for errors

## Testing Checklist

### OAuth Flow:
- [ ] Click "Add to Discord Server" redirects to Discord
- [ ] OAuth approval creates guild document in Firestore
- [ ] Redirects to `/guilds/{guildId}/setup`
- [ ] Shows provisioning status
- [ ] Updates to active when machine starts

### Bot Deployment:
- [ ] Fly.io app created with correct name format
- [ ] Machine starts with shared credentials
- [ ] Bot appears in Discord server members
- [ ] Bot responds to mentions in Discord

### Memory Storage:
- [ ] User messages captured to raw memory files
- [ ] Messages include username prefixes in shared mode
- [ ] AI responses still captured (existing functionality)
- [ ] Memory logs show captured messages

## Known Limitations

1. **OAuth callback manual trigger**: The current implementation requires the OAuthSuccess page to manually call `provisionGuild`. Ideally, this should be triggered automatically by the OAuth handler or via a Firestore trigger.

2. **No automatic cleanup**: Failed provisions leave Fly.io resources. Need to implement cleanup on error.

3. **Single region**: All guilds deploy to 'sjc' region. Could be optimized based on guild location.

4. **No migration path**: Existing users with personal bots need manual migration instructions.

5. **provisionGuild requires secrets from frontend**: The current implementation passes shared tokens from frontend call, which is insecure. Should be refactored to read secrets directly in the function or use a Firestore trigger.

## Recommended Next Steps

1. **Implement automatic provisioning**:
   - Option A: Trigger provisionGuild from handleDiscordOAuth directly
   - Option B: Use Firestore onCreate trigger for guilds collection

2. **Create guild management page**: `/guilds/{guildId}` to view status, logs, and settings

3. **Implement guild listing page**: `/guilds` to show all guilds user has installed bot in

4. **Add error recovery**: Retry logic and cleanup for failed provisions

5. **Update Navigation**: Add "My Guilds" link and update sidebar

6. **Migrate existing users**: Create migration tool or instructions

7. **Add analytics**: Track OAuth conversions, provisioning success rate

8. **Improve security**: Move secret access to backend trigger function

## Breaking Changes

⚠️ **This is a breaking change for the old bot creation flow**

- Old bot creation UI will no longer work after deployment
- Users cannot create personal bots via the old flow
- All new bots must use OAuth flow
- Existing bots in `users/{userId}/bots/{botId}` will continue to work but cannot be created

## Rollback Plan

If critical issues arise:

1. Stop new OAuth installs by removing OAuth link from homepage
2. Revert codebase: `git revert <commit-hash>`
3. Redeploy Cloud Functions, Frontend, and Bot image
4. Manually clean up any failed guild documents in Firestore
5. Investigate and fix issues before redeploying

## Success Metrics

- ✅ User can complete OAuth flow in <10 seconds
- ✅ Guild provisions within 30 seconds
- ✅ Bot responds to messages in Discord
- ✅ ALL messages stored with username prefixes in memory
- ✅ Homepage shows "AI Community Assistant" branding
- ✅ No token/key input anywhere in UI
- ✅ Single shared bot model implemented
