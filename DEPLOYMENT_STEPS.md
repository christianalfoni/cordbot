# Deployment Steps - CordBot Phase 1

## Pre-Deployment Checklist

- [ ] All environment variables configured (see ENV_SETUP_GUIDE.md)
- [ ] Discord OAuth redirect URI configured
- [ ] Firebase secrets added to Secret Manager
- [ ] Anthropic API key has sufficient credits
- [ ] Fly.io organization and permissions verified
- [ ] Code reviewed and tested locally
- [ ] Backup of current production database (if applicable)

## Step 1: Deploy Cloud Functions

```bash
cd packages/functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy to Firebase
npm run deploy

# Or deploy specific functions
firebase deploy --only functions:handleDiscordOAuth
firebase deploy --only functions:provisionGuild
```

**Expected Output**:
```
✔ functions[handleDiscordOAuth] Successful create operation.
✔ functions[provisionGuild] Successful create operation.
Function URL (handleDiscordOAuth): https://us-central1-{project}.cloudfunctions.net/handleDiscordOAuth
```

**Verify**:
- Check Firebase Console → Functions
- Verify secrets are attached to functions
- Test function URLs are accessible

## Step 2: Update and Deploy Bot Image

The bot needs to be rebuilt with the new message capture functionality.

```bash
cd packages/bot

# Build Docker image
docker build -t christianalfoni/cordbot-agent:latest .

# Test locally (optional)
docker run -e DISCORD_BOT_TOKEN=test -e ANTHROPIC_API_KEY=test christianalfoni/cordbot-agent:latest

# Push to Docker Hub
docker push christianalfoni/cordbot-agent:latest
```

**Important**: Existing Fly.io machines will need to be redeployed to use the new image.

For existing bots:
```bash
# List all cordbot apps
fly apps list | grep cordbot

# For each app, trigger redeploy
fly deploy --image christianalfoni/cordbot-agent:latest -a cordbot-{app-name}
```

## Step 3: Deploy Web Service

```bash
cd packages/web-service

# Install dependencies
npm install

# Create production .env file
cat > .env << EOF
VITE_DISCORD_CLIENT_ID=your-client-id
VITE_DISCORD_REDIRECT_URI=https://yourdomain.com/auth/discord/callback
EOF

# Build for production
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

**Expected Output**:
```
✔ hosting: Finished running predeploy script.
✔ hosting: Deploying to...
✔ Deploy complete!

Project Console: https://console.firebase.google.com/project/{project}/overview
Hosting URL: https://{project}.web.app
```

**Verify**:
- Visit your hosting URL
- Check homepage shows "AI Community Bot for Discord"
- Verify "Add to Discord Server" button is present

## Step 4: Deploy Firestore Security Rules

```bash
# From project root
firebase deploy --only firestore:rules
```

**Expected Output**:
```
✔ firestore: rules file firestore.rules compiled successfully
✔ firestore: released rules firestore.rules to cloud.firestore
✔ Deploy complete!
```

**Verify**:
- Firebase Console → Firestore → Rules
- Check guilds collection rules are present

## Step 5: Test OAuth Flow End-to-End

### 5.1 Test OAuth Installation
1. Navigate to your deployed web app
2. Sign in with Google/Discord
3. Click "Add to Discord Server"
4. Select a test Discord server
5. Approve permissions

**Expected**:
- Redirects to Discord OAuth page
- Shows permission list
- Redirects back to `/guilds/{guildId}/setup`
- Shows "Setting up CordBot..." message

### 5.2 Verify Firestore Document Created
```bash
# Check if guild document was created
firebase firestore:get guilds/{guildId}
```

**Expected Fields**:
```json
{
  "guildName": "Test Server",
  "guildIcon": "abc123...",
  "status": "pending",
  "installedBy": "discord-user-id",
  "permissions": "277025508352",
  "createdAt": "2026-02-02T...",
  "memoryContextSize": 10000
}
```

### 5.3 Trigger Provisioning

**Note**: Current implementation requires manual call to provisionGuild. Future enhancement will automate this.

Option A - Via Firebase Console:
1. Open Firebase Console → Functions
2. Find `provisionGuild` function
3. Test with payload:
```json
{
  "guildId": "your-guild-id",
  "sharedDiscordBotToken": "Bot token here",
  "sharedAnthropicApiKey": "API key here"
}
```

Option B - Via web interface (if implemented):
- Wait for OAuthSuccess page to auto-trigger provisioning

### 5.4 Verify Fly.io Deployment
```bash
# Check if app was created
fly apps list | grep cordbot-guild

# Check machine status
fly status -a cordbot-guild-{guildid12}

# View logs
fly logs -a cordbot-guild-{guildid12}
```

**Expected Output**:
```
NAME                            STATUS  MACHINE ID      REGION  IP ADDRESS
cordbot-guild-{guildid12}       started {machine-id}    sjc     ...
```

### 5.5 Verify Bot in Discord
1. Open your test Discord server
2. Check server members list
3. Look for your bot (should show as online)
4. Send a message mentioning the bot: `@CordBot hello`

**Expected**:
- Bot appears in member list with online status
- Bot responds to mention

### 5.6 Verify Message Storage
```bash
# SSH into Fly.io machine
fly ssh console -a cordbot-guild-{guildid12}

# Check memory files
cat ~/.claude/channels/{channel-id}/memories/raw/$(date +%Y-%m-%d).jsonl

# Should see entries like:
# {"timestamp":"2026-02-02T...","message":"[YourName]: hello","sessionId":"...","threadId":"..."}
# {"timestamp":"2026-02-02T...","message":"Response from bot","sessionId":"...","threadId":"..."}
```

## Step 6: Monitor and Verify

### Check Cloud Function Logs
```bash
# View all function logs
firebase functions:log

# Filter by function
firebase functions:log --only handleDiscordOAuth

# Follow logs in real-time
firebase functions:log --follow
```

### Check Fly.io Logs
```bash
# View logs for specific guild
fly logs -a cordbot-guild-{guildid12}

# Follow logs in real-time
fly logs -a cordbot-guild-{guildid12} --follow
```

### Check Firestore Updates
Monitor the guild document status transitions:
- `pending` → `provisioning` → `active`

## Step 7: Production Smoke Tests

Run these tests on production to ensure everything works:

- [ ] OAuth flow completes successfully
- [ ] Guild document created in Firestore
- [ ] Fly.io resources provisioned
- [ ] Bot appears in Discord server
- [ ] Bot responds to mentions
- [ ] User messages stored in memory
- [ ] AI responses stored in memory
- [ ] No errors in function logs
- [ ] No errors in bot logs

## Rollback Procedure

If critical issues are found after deployment:

### 1. Stop New OAuth Installs
```bash
cd packages/web-service/src/components

# Comment out OAuth URL in CreateBotModal.tsx
# or redirect to maintenance page
```

Redeploy:
```bash
npm run build
firebase deploy --only hosting
```

### 2. Revert Code Changes
```bash
# Identify commit before Phase 1 changes
git log --oneline

# Revert to previous commit
git revert {commit-hash}

# Or reset (if safe)
git reset --hard {commit-hash}
```

### 3. Redeploy Previous Version
```bash
# Deploy old functions
cd packages/functions
npm run deploy

# Deploy old hosting
cd packages/web-service
npm run build
firebase deploy --only hosting

# Deploy old bot image
docker tag christianalfoni/cordbot-agent:previous christianalfoni/cordbot-agent:latest
docker push christianalfoni/cordbot-agent:latest
```

### 4. Clean Up Failed Guilds
```bash
# Query failed guilds
firebase firestore:get guilds --where status==error

# Manually delete or fix
firebase firestore:delete guilds/{guildId}
```

### 5. Investigate and Fix
- Review logs for error patterns
- Fix issues locally
- Test thoroughly before redeploying

## Post-Deployment Tasks

### 1. Update Documentation
- [ ] Update README.md with new OAuth flow
- [ ] Add screenshots of new UI
- [ ] Update API documentation

### 2. Notify Users (if applicable)
- [ ] Send email to existing users about changes
- [ ] Post announcement in community Discord
- [ ] Update website/blog with new features

### 3. Set Up Monitoring
```bash
# Set up Firebase alerts
# - Function error rate > 5%
# - Hosting 4xx/5xx errors

# Set up Anthropic usage alerts
# - Token usage approaching limit
# - Cost per day exceeding threshold

# Set up Fly.io monitoring
# - Machine crash rate
# - Volume usage
```

### 4. Create Backup Procedures
```bash
# Schedule regular Firestore backups
# Set up automated database exports

# Document recovery procedures
# - How to restore from backup
# - Emergency contact list
```

## Troubleshooting Common Issues

### OAuth callback returns 404
- Verify `handleDiscordOAuth` function deployed successfully
- Check function URL matches redirect URI exactly
- Ensure no trailing slashes in URLs

### Guild document created but provisioning doesn't start
- Check `provisionGuild` function logs
- Verify secrets are accessible
- Ensure Fly.io API token has correct permissions

### Bot doesn't appear in Discord
- Verify bot token is correct
- Check machine status on Fly.io
- Review bot logs for connection errors

### Messages not being stored
- SSH into Fly.io machine
- Check file permissions on ~/.claude directory
- Review bot logs for memory storage errors

### Machine fails to start
- Check Fly.io machine logs
- Verify environment variables are set correctly
- Ensure Docker image is accessible

## Success Criteria

Deployment is successful when:

✅ OAuth flow completes without errors
✅ Guild documents created in Firestore
✅ Fly.io machines provisioned and running
✅ Bots appear online in Discord servers
✅ Bots respond to mentions
✅ All messages stored in memory files
✅ No critical errors in logs
✅ Homepage shows new branding
✅ Old bot creation flow disabled

## Next Steps After Deployment

1. **Monitor Performance**:
   - Watch error rates for 24 hours
   - Monitor Anthropic API usage
   - Check Fly.io resource utilization

2. **Gather Feedback**:
   - Survey early adopters
   - Monitor support channels
   - Track conversion rates

3. **Plan Phase 2**:
   - Implement automatic provisioning trigger
   - Create guild management interface
   - Add error recovery mechanisms

4. **Optimize**:
   - Tune memory context size
   - Optimize machine resources
   - Improve error messages
