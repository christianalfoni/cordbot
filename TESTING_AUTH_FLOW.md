# Testing the Agent Authentication Flow

## Updated Flow

The authentication flow now handles users who aren't logged in:

1. **Agent starts and opens browser** → User presses ENTER, browser opens to `/auth/cli`
2. **Not logged in?** → Shows message "You need to sign in first. Redirecting to login..."
3. **User logs in with Discord** → After successful login, automatically redirects back to Agent auth
4. **Bot check** → Validates bot configuration
5. **Redirect to Agent** → Sends token and guild ID back to Agent
6. **Agent stores config** → Saves to .env and prompts for Claude API key
7. **Bot starts** → Ready to use!

## Testing Steps

### 1. Start Web Service

```bash
cd packages/web-service
pnpm dev
```

The service should start on port 5174 (or next available port).

### 2. Run Agent (First Time - Not Logged In)

```bash
cd packages/bot
pnpm dev
# OR
npx cordbot
```

**Expected Flow:**
1. Agent prompts: "Press ENTER to open your browser and sign in..."
2. Press ENTER
3. Browser opens to web service `/auth/cli` page
4. Page shows: "Sign In Required - You need to sign in first. Redirecting to login..."
5. Page redirects to login page after 2 seconds
6. Click "Sign in with Discord"
7. Complete Discord OAuth
8. After login, automatically redirects back to `/auth/cli`
9. If bot not configured, shows error and instructions to set up bot
10. If bot configured, redirects back to Agent with token
11. Agent shows: "✓ Successfully authenticated!"
12. Agent prompts for Claude API key
13. Bot starts!

### 3. Run Agent (Already Logged In)

If you're already logged in to the web service:

1. Agent prompts: "Press ENTER to open your browser and sign in..."
2. Press ENTER
3. Browser opens, immediately checks auth (already logged in)
4. If bot configured, redirects to Agent with token
5. If bot not configured, shows error with instructions

## Error Scenarios

### No Bot Configured

**What happens:**
- Agent opens browser
- User logs in (if needed)
- Page shows: "Setup Required - No bot configured. Please set up your bot first."
- Page displays:
  ```
  ⚠️ No bot configured

  Please visit https://cordbot.io to:
    1. Sign in with Discord
    2. Set up your Discord bot
    3. Configure your bot token

  Then run "npx cordbot" again.
  ```
- User clicks "Go to Dashboard"
- User sets up bot in web service
- User runs `npx cordbot` again
- Success!

### Session Expired

If your session expires:
- Agent opens browser
- Shows "You need to sign in first"
- Redirects to login
- After login, continues with auth flow

## Debugging

### Check Dev Server Port

If the dev server isn't on 5174:
```bash
# Set custom URL
export WEB_SERVICE_URL=http://localhost:5175
npx cordbot
```

### Check Auth State

In browser console on web service:
```javascript
// Check if logged in
console.log('User:', firebase.auth().currentUser);

// Check session storage
console.log('Pending callback:', sessionStorage.getItem('cli_auth_callback'));
```

### Check Agent Callback Server

The Agent starts a server on port 3456 (or next available). Check if it's running:
```bash
lsof -i :3456
```

### Clear Session

To test the "not logged in" flow:
1. Open browser to web service
2. Open DevTools → Application → Storage
3. Click "Clear site data"
4. Or just sign out from the dashboard

## Production Testing

For production, set the web service URL:

```bash
export WEB_SERVICE_URL=https://your-deployed-web-service.com
npx cordbot
```

The flow works the same, just with the production URL.
