import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { UserData } from '../hooks/useAuth';
import { db, functions } from '../firebase';
import { Bot } from '../hooks/useHostedBots';
import { BotOnboarding } from '../components/BotOnboarding';
import { Navigation } from '../components/Navigation';
import { DeploymentModal } from '../components/DeploymentModal';
import chatBotLogo from '../chat-bot-logo.svg';

interface BotPageProps {
  userData: UserData;
  onSignOut: () => void;
}

export function BotPage({ userData, onSignOut }: BotPageProps) {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string>('');

  // Real-time listener for bot document
  useEffect(() => {
    if (!botId || !userData.id) return;

    const botRef = doc(db, 'users', userData.id, 'bots', botId);
    const unsubscribe = onSnapshot(
      botRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setBot({ id: snapshot.id, ...snapshot.data() } as Bot);
        } else {
          setBot(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to bot:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [botId, userData.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading bot...</p>
        </div>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Bot not found</h3>
          <Link to="/" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">
            ← Back to bots list
          </Link>
        </div>
      </div>
    );
  }

  // Special layout for onboarding (unconfigured state)
  if (bot.status === 'unconfigured') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="mb-6 text-center">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to bots
            </Link>
            <div className="flex items-center justify-center gap-3 mb-2">
              <img src={chatBotLogo} alt="Cordbot" className="h-8 w-8" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {bot.botName}
              </h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  bot.mode === 'personal'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                    : 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                }`}
              >
                {bot.mode === 'personal' ? '👤 Personal' : '👥 Shared'}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Complete the setup to get started
            </p>
          </div>
          <BotOnboarding
            botId={bot.id}
            botName={bot.botName}
            mode={bot.mode}
          />
        </div>
      </div>
    );
  }

  // Normal layout for configured bots
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation
        userPhotoURL={userData.photoURL}
        userDisplayName={userData.displayName}
        onSignOut={onSignOut}
      />

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Bot details and hosting controls */}
        {(
          <div className="space-y-8">
            {/* Bot Header - Server and Bot Info Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Discord Server */}
              <div className="flex items-start gap-4">
                {bot.discordGuildIcon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${bot.discordGuildId}/${bot.discordGuildIcon}.png?size=128`}
                    alt={bot.discordGuildName || 'Server'}
                    className="w-16 h-16 rounded-xl flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                      {(bot.discordGuildName || bot.botName).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Discord Server</div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                    {bot.discordGuildName || 'Unknown Server'}
                  </h3>
                </div>
              </div>

              {/* Discord Bot */}
              <div className="flex items-start gap-4">
                {bot.botDiscordAvatar && bot.discordBotUserId ? (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${bot.discordBotUserId}/${bot.botDiscordAvatar}.png?size=128`}
                    alt={bot.botDiscordUsername || 'Bot'}
                    className="w-16 h-16 rounded-xl flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                      {(bot.botDiscordUsername || bot.botName).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Discord Bot</div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                    {bot.botDiscordUsername ? `@${bot.botDiscordUsername}` : bot.botName}
                  </h3>
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium inset-ring mt-1 ${
                    bot.mode === 'personal'
                      ? 'bg-blue-50 text-blue-700 inset-ring-blue-700/10 dark:bg-blue-400/10 dark:text-blue-400 dark:inset-ring-blue-400/30'
                      : 'bg-purple-50 text-purple-700 inset-ring-purple-700/10 dark:bg-purple-400/10 dark:text-purple-400 dark:inset-ring-purple-400/30'
                  }`}>
                    {bot.mode === 'personal' ? 'Personal' : 'Shared'}
                  </span>
                </div>
              </div>
            </div>

            {/* Hosting Section */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                Hosting
              </h3>

              {bot.status === 'configured' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Deploy your bot to Fly.io to make it available 24/7.
                  </p>
                  <button
                    onClick={() => setShowDeploymentModal(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Deploy to Fly.io
                  </button>
                </div>
              )}

              {showDeploymentModal && (
                <DeploymentModal
                  botName={bot.botName}
                  onClose={() => setShowDeploymentModal(false)}
                  onDeploy={async (anthropicApiKey, memoryContextSize, region) => {
                    const createHostedBot = httpsCallable(functions, 'createHostedBot');
                    await createHostedBot({
                      botId: bot.id,
                      discordBotToken: bot.discordBotToken,
                      discordGuildId: bot.discordGuildId,
                      anthropicApiKey,
                      memoryContextSize,
                      region,
                    });
                  }}
                />
              )}

              {(bot.status === 'provisioning' || bot.status === 'running' || bot.status === 'error' || bot.status === 'stopped') && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                      <dt className="text-xs text-gray-500 dark:text-gray-400">Status</dt>
                      <dd className="mt-1">
                        {bot.status === 'provisioning' && (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-700/10 dark:bg-yellow-400/10 dark:text-yellow-400 dark:ring-yellow-400/30">
                            <div className="animate-spin rounded-full h-2.5 w-2.5 border-b border-yellow-700 dark:border-yellow-400"></div>
                            Provisioning
                          </span>
                        )}
                        {bot.status === 'running' && (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-700/10 dark:bg-green-400/10 dark:text-green-400 dark:ring-green-400/30">
                            <span className="flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                            </span>
                            Running
                          </span>
                        )}
                        {bot.status === 'error' && (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-700/10 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/30">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-red-500"></span>
                            Error
                          </span>
                        )}
                        {bot.status === 'stopped' && (
                          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-700/10 dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/30">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-gray-500"></span>
                            Stopped
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                      <dt className="text-xs text-gray-500 dark:text-gray-400">App Name</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white font-mono">{bot.appName}</dd>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                      <dt className="text-xs text-gray-500 dark:text-gray-400">Region</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{bot.region}</dd>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={async () => {
                        if (!confirm('Update the bot to the latest version? This will restart the bot.')) return;

                        try {
                          const deployHostedBot = httpsCallable(functions, 'deployHostedBot');
                          await deployHostedBot({ botId: bot.id, version: 'latest' });
                        } catch (err: any) {
                          alert(err.message || 'Failed to update bot');
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Update
                    </button>

                    <button
                      onClick={async () => {
                        if (!confirm('Restart the bot? This will briefly interrupt service.')) return;

                        try {
                          const restartHostedBot = httpsCallable(functions, 'restartHostedBot');
                          await restartHostedBot({ botId: bot.id });
                        } catch (err: any) {
                          alert(err.message || 'Failed to restart bot');
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Restart
                    </button>

                    <button
                      onClick={async () => {
                        if (!confirm('Are you sure you want to delete this bot? This will permanently remove all bot resources and cannot be undone.')) return;

                        setIsDeleting(true);
                        setDeleteStatus('Stopping machine...');

                        try {
                          const deprovisionHostedBot = httpsCallable(functions, 'deprovisionHostedBot');
                          setDeleteStatus('Deleting Fly.io resources...');
                          await deprovisionHostedBot({ botId: bot.id });
                          setDeleteStatus('Bot successfully deleted');

                          // Wait a moment to show success message, then navigate
                          setTimeout(() => {
                            navigate('/');
                          }, 1500);
                        } catch (err: any) {
                          setDeleteStatus('');
                          setIsDeleting(false);
                          alert(err.message || 'Failed to delete bot');
                        }
                      }}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-gray-700 border border-red-300 dark:border-red-600 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                          Deleting...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </>
                      )}
                    </button>
                  </div>

                  {bot.status === 'error' && bot.errorMessage && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <div className="flex gap-3">
                        <svg className="h-5 w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">Deployment Error</h4>
                          <p className="text-sm text-red-700 dark:text-red-300">{bot.errorMessage}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Delete Progress Modal */}
            {isDeleting && (
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                  <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 dark:border-red-400"></div>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Deleting Bot
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      {deleteStatus}
                    </p>
                    <div className="space-y-2 text-left">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        {deleteStatus.includes('successfully') ? (
                          <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                        )}
                        <span>Fly.io machine stopped</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        {deleteStatus.includes('successfully') ? (
                          <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                        )}
                        <span>Fly.io app deleted</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        {deleteStatus.includes('successfully') ? (
                          <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                        )}
                        <span>Bot configuration removed</span>
                      </div>
                    </div>
                    {deleteStatus.includes('successfully') && (
                      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                        Returning to bots list...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Integrations Section */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                Integrations
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Connect external services to give your bot additional capabilities.
              </p>

              {/* Gmail Integration */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Gmail</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {bot.oauthConnections?.gmail ? 'Connected' : 'Not connected'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (bot.oauthConnections?.gmail) {
                      alert('Gmail already connected');
                    } else {
                      alert('Gmail OAuth flow coming soon');
                    }
                  }}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
                >
                  {bot.oauthConnections?.gmail ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
