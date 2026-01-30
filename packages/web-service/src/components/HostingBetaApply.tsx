import { useState } from 'react';
import { UserData } from '../hooks/useAuth';
import { useHostedBot } from '../hooks/useHostedBot';
import { CloudArrowUpIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface HostingBetaApplyProps {
  userData: UserData;
}

export function HostingBetaApply({ userData }: HostingBetaApplyProps) {
  const { hasApplied, applyForBeta, isLoading, error } = useHostedBot(userData);
  const [localApplied, setLocalApplied] = useState(false);

  const handleApply = async () => {
    try {
      await applyForBeta();
      setLocalApplied(true);
    } catch (err) {
      console.error('Error applying for beta:', err);
    }
  };

  const isApplied = hasApplied || localApplied;

  if (isApplied) {
    return (
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-4">
          <CheckCircleIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Beta Access Requested
            </h3>
            <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
              Your application for managed hosting beta access has been received. We'll review your
              request and notify you when your account is approved.
            </p>
            <p className="mt-3 text-sm text-blue-700 dark:text-blue-300">
              Thank you for your interest in Cordbot managed hosting!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 p-8 border border-indigo-200 dark:border-indigo-800">
      <div className="flex items-start gap-6">
        <div className="flex-shrink-0">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-indigo-600 dark:bg-indigo-500">
            <CloudArrowUpIcon className="h-7 w-7 text-white" />
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Managed Cloud Hosting (Beta)
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Run your Cordbot 24/7 in the cloud with zero DevOps. We handle deployment, monitoring,
            and infrastructure so you can focus on using your bot.
          </p>

          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span>Automatic deployment and updates</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span>24/7 uptime with automatic restarts</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span>Persistent storage for bot data</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span>Simple management dashboard</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleApply}
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {isLoading ? 'Submitting...' : 'Apply for Beta Access'}
            </button>
          </div>

          {error && (
            <div className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Beta access is currently limited. By applying, you'll be added to the waitlist. We'll
            notify you via email when your account is approved.
          </p>
        </div>
      </div>
    </div>
  );
}
