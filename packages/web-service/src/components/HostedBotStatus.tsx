import { useState, useEffect } from 'react';
import { UserData } from '../hooks/useAuth';
import { useHostedBot } from '../hooks/useHostedBot';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface HostedBotStatusProps {
  userData: UserData;
}

export function HostedBotStatus({ userData }: HostedBotStatusProps) {
  const { hostedBot, getStatus, isLoading } = useHostedBot(userData);
  const [status, setStatus] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = async () => {
    try {
      const result = await getStatus();
      setStatus(result);
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  };

  useEffect(() => {
    if (hostedBot) {
      fetchStatus();
    }
  }, [hostedBot]);

  useEffect(() => {
    if (!autoRefresh || !hostedBot) return;

    const interval = setInterval(() => {
      fetchStatus();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, hostedBot]);

  if (!hostedBot) return null;

  const getStatusColor = (statusValue: string) => {
    switch (statusValue) {
      case 'running':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'stopped':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
      case 'provisioning':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getStatusLabel = (statusValue: string) => {
    switch (statusValue) {
      case 'running':
        return 'Running';
      case 'stopped':
        return 'Stopped';
      case 'provisioning':
        return 'Starting...';
      case 'pending':
        return 'Pending';
      case 'error':
        return 'Error';
      default:
        return statusValue;
    }
  };

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Bot Status</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchStatus}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
              status?.status || hostedBot.status
            )}`}
          >
            {getStatusLabel(status?.status || hostedBot.status)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">App Name</span>
          <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
            {hostedBot.appName}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Region</span>
          <span className="text-sm text-gray-600 dark:text-gray-400">{hostedBot.region}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Version</span>
          <span className="text-sm text-gray-600 dark:text-gray-400">{hostedBot.version}</span>
        </div>

        {hostedBot.provisionedAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Provisioned</span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {new Date(hostedBot.provisionedAt).toLocaleDateString()}
            </span>
          </div>
        )}

        {hostedBot.lastRestartedAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Restart</span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {new Date(hostedBot.lastRestartedAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {status?.events && status.events.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Recent Events</h4>
          <div className="space-y-2">
            {status.events.map((event: any, index: number) => (
              <div
                key={index}
                className="flex items-start gap-3 text-xs text-gray-600 dark:text-gray-400"
              >
                <span className="font-mono">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className="flex-1">
                  {event.type}: {event.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hostedBot.errorMessage && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-300">{hostedBot.errorMessage}</p>
        </div>
      )}
    </div>
  );
}
