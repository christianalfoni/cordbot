import { useState } from 'react';
import { useUserBot } from '../hooks/useUserBot';

interface BotSetupProps {
  userId: string;
  initialToken?: string;
  initialGuildId?: string;
}

export function BotSetup({ userId, initialToken, initialGuildId }: BotSetupProps) {
  const { token, validating, validationResult, saveToken, saveGuildSelection, clearToken } = useUserBot(userId, initialToken);
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(!initialToken);
  const [selectedGuild, setSelectedGuild] = useState<string | undefined>(initialGuildId);
  const [copied, setCopied] = useState(false);
  const [commandCopied, setCommandCopied] = useState(false);

  const handleSubmitToken = async () => {
    if (!tokenInput.trim()) return;

    const success = await saveToken(tokenInput.trim());
    if (success) {
      setShowTokenInput(false);
    }
  };

  const handleSelectGuild = async (guildId: string) => {
    const success = await saveGuildSelection(guildId);
    if (success) {
      setSelectedGuild(guildId);
    }
  };

  const handleCopyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('curl -fsSL https://cordbot.io/install.sh | bash');
    setCommandCopied(true);
    setTimeout(() => setCommandCopied(false), 2000);
  };

  const handleResetBot = async () => {
    if (confirm('Are you sure you want to remove your bot configuration? You will need to set it up again.')) {
      const success = await clearToken();
      if (success) {
        setShowTokenInput(true);
        setSelectedGuild(undefined);
        setTokenInput('');
      }
    }
  };

  const getBotInviteUrl = () => {
    if (!validationResult?.bot) return '';

    const params = new URLSearchParams({
      client_id: validationResult.bot.id,
      permissions: '309237763136', // Same permissions as before
      scope: 'bot applications.commands',
    });

    if (selectedGuild) {
      params.set('guild_id', selectedGuild);
      params.set('disable_guild_select', 'true');
    }

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  };

  // No token configured yet
  if (!token || showTokenInput) {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Discord Bot Required
              </h3>
              <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                <p>Cordbot requires you to create your own Discord bot. This gives you full control and avoids rate limits.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          <div className="p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Setup Instructions</h3>
            <ol className="space-y-4">
              <li className="flex gap-4">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                  1
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Create a Discord Application</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Go to the Discord Developer Portal and create a new application.
                  </p>
                  <a
                    href="https://discord.com/developers/applications"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    Open Developer Portal
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                  2
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Add a Bot</p>
                  <ul className="mt-1 text-sm text-gray-500 dark:text-gray-400 space-y-1">
                    <li>• Go to the "Bot" tab and click "Add Bot"</li>
                    <li>• Give your bot a name</li>
                    <li>• Disable "Public Bot" to keep it private</li>
                  </ul>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                  3
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Copy Bot Token</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Click "Reset Token", copy it, and paste below.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <div className="p-6">
            <label htmlFor="bot-token" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Bot Token
            </label>
            <input
              id="bot-token"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste your bot token here..."
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitToken()}
            />
            {validationResult && !validationResult.valid && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{validationResult.error}</p>
            )}
            <button
              onClick={handleSubmitToken}
              disabled={!tokenInput.trim() || validating}
              className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {validating ? 'Validating...' : 'Save Bot Token'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Token is being validated
  if (validating) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
        <p className="text-sm text-gray-600 dark:text-gray-400">Validating your bot token...</p>
      </div>
    );
  }

  // Token validation failed
  if (validationResult && !validationResult.valid) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 p-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Bot Token Invalid</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">{validationResult.error}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <button
            onClick={() => setShowTokenInput(true)}
            className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Update Token
          </button>
        </div>
      </div>
    );
  }

  // Bot is valid but not in any guilds
  if (validationResult && validationResult.guilds && validationResult.guilds.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Bot Not in a Server
              </h3>
              <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                <p>Your bot <strong>{validationResult.bot?.username}</strong> needs to be added to a Discord server.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Invite Bot to Server</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Click the button below to invite your bot to a Discord server you own or have permission to manage.
          </p>
          <a
            href={getBotInviteUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Invite Bot to Server
          </a>
        </div>
      </div>
    );
  }

  // Bot is in multiple guilds - need to select one
  if (validationResult && validationResult.guilds && validationResult.guilds.length > 1 && !selectedGuild) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Select a Server</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Your bot is in {validationResult.guilds.length} servers. Select which one to use with Cordbot.
          </p>
          <ul role="list" className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {validationResult.guilds.map((guild) => (
              <li key={guild.id}>
                <button
                  onClick={() => handleSelectGuild(guild.id)}
                  className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                >
                  {guild.icon ? (
                    <img
                      src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                      alt={guild.name}
                      className="h-10 w-10 rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xl text-gray-500 dark:text-gray-400">#</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{guild.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">ID: {guild.id}</p>
                  </div>
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Bot is configured and ready!
  const selectedGuildInfo = validationResult?.guilds?.find(g => g.id === selectedGuild);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
        {selectedGuildInfo && (
          <div className="p-6">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Connected Server</h4>
            <div className="flex items-center gap-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 p-4">
              {selectedGuildInfo.icon ? (
                <img
                  src={`https://cdn.discordapp.com/icons/${selectedGuildInfo.id}/${selectedGuildInfo.icon}.png`}
                  alt={selectedGuildInfo.name}
                  className="h-12 w-12 rounded-lg flex-shrink-0"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl text-gray-500 dark:text-gray-400">#</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedGuildInfo.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">ID: {selectedGuildInfo.id}</p>
              </div>
            </div>
          </div>
        )}

        <div className="p-6">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Start Using Cordbot</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Your bot is ready! Run the command below to install and start the agent:
          </p>
          <div className="relative bg-gray-900 dark:bg-gray-950 rounded-lg p-4 mb-4 group">
            <code className="text-sm text-green-400 font-mono pr-20">curl -fsSL https://cordbot.io/install.sh | bash</code>
            <button
              onClick={handleCopyCommand}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-md bg-gray-800 dark:bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 dark:hover:bg-gray-800 transition-colors"
            >
              {commandCopied ? (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            This will install the Cordbot agent. After installation, run <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">cordbot</code> to start. The agent will automatically authenticate with your bot configuration.
          </p>
          <button
            onClick={handleCopyToken}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            {copied ? (
              <>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy Token (Manual Setup)</span>
              </>
            )}
          </button>
        </div>

        <div className="p-6 bg-gray-50 dark:bg-gray-900/50">
          <button
            onClick={handleResetBot}
            className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
          >
            Reset Bot Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
