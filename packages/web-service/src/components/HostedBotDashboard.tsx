import { useState } from 'react';
import { UserData } from '../hooks/useAuth';
import { useHostedBot } from '../hooks/useHostedBot';
import { HostedBotStatus } from './HostedBotStatus';
import { HostedBotActions } from './HostedBotActions';

interface HostedBotDashboardProps {
  userData: UserData;
}

const REGIONS = [
  { value: 'iad', label: 'Virginia (US East)' },
  { value: 'ord', label: 'Chicago (US Central)' },
  { value: 'sjc', label: 'San Jose (US West)', default: true },
  { value: 'lhr', label: 'London (Europe)' },
  { value: 'nrt', label: 'Tokyo (Asia)' },
  { value: 'syd', label: 'Sydney (Australia)' },
];

export function HostedBotDashboard({ userData }: HostedBotDashboardProps) {
  const { hasHostedBot, provisionBot, isLoading, error } = useHostedBot(userData);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [region, setRegion] = useState('sjc');
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionError(null);

    if (!anthropicApiKey.trim()) {
      setProvisionError('Anthropic API key is required');
      return;
    }

    if (!userData.botToken) {
      setProvisionError('Please configure your Discord bot token in Bot Setup first');
      return;
    }

    setIsProvisioning(true);
    try {
      await provisionBot(anthropicApiKey, region);
      setAnthropicApiKey(''); // Clear the API key from state
    } catch (err: any) {
      setProvisionError(err.message || 'Failed to provision hosted bot');
    } finally {
      setIsProvisioning(false);
    }
  };

  if (hasHostedBot) {
    return (
      <div className="space-y-6">
        <HostedBotStatus userData={userData} />
        <HostedBotActions userData={userData} />
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
        Create Hosted Bot
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Deploy your Cordbot to the cloud. Your bot will run 24/7 with automatic restarts and
        persistent storage.
      </p>

      {!userData.botToken && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            Please configure your Discord bot token in the Bot Setup section before creating a
            hosted bot.
          </p>
        </div>
      )}

      <form onSubmit={handleProvision} className="space-y-6">
        <div>
          <label
            htmlFor="anthropic-api-key"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Anthropic API Key
          </label>
          <input
            type="password"
            id="anthropic-api-key"
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            placeholder="sk-ant-..."
            disabled={isLoading || isProvisioning || !userData.botToken}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Your API key will be securely stored in the hosted environment and never saved to our
            database.
          </p>
        </div>

        <div>
          <label
            htmlFor="region"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Region
          </label>
          <select
            id="region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={isLoading || isProvisioning || !userData.botToken}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Choose a region close to your location for best performance.
          </p>
        </div>

        {(provisionError || error) && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-800 dark:text-red-300">{provisionError || error}</p>
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={isLoading || isProvisioning || !userData.botToken || !anthropicApiKey.trim()}
            className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            {isProvisioning ? 'Creating Hosted Bot...' : 'Create Hosted Bot'}
          </button>
        </div>
      </form>

      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">What's Included</h4>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-indigo-600 dark:text-indigo-400">•</span>
            <span>1 GB RAM, 1 shared CPU</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-600 dark:text-indigo-400">•</span>
            <span>1 GB persistent storage</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-600 dark:text-indigo-400">•</span>
            <span>Automatic restarts on failure</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-600 dark:text-indigo-400">•</span>
            <span>Updates when you modify tool configuration</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
