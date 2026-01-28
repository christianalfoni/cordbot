import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
}

interface GuildSelectorProps {
  onGuildSelected: (guildId: string, guildName: string, guildIcon?: string) => Promise<void>;
}

export function GuildSelector({ onGuildSelected }: GuildSelectorProps) {
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    fetchGuilds();
  }, []);

  const fetchGuilds = async () => {
    try {
      setLoading(true);
      setError(null);

      // Call Firebase Function to fetch guilds
      const functions = getFunctions();
      const getDiscordGuilds = httpsCallable(functions, 'getDiscordGuilds');

      const result = await getDiscordGuilds();
      const data = result.data as { guilds: DiscordGuild[] };

      setGuilds(data.guilds);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching guilds:', err);

      // Silently fail and show manual entry
      // Automatic fetching requires additional Discord OAuth setup
      setError(null); // Don't show error, just use manual entry
      setGuilds([]);
      setLoading(false);
    }
  };

  const handleSelectGuild = async (guild: DiscordGuild) => {
    try {
      setSelecting(true);
      const iconUrl = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
        : undefined;
      await onGuildSelected(guild.id, guild.name, iconUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save guild');
    } finally {
      setSelecting(false);
    }
  };

  const [manualGuildId, setManualGuildId] = useState('');
  const [manualGuildName, setManualGuildName] = useState('');

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualGuildId.trim() || !manualGuildName.trim()) return;

    try {
      setSelecting(true);
      await onGuildSelected(manualGuildId.trim(), manualGuildName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save guild');
    } finally {
      setSelecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Select Discord Server</h1>
          <p className="text-gray-600">
            Enter your Discord server details to connect Cordbot
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 text-sm">{error}</p>
          </div>
        )}

        {!loading && guilds.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Your Servers</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {guilds.map((guild) => (
                <button
                  key={guild.id}
                  onClick={() => handleSelectGuild(guild)}
                  disabled={selecting}
                  className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {guild.icon ? (
                    <img
                      src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                      alt={guild.name}
                      className="w-12 h-12 rounded-lg"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">#</span>
                    </div>
                  )}
                  <div className="flex-1 text-left">
                    <h3 className="font-semibold text-gray-900">{guild.name}</h3>
                    <p className="text-sm text-gray-500">ID: {guild.id}</p>
                  </div>
                  {guild.owner && (
                    <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
                      Owner
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-4">Or enter server details manually:</p>
            </div>
          </div>
        )}

        {!loading && (
          <div>
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label htmlFor="guildId" className="block text-sm font-medium text-gray-700 mb-1">
                  Guild ID
                </label>
                <input
                  type="text"
                  id="guildId"
                  value={manualGuildId}
                  onChange={(e) => setManualGuildId(e.target.value)}
                  placeholder="123456789012345678"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="guildName" className="block text-sm font-medium text-gray-700 mb-1">
                  Server Name
                </label>
                <input
                  type="text"
                  id="guildName"
                  value={manualGuildName}
                  onChange={(e) => setManualGuildName(e.target.value)}
                  placeholder="My Discord Server"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={selecting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {selecting ? 'Saving...' : 'Continue'}
              </button>
            </form>
            <p className="text-xs text-gray-500 mt-4">
              💡 Tip: Right-click your server in Discord, then click "Copy Server ID" (requires Developer Mode enabled)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
