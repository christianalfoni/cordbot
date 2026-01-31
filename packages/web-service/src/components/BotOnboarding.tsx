import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

interface BotOnboardingProps {
  botId: string;
  botName?: string;
  mode?: "personal" | "shared";
}

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export function BotOnboarding({ botId }: BotOnboardingProps) {
  const [step, setStep] = useState<"token" | "detecting" | "provisioning">(
    "token"
  );
  const [botToken, setBotToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bot info
  const [, setBotClientId] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [, setBotAvatar] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");

  // Server detection
  const [, setGuilds] = useState<Guild[]>([]);

  const handleValidateToken = async () => {
    if (!botToken.trim()) {
      setError("Bot token is required");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const validateBotToken = httpsCallable(functions, "validateBotToken");
      const result: any = await validateBotToken({ botToken: botToken.trim() });

      if (!result.data.valid) {
        setError(result.data.error || "Invalid bot token");
        setIsValidating(false);
        return;
      }

      // Save bot info
      const clientId = result.data.bot.id;
      setBotClientId(clientId);
      setBotUsername(result.data.bot.username);
      setBotAvatar(result.data.bot.avatar);

      // Generate invite URL (for later use if needed)
      const permissions = "277025508352";
      const invite = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot`;
      setInviteUrl(invite);

      // Check if bot is in any servers
      const fetchedGuilds = result.data.guilds || [];
      setGuilds(fetchedGuilds);

      // If bot found in server, automatically finalize onboarding
      if (fetchedGuilds.length > 0) {
        const guild = fetchedGuilds[0];
        await finalizeOnboarding(
          guild.id,
          guild.name,
          guild.icon,
          result.data.bot.id,
          result.data.bot.username,
          result.data.bot.avatar
        );
      } else {
        // Move to detection step to show invite button
        setStep("detecting");
      }
    } catch (err: any) {
      setError(err.message || "Failed to validate bot token");
    } finally {
      setIsValidating(false);
    }
  };

  const finalizeOnboarding = async (
    guildId: string,
    guildName: string,
    guildIcon: string | null,
    botUserId: string,
    username: string,
    avatar: string | null
  ) => {
    try {
      // Update bot document with Discord credentials
      const updateBotDoc = httpsCallable(functions, "updateBotDiscordConfig");
      await updateBotDoc({
        botId,
        discordBotToken: botToken.trim(),
        discordGuildId: guildId,
        discordGuildName: guildName,
        discordGuildIcon: guildIcon,
        discordBotUserId: botUserId,
        botDiscordUsername: username,
        botDiscordAvatar: avatar,
      });

      // Bot document updated, the real-time listener will update the UI
      // Status should change from 'unconfigured' to 'configured' or similar
    } catch (err: any) {
      setError(err.message || "Failed to save bot configuration");
      setStep("detecting");
    }
  };

  const handleRefreshServers = async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const validateBotToken = httpsCallable(functions, "validateBotToken");
      const result: any = await validateBotToken({ botToken: botToken.trim() });

      if (!result.data.valid) {
        setError("Bot token is invalid");
        setIsRefreshing(false);
        return;
      }

      const fetchedGuilds = result.data.guilds || [];
      setGuilds(fetchedGuilds);

      if (fetchedGuilds.length === 0) {
        setError(
          "Bot not found in any servers yet. Use the button above to add it to a server."
        );
      } else {
        // Found server - automatically finalize onboarding
        const guild = fetchedGuilds[0];
        await finalizeOnboarding(
          guild.id,
          guild.name,
          guild.icon,
          result.data.bot.id,
          result.data.bot.username,
          result.data.bot.avatar
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to refresh servers");
    } finally {
      setIsRefreshing(false);
    }
  };

  if (step === "token") {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Step 1: Discord Bot Token
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Enter your Discord bot token to get started. Don't have a bot yet?{" "}
          <a
            href="https://discord.com/developers/applications"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Create one here
          </a>
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="bot-token"
              className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
            >
              Discord Bot Token
            </label>
            <input
              id="bot-token"
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="MTk4NjIyN..."
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
              disabled={isValidating}
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Find this in the Discord Developer Portal under Bot → Token
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <button
            onClick={handleValidateToken}
            disabled={isValidating || !botToken.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {isValidating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Validating...
              </>
            ) : (
              "Continue"
            )}
          </button>
        </div>
      </div>
    );
  }

  if (step === "detecting") {
    // Bot NOT found in any servers - show invite button
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Step 2: Add Bot to Server
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Bot <span className="font-medium">@{botUsername}</span> is not in any
          Discord servers yet. Add it to a server to continue.
        </p>

        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
              The invitation will grant these permissions:
            </h4>
            <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-300">
              <li>• Send Messages</li>
              <li>• Read Message History</li>
              <li>• View Channels</li>
              <li>• Create Public Threads</li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep("token")}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ← Back
            </button>
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Add to Discord Server
            </a>
            <button
              onClick={handleRefreshServers}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRefreshing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 dark:border-gray-300"></div>
                  Checking...
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
