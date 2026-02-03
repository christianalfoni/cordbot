# Environment Setup Guide - CordBot Phase 1

## Discord Developer Portal Setup

### Step 1: Create Discord Application

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name: "CordBot" (or your preferred name)
4. Accept terms and create

### Step 2: Configure OAuth2

1. Navigate to "OAuth2" → "General"
2. Add Redirect URI:
   ```
   https://yourdomain.com/auth/discord/callback
   ```
   (For local testing: `http://localhost:5173/auth/discord/callback`)
3. Save changes
4. Copy "Client ID" - you'll need this
5. Copy "Client Secret" - you'll need this

### Step 3: Create Bot User

1. Navigate to "Bot" section
2. Click "Add Bot"
3. Configure bot settings:
   - Username: "CordBot" (or preferred name)
   - Uncheck "Public Bot" (recommended for private use)
   - Check "Requires OAuth2 Code Grant"
4. Scroll to "Bot Permissions" section
5. Copy "Token" - you'll need this (SHARED_DISCORD_BOT_TOKEN)

### Step 4: Configure Bot Permissions

Required permissions for the bot:

- **View Channels** (268435456)
- **Send Messages** (2048)
- **Manage Messages** (8192)
- **Embed Links** (16384)
- **Attach Files** (32768)
- **Read Message History** (65536)
- **Add Reactions** (64)
- **Use Slash Commands** (2147483648)

Combined permissions integer: **277025508352**

This is already configured in the CreateBotModal.tsx OAuth URL.

## Firebase Console Setup

### Step 1: Add Secrets to Secret Manager

Navigate to Firebase Console → Functions → Secrets

#### Add SHARED_DISCORD_BOT_TOKEN:

```bash
firebase functions:secrets:set SHARED_DISCORD_BOT_TOKEN
```

Paste the Discord bot token from Step 3 above.

#### Add SHARED_ANTHROPIC_API_KEY:

```bash
firebase functions:secrets:set SHARED_ANTHROPIC_API_KEY
```

Paste your Anthropic API key (get from https://console.anthropic.com/).

#### Add DISCORD_CLIENT_SECRET:

```bash
firebase functions:secrets:set DISCORD_CLIENT_SECRET
```

Paste the Discord client secret from Step 2 above.

### Step 2: Set Environment Variables

Set these as Firebase Functions environment variables (not secrets):

```bash
firebase functions:config:set \
  discord.client_id="YOUR_DISCORD_CLIENT_ID" \
  discord.redirect_uri="https://yourdomain.com/auth/discord/callback"
```

**Note**: With Firebase Functions v2, you should define these in `.env` files or use `defineString()` in your function code (already implemented in `admin.ts`).

For v2 functions, create `packages/functions/.env`:

```
DISCORD_CLIENT_ID=1467962756618522829
DISCORD_REDIRECT_URI=https://yourdomain.com/auth/discord/callback
```

## Web Service Environment Setup

Create `packages/web-service/.env`:

```env
VITE_DISCORD_CLIENT_ID=your-client-id-here
VITE_DISCORD_REDIRECT_URI=https://yourdomain.com/auth/discord/callback
```

**For local development**:

```env
VITE_DISCORD_CLIENT_ID=your-client-id-here
VITE_DISCORD_REDIRECT_URI=http://localhost:5173/auth/discord/callback
```

**Important**: Make sure to add this redirect URI to your Discord application settings!

## Anthropic Console Setup

1. Go to https://console.anthropic.com/
2. Navigate to "API Keys"
3. Create new key or copy existing key
4. This is your `SHARED_ANTHROPIC_API_KEY`

## Fly.io Setup

Ensure you have the Fly.io API token configured for Firebase Functions:

```bash
firebase functions:secrets:set FLY_API_TOKEN
```

Get your Fly.io token from: https://fly.io/user/personal_access_tokens

Verify your Fly.io organization slug matches the value in `fly-hosting.ts`:

```typescript
const FLY_ORG = "cordbot"; // Update if different
```

## Environment Variables Summary

### Firebase Secrets (Secret Manager):

- `SHARED_DISCORD_BOT_TOKEN` - Discord bot token
- `SHARED_ANTHROPIC_API_KEY` - Anthropic API key
- `DISCORD_CLIENT_SECRET` - Discord OAuth client secret
- `FLY_API_TOKEN` - Fly.io API token (already exists)
- `GOOGLE_CLIENT_ID` - Google OAuth (already exists, for Gmail)
- `GOOGLE_CLIENT_SECRET` - Google OAuth (already exists, for Gmail)

### Firebase Functions Environment:

Create `packages/functions/.env`:

```env
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_REDIRECT_URI=https://yourdomain.com/auth/discord/callback
```

### Web Service Environment:

Create `packages/web-service/.env`:

```env
VITE_DISCORD_CLIENT_ID=your-discord-client-id
VITE_DISCORD_REDIRECT_URI=https://yourdomain.com/auth/discord/callback
```

## Verification Checklist

After setting up all environment variables:

- [ ] Discord bot token is valid (test with Discord API)
- [ ] Anthropic API key has sufficient credits
- [ ] Discord OAuth redirect URI matches exactly
- [ ] Fly.io API token has correct permissions
- [ ] Firebase secrets are accessible by functions
- [ ] Web service can read environment variables

## Testing the Setup

### 1. Test Discord OAuth Flow:

```bash
# Start web service locally
cd packages/web-service
npm run dev
```

Navigate to `http://localhost:5173` and click "Add to Discord Server"

### 2. Test Functions Locally:

```bash
cd packages/functions
npm run serve
```

### 3. Deploy and Test:

```bash
# Deploy functions
cd packages/functions
npm run deploy

# Deploy hosting
cd packages/web-service
npm run build
firebase deploy --only hosting

# Deploy Firestore rules
firebase deploy --only firestore:rules
```

## Troubleshooting

### "Invalid OAuth2 redirect_uri"

- Ensure redirect URI in Discord app settings exactly matches DISCORD_REDIRECT_URI
- Include protocol (http:// or https://)
- No trailing slash

### "Secret not found" errors in functions

- Run `firebase functions:secrets:access SHARED_DISCORD_BOT_TOKEN` to verify secret exists
- Check secret name matches exactly (case-sensitive)
- Ensure function has access to secrets in deployment

### OAuth flow redirects but nothing happens

- Check browser console for errors
- Verify handleDiscordOAuth function is deployed
- Check Firebase Functions logs: `firebase functions:log`

### Bot doesn't respond in Discord

- Verify bot is added to the guild (check Discord server members)
- Check Fly.io machine status: `fly status -a cordbot-guild-{guildid12}`
- Check bot logs: `fly logs -a cordbot-guild-{guildid12}`

## Security Best Practices

1. **Never commit secrets to git**:

   - Add `.env` to `.gitignore`
   - Use `.env.example` for templates

2. **Rotate keys regularly**:

   - Discord bot token
   - Anthropic API key
   - Fly.io API token

3. **Use separate keys for development and production**:

   - Create separate Discord applications for dev/prod
   - Use different Anthropic API keys
   - Test locally before deploying

4. **Restrict bot permissions**:

   - Only grant necessary Discord permissions
   - Regularly audit bot access

5. **Monitor usage**:
   - Set up Anthropic usage alerts
   - Monitor Fly.io resource usage
   - Track Firebase function invocations
