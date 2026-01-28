# Cordbot Web Service

A web-based dashboard for managing your Cordbot configuration, bot tokens, and service integrations.

## Overview

The web service provides a user-friendly interface for:

1. **Bot Setup** - Guided flow for creating and configuring your Discord bot
2. **Token Management** - Securely store and manage your bot token
3. **Service Integrations** - Connect OAuth-based services (Gmail, Calendar, Slack, etc.)
4. **CLI Integration** - Copy your bot token for use with the CLI

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

### 5. Use with CLI

Users run the Cordbot CLI which automatically authenticates:

```bash
npx cordbot
# CLI opens browser for automatic authentication
# User provides Claude API key
# Bot starts!
```

The CLI uses an OAuth-like flow that automatically fetches the bot token and guild ID from the web service, eliminating manual token copying.

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
