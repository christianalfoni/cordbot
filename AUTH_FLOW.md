# Agent Authentication Flow

## Overview

Cordbot now uses a streamlined OAuth-like authentication flow that eliminates manual token copying and guides users through the setup process.

## How It Works

### User Flow

1. **User runs Agent**: `npx cordbot`
2. **Authentication prompt**: Agent prompts to press ENTER to authenticate
3. **Browser opens**: Localhost server starts and browser opens to web service `/auth/cli` page
4. **Web service checks**:
   - If not logged in → redirects to login with error
   - If no bot configured → shows error message with instructions
   - If bot configured → redirects back to Agent with token and guild ID
5. **Agent receives token**: Localhost server receives the callback and stores the credentials
6. **Configure Claude API**: User enters their Claude API key
7. **Bot starts**: Cordbot is ready to use!

### Technical Details

**Agent Side** (`packages/bot/src/auth.ts`):
- Starts Express server on `localhost:3456` (or next available port)
- Opens browser to `{WEB_SERVICE_URL}/auth/cli?callback=http://localhost:3456/callback`
- Waits for callback with token and guild ID
- Stores credentials in `.env` file
- Handles errors (no bot, not authenticated, timeout)

**Web Service Side** (`packages/web-service/src/pages/CliAuth.tsx`):
- Checks if user is authenticated
- Checks if bot is configured
- Redirects to callback URL with:
  - Success: `?token=xxx&guildId=xxx`
  - Error: `?error=no_bot` or `?error=not_authenticated`

### Configuration

**Environment Variables**:
```bash
# Agent (optional, defaults to cordbot.io)
WEB_SERVICE_URL=https://your-web-service.com
```

**Production Setup**:
For production, you'll need to set `WEB_SERVICE_URL` environment variable to point to your deployed web service URL.

## Error Handling

### No Bot Configured
If the user hasn't set up their bot on the web service:
1. Agent shows error message
2. Directs user to visit web service
3. User sets up bot
4. User runs `npx cordbot` again

### Not Authenticated
If the user isn't logged in:
1. Redirects to callback with error
2. Agent shows message to visit web service and sign in
3. User signs in
4. User runs `npx cordbot` again

### Timeout
If authentication takes longer than 5 minutes:
1. Local server closes
2. User can try again

## Benefits

✅ **No manual token copying** - Seamless browser-based auth
✅ **Better security** - Token never displayed in plaintext
✅ **Guided setup** - Users discover the web interface naturally
✅ **Familiar pattern** - Similar to GitHub Agent, AWS Agent, etc.
✅ **Error recovery** - Clear instructions when setup incomplete

## Files Modified

### Agent
- `packages/bot/src/auth.ts` - New authentication module
- `packages/bot/src/cli.ts` - Updated to use web service auth
- `packages/bot/package.json` - Added `express` and `open` dependencies

### Web Service
- `packages/web-service/src/pages/CliAuth.tsx` - New auth callback page
- `packages/web-service/src/App.tsx` - Added `/auth/cli` route
- `packages/web-service/src/components/BotSetup.tsx` - Updated instructions to mention new flow
