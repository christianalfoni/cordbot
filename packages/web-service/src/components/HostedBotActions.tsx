import { useState } from 'react';
import { UserData } from '../hooks/useAuth';
import { useHostedBots } from '../hooks/useHostedBots';
import { ArrowPathIcon, TrashIcon, RocketLaunchIcon } from '@heroicons/react/24/outline';

interface HostedBotActionsProps {
  userData: UserData;
  botId: string;
}

export function HostedBotActions({ userData, botId }: HostedBotActionsProps) {
  const { restartBot, redeployBot, deprovisionBot, isLoading, error } = useHostedBots(userData.id);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRedeployConfirm, setShowRedeployConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleRestart = async () => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await restartBot(botId);
      setActionSuccess('Bot is restarting...');
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to restart bot');
    }
  };

  const handleRedeploy = async () => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await redeployBot(botId);
      setShowRedeployConfirm(false);
      setActionSuccess('Bot is redeploying with latest image...');
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      setActionError(err.message || 'Failed to redeploy bot');
      setShowRedeployConfirm(false);
    }
  };

  const handleDelete = async () => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await deprovisionBot(botId);
      setShowDeleteConfirm(false);
      setActionSuccess('Hosted bot deleted successfully');
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete hosted bot');
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Actions</h3>

      {actionSuccess && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <p className="text-sm text-green-800 dark:text-green-300">{actionSuccess}</p>
        </div>
      )}

      {(actionError || error) && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-300">{actionError || error}</p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <button
            onClick={handleRestart}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Restart Bot
          </button>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Restart the bot to apply configuration changes
          </p>
        </div>

        {!showRedeployConfirm ? (
          <div>
            <button
              onClick={() => setShowRedeployConfirm(true)}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-indigo-300 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-indigo-400 dark:border-indigo-800 dark:hover:bg-indigo-900/20"
            >
              <RocketLaunchIcon className="h-4 w-4" />
              Redeploy Bot
            </button>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Deploy latest Docker image (deletes and recreates machine)
            </p>
          </div>
        ) : (
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-md">
            <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100 mb-3">
              Redeploy your hosted bot?
            </p>
            <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-4">
              This will delete the current machine and create a new one with the latest Docker image. Your persistent data will be preserved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRedeploy}
                disabled={isLoading}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isLoading ? 'Redeploying...' : 'Yes, Redeploy'}
              </button>
              <button
                onClick={() => setShowRedeployConfirm(false)}
                disabled={isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!showDeleteConfirm ? (
          <div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:bg-gray-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
            >
              <TrashIcon className="h-4 w-4" />
              Delete Hosted Bot
            </button>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Permanently delete your hosted bot and all data
            </p>
          </div>
        ) : (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-3">
              Are you sure you want to delete your hosted bot?
            </p>
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">
              This will permanently delete your hosted bot, including all stored data. This action
              cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {isLoading ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
