import { UserData } from '../hooks/useAuth';
import { Navigation } from '../components/Navigation';
import { useGuilds } from '../hooks/useGuilds';
import { SparklesIcon, BoltIcon, ShieldCheckIcon, CodeBracketIcon } from '@heroicons/react/24/outline';

interface HomeProps {
  userData: UserData;
  onSignOut: () => void;
}

// Discord OAuth configuration
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || '';
const REDIRECT_URI = import.meta.env.VITE_DISCORD_REDIRECT_URI ||
  `${window.location.origin}/auth/discord/callback`;

export function Home({ userData, onSignOut }: HomeProps) {
  const { guilds } = useGuilds(userData.id);

  const handleAddToDiscord = () => {
    // Build Discord OAuth URL
    // Scopes: bot (add bot), applications.commands (slash commands), guilds (read guild info)
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&permissions=277025508352&scope=bot%20applications.commands%20guilds&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

    // Navigate to Discord OAuth in same tab
    window.location.href = oauthUrl;
  };

  const features = [
    {
      name: 'Remembers Everything',
      description: 'Your bot builds context from every conversation, so it can reference past discussions and understand your community over time.',
      icon: SparklesIcon,
    },
    {
      name: 'Ready in 30 Seconds',
      description: 'One click to add to your server. No API keys, no configuration—your bot is online and ready to help immediately.',
      icon: BoltIcon,
    },
    {
      name: 'Always Available',
      description: 'Your bot never goes offline. It\'s there 24/7 to answer questions, help moderate, and keep conversations flowing.',
      icon: ShieldCheckIcon,
    },
    {
      name: 'Free to Try',
      description: 'Start with a free trial to test CordBot in your server. Open source and available for self-hosting if you prefer.',
      icon: CodeBracketIcon,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation
        userPhotoURL={userData.photoURL}
        userDisplayName={userData.displayName}
        onSignOut={onSignOut}
        guilds={guilds}
      />

      <main className="lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8 py-10">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl">
              AI Community Bot for Discord
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Add an AI bot to your Discord server that remembers conversations, answers questions, and helps you manage your community—all with one click.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4">
              {userData.hostingBetaApproved ? (
                <div className="flex items-center gap-x-6">
                  <button
                    onClick={handleAddToDiscord}
                    className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    Add to Discord Server
                  </button>
                  <a
                    href="/docs"
                    className="text-base font-semibold leading-7 text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    Learn more <span aria-hidden="true">→</span>
                  </a>
                </div>
              ) : (
                <div className="max-w-2xl">
                  <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-6 border border-yellow-200 dark:border-yellow-800">
                    <div className="flex items-start gap-3">
                      <svg className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                          Beta Access Required
                        </h3>
                        <p className="text-sm text-yellow-700 dark:text-yellow-400">
                          CordBot is currently in private beta. Request access to start adding bots to your Discord servers.
                        </p>
                        <div className="mt-4 flex gap-4">
                          <a
                            href="/docs"
                            className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-200"
                          >
                            Learn more →
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Features Grid */}
          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <div
                  key={feature.name}
                  className="relative bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-x-3 mb-4">
                    <feature.icon
                      className="h-6 w-6 text-indigo-600 dark:text-indigo-400"
                      aria-hidden="true"
                    />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      {feature.name}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
