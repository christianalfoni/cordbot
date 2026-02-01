import { UserData } from '../hooks/useAuth';
import { Navigation } from '../components/Navigation';
import { useHostedBots } from '../hooks/useHostedBots';
import { useState } from 'react';
import { CreateBotModal } from '../components/CreateBotModal';
import { SparklesIcon, BoltIcon, ShieldCheckIcon, CodeBracketIcon, UserIcon, UsersIcon, PuzzlePieceIcon } from '@heroicons/react/24/outline';

interface HomeProps {
  userData: UserData;
  onSignOut: () => void;
}

export function Home({ userData, onSignOut }: HomeProps) {
  const { bots } = useHostedBots(userData.id);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const features = [
    {
      name: 'AI-Powered Conversations',
      description: 'Leverage Claude\'s advanced AI capabilities to create intelligent, context-aware Discord bots that understand and respond naturally.',
      icon: SparklesIcon,
    },
    {
      name: 'Lightning Fast Setup',
      description: 'Get your bot running in minutes. No complex configuration or server management required.',
      icon: BoltIcon,
    },
    {
      name: 'Secure & Reliable',
      description: 'Built with security in mind. Your bot credentials and data are encrypted and protected.',
      icon: ShieldCheckIcon,
    },
    {
      name: 'Open Source & Free',
      description: 'Fully open source for those who want to host their own bot. Self-hosting is completely free.',
      icon: CodeBracketIcon,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation
        userPhotoURL={userData.photoURL}
        userDisplayName={userData.displayName}
        onSignOut={onSignOut}
        bots={bots}
        onCreateBot={() => setShowCreateModal(true)}
      />

      <main className="lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8 py-10">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl">
              Deploy Intelligent Discord Bots
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Deploy powerful AI-powered Discord bots using Claude. Perfect for communities, support channels, or just having fun.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <button
                onClick={() => setShowCreateModal(true)}
                className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Create Your First Bot
              </button>
              <a
                href="/docs"
                className="text-base font-semibold leading-7 text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                Learn more <span aria-hidden="true">→</span>
              </a>
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

          {/* Bot Modes Section */}
          <div className="mt-20 mx-auto max-w-7xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                Choose Your Bot Mode
              </h2>
              <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
                Create bots tailored to your needs
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Personal Bot */}
              <div className="relative bg-white dark:bg-gray-800 p-8 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-x-3 mb-4">
                  <UserIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Personal Bot
                  </h3>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Your private AI assistant that only responds to you. Perfect for personal productivity, note-taking, and private conversations.
                </p>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-x-2">
                    <span className="text-blue-600 dark:text-blue-400">•</span>
                    <span>Responds only to your messages</span>
                  </li>
                  <li className="flex items-start gap-x-2">
                    <span className="text-blue-600 dark:text-blue-400">•</span>
                    <span>Private conversation history</span>
                  </li>
                  <li className="flex items-start gap-x-2">
                    <span className="text-blue-600 dark:text-blue-400">•</span>
                    <span>Ideal for personal servers</span>
                  </li>
                </ul>
              </div>

              {/* Shared Bot */}
              <div className="relative bg-white dark:bg-gray-800 p-8 rounded-lg border-2 border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-x-3 mb-4">
                  <UsersIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" aria-hidden="true" />
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Shared Bot
                  </h3>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  A community assistant available to everyone in your server. Great for support, moderation, and engaging with your community.
                </p>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-x-2">
                    <span className="text-purple-600 dark:text-purple-400">•</span>
                    <span>Responds to all server members</span>
                  </li>
                  <li className="flex items-start gap-x-2">
                    <span className="text-purple-600 dark:text-purple-400">•</span>
                    <span>Shared conversation context</span>
                  </li>
                  <li className="flex items-start gap-x-2">
                    <span className="text-purple-600 dark:text-purple-400">•</span>
                    <span>Perfect for communities</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Integrations Section */}
          <div className="mt-20 mx-auto max-w-7xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                Powerful Integrations
              </h2>
              <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
                Connect your bot to external services for enhanced capabilities
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-x-3 mb-6">
                <PuzzlePieceIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Available Integrations
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Gmail</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Send and read emails directly from Discord
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Google Calendar</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manage events and schedule meetings
                  </p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">More Coming Soon</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    We're constantly adding new integrations
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showCreateModal && (
        <CreateBotModal
          onClose={() => setShowCreateModal(false)}
          userId={userData.id}
        />
      )}
    </div>
  );
}
