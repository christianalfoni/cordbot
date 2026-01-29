# Cordbot Web Service

A web-based dashboard for managing your Cordbot configuration, bot tokens, and service integrations.

## Overview

The web service provides a user-friendly interface for:

1. **Bot Setup** - Guided flow for creating and configuring your Discord bot
2. **Token Management** - Securely store and manage your bot token
3. **Service Integrations** - Connect OAuth-based services (Gmail, Calendar, Slack, etc.)
4. **Agent Integration** - Copy your bot token for use with the agent

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- Firebase project with Firestore and Functions enabled
- Discord application with OAuth2 configured

### Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment variables:**

   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

   Update the values in `.env.local`:
   ```env
   # Your Firebase web app config
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Run the development server:**
   ```bash
   pnpm dev
   ```

4. **Build for production:**
   ```bash
   pnpm build
   ```

## User Flow

### 1. Sign In with Discord

Users authenticate using Discord OAuth2. This creates a user profile in Firestore.

### 2. Create a Discord Bot

The dashboard guides users through creating their own Discord bot:

1. Visit the Discord Developer Portal
2. Create a new application
3. Add a bot to the application
4. Configure bot settings (name, private)
5. Copy the bot token

### 3. Configure Bot

Users paste their bot token into the web service:

- Token is validated via Firebase Function
- Bot information and guilds are fetched
- Token is securely stored in Firestore

### 4. Select Guild

If the bot is in multiple guilds, users select which one to use with Cordbot:

- Single guild: Auto-selected
- No guilds: Show invite link
- Multiple guilds: User chooses one

### 5. Use with Agent

Users run the Cordbot agent which automatically authenticates:

```bash
npx cordbot
# Agent opens browser for automatic authentication
# User provides Claude API key
# Bot starts!
```

The agent uses an OAuth-like flow that automatically fetches the bot token and guild ID from the web service, eliminating manual token copying.

## Project Structure

```
packages/web-service/
├── src/
│   ├── components/
│   │   ├── BotSetup.tsx       # Bot token setup flow
│   │   ├── Dashboard.tsx      # Main dashboard
│   │   ├── Login.tsx          # Login page
│   │   └── ...
│   ├── hooks/
│   │   ├── useAuth.ts         # Firebase Auth hook
│   │   ├── useUserBot.ts      # Bot token management
│   │   └── ...
│   ├── firebase.ts            # Firebase initialization
│   ├── App.tsx                # Root component
│   └── main.tsx               # Entry point
├── index.html
├── vite.config.ts
└── package.json
```

## Key Components

### BotSetup

Handles the entire bot configuration flow:

- Instructions for creating a Discord bot
- Token input and validation
- Guild selection
- Token copy functionality
- Error handling

### Dashboard

Main application dashboard showing:

- User profile
- Bot configuration status
- Service integrations
- Quick actions

### useUserBot Hook

Manages bot token state and operations:

- Token validation via Firebase Function
- Guild fetching
- Token storage in Firestore
- Real-time updates

## Security

- Bot tokens are stored encrypted in Firestore
- Security rules ensure users can only access their own data
- Firebase Functions proxy Discord API calls to avoid CORS
- Tokens are never exposed in URLs or client-side code

## Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Configure environment variables
3. Deploy

### Firebase Hosting

```bash
pnpm build
firebase deploy --only hosting
```

### Fly.io (For the Bot Agent)

To deploy the Cordbot agent to Fly.io for 24/7 operation:

#### Prerequisites

1. Install Fly CLI:
   ```bash
   # macOS
   brew install flyctl

   # Linux/WSL
   curl -L https://fly.io/install.sh | sh

   # Windows
   pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. Sign up and authenticate:
   ```bash
   fly auth signup  # or fly auth login
   ```

#### Initial Setup

1. **Create a deployment template:**
   ```bash
   npx @cordbot/agent --template=fly
   ```

   This creates `fly.toml` and `Dockerfile` in your current directory.

2. **Create a Fly.io app:**
   ```bash
   fly apps create cordbot-agent
   ```

3. **Set up secrets:**
   ```bash
   # Get your bot token from the web service dashboard
   fly secrets set DISCORD_BOT_TOKEN="your_bot_token"
   fly secrets set DISCORD_GUILD_ID="your_guild_id"
   fly secrets set ANTHROPIC_API_KEY="your_api_key"
   ```

4. **Create persistent volume (recommended):**
   ```bash
   fly volumes create cordbot_data --size 1
   ```

   The volume persists:
   - Channel configurations (CLAUDE.md files)
   - Cron job definitions
   - Session data
   - Files created by Claude

#### Deploy

```bash
fly deploy
```

#### Monitor and Manage

```bash
# View logs
fly logs

# Check status
fly status

# SSH into the machine
fly ssh console

# Scale to zero (stop bot)
fly scale count 0

# Scale back up
fly scale count 1
```

#### Updating the Bot

When you publish a new version of `@cordbot/agent`:

1. Update the version in your `Dockerfile`:
   ```dockerfile
   RUN npm install -g @cordbot/agent@1.3.x
   ```

2. Deploy:
   ```bash
   fly deploy
   ```

#### Volume Management

```bash
# List volumes
fly volumes list

# Expand volume
fly volumes extend cordbot_data --size 2

# Backup (manual)
fly ssh console
cd /data
tar -czf /tmp/backup.tar.gz .
exit
fly ssh sftp get /tmp/backup.tar.gz ./cordbot-backup.tar.gz
```

#### Troubleshooting

**Bot not starting:**
- Check logs: `fly logs`
- Verify secrets are set: `fly secrets list`
- Ensure volume is created and mounted

**Bot crashes/restarts:**
- Check memory usage: `fly status`
- Increase memory in `fly.toml` if needed (default: 1GB)
- Review error logs: `fly logs --region arn`

**Files not persisting:**
- Verify volume is created: `fly volumes list`
- Check volume is mounted to `/data` in `fly.toml`
- Ensure bot is writing to `/data` not `/app`

**Permission errors:**
- The bot runs as the `node` user (non-root)
- Volume must be owned by `node:node`
- This is configured automatically in the Dockerfile

#### Cost Estimate

- **App (256MB RAM):** ~$2-3/month
- **App (1GB RAM):** ~$5-7/month
- **Volume (1GB):** ~$0.15/month
- **Total:** ~$2-7/month depending on resources

See [Fly.io pricing](https://fly.io/docs/about/pricing/) for current rates.

## Development

### Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm lint` - Run ESLint

### Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Firebase** - Auth, Firestore, Functions
- **Discord API** - Bot management

## Troubleshooting

### Bot token validation fails

- Ensure the token is correct (copied from Discord Developer Portal)
- Check that the bot hasn't been deleted
- Verify Firebase Functions are deployed

### Guilds not showing

- Make sure the bot has been invited to at least one guild
- Check bot permissions in Discord
- Wait a few seconds and refresh

### CORS errors

- Ensure Firebase Functions are properly deployed
- Check that `validateBotToken` function exists
- Verify Functions are callable from the web app

## Contributing

See the main project README for contribution guidelines.

## License

MIT
