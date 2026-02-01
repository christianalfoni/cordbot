import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserData } from '../hooks/useAuth';
import { useHostedBots } from '../hooks/useHostedBots';
import { CreateBotModal } from '../components/CreateBotModal';
import { Navigation } from '../components/Navigation';
import chatBotLogo from '../chat-bot-logo.svg';

interface BotsListProps {
  userData: UserData;
  onSignOut: () => void;
}

export function BotsList({ userData, onSignOut }: BotsListProps) {
  const { bots, isListening, canCreateMore } = useHostedBots(userData.id);
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation
        userPhotoURL={userData.photoURL}
        userDisplayName={userData.displayName}
        onSignOut={onSignOut}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                Your Bots
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {bots.length === 0
                  ? 'Create your first bot to get started'
                  : `Managing ${bots.length} bot${bots.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={!canCreateMore}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add New Bot
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isListening && bots.length === 0 && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Loading bots...</p>
          </div>
        )}

        {/* Empty State */}
        {!isListening && bots.length === 0 && (
          <div className="text-center py-16">
            <img src={chatBotLogo} alt="Cordbot" className="h-24 w-24 mx-auto mb-6 opacity-50" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No bots yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Create your first Discord bot powered by Claude. Each bot can be configured for personal or shared server use.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Bot
            </button>
          </div>
        )}

        {/* Bots Grid */}
        {bots.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bots.map((bot) => (
              <Link
                key={bot.id}
                to={`/bot/${bot.id}`}
                className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {bot.botName}
                    </h3>
                    {bot.botDiscordUsername && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        @{bot.botDiscordUsername}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      bot.mode === 'personal'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                    }`}
                  >
                    {bot.mode === 'personal' ? '👤 Personal' : '👥 Shared'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  {bot.status === 'running' && (
                    <>
                      <span className="flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <span className="text-green-600 dark:text-green-400 font-medium">Running</span>
                    </>
                  )}
                  {bot.status === 'provisioning' && (
                    <>
                      <span className="flex h-2 w-2 rounded-full bg-yellow-500"></span>
                      <span className="text-yellow-600 dark:text-yellow-400 font-medium">Provisioning</span>
                    </>
                  )}
                  {bot.status === 'stopped' && (
                    <>
                      <span className="flex h-2 w-2 rounded-full bg-gray-400"></span>
                      <span className="text-gray-600 dark:text-gray-400 font-medium">Stopped</span>
                    </>
                  )}
                  {bot.status === 'error' && (
                    <>
                      <span className="flex h-2 w-2 rounded-full bg-red-500"></span>
                      <span className="text-red-600 dark:text-red-400 font-medium">Error</span>
                    </>
                  )}
                  {bot.status === 'unconfigured' && (
                    <>
                      <span className="flex h-2 w-2 rounded-full bg-gray-400"></span>
                      <span className="text-gray-600 dark:text-gray-400 font-medium">Needs Setup</span>
                    </>
                  )}
                </div>

                {bot.region && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Region: {bot.region}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* Limit Warning */}
        {!canCreateMore && (
          <div className="mt-8 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You've reached the maximum of 10 bots. Delete a bot to create a new one.
            </p>
          </div>
        )}
      </div>

      {/* Create Bot Modal */}
      {showCreateModal && (
        <CreateBotModal
          onClose={() => setShowCreateModal(false)}
          userId={userData.id}
        />
      )}
    </div>
  );
}
