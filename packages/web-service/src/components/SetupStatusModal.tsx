import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';

interface SetupStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

type GuildStatus = 'pending' | 'provisioning' | 'active' | 'error';

interface GuildData {
  guildName: string;
  guildIcon: string | null;
  status: GuildStatus;
  errorMessage?: string;
  createdAt: string;
}

export function SetupStatusModal({ isOpen, onClose, userId }: SetupStatusModalProps) {
  const [status, setStatus] = useState<GuildStatus | 'waiting'>('waiting');
  const [guildInfo, setGuildInfo] = useState<GuildData | null>(null);
  const [guildId, setGuildId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Listen for the most recently created guild (within last 2 minutes)
    // This is a simple approach that works well for single-user testing
    // TODO: In production, filter by Firebase Auth UID or Discord user ID
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const guildsRef = collection(db, 'guilds');
    const q = query(
      guildsRef,
      where('createdAt', '>', twoMinutesAgo),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data() as GuildData;
        setGuildId(doc.id);
        setGuildInfo(data);
        setStatus(data.status);

        // Auto-close after 3 seconds when active
        if (data.status === 'active') {
          setTimeout(() => {
            onClose();
            // Optionally navigate to guild page
            window.location.href = `/guilds/${doc.id}`;
          }, 3000);
        }
      }
    });

    return () => unsubscribe();
  }, [isOpen, userId, onClose]);

  if (!isOpen) return null;

  // Waiting for OAuth authorization
  if (status === 'waiting') {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Waiting for Authorization
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Complete the Discord authorization in the new tab, then we'll set up your bot automatically.
            </p>
            <button
              onClick={onClose}
              className="mt-6 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Setup Failed
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {guildInfo?.errorMessage || 'Something went wrong during setup.'}
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pending or Provisioning state
  if (status === 'pending' || status === 'provisioning') {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Setting up CordBot...
            </h2>
            {guildInfo && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                {guildInfo.guildIcon && guildId && (
                  <img
                    src={`https://cdn.discordapp.com/icons/${guildId}/${guildInfo.guildIcon}.png?size=48`}
                    alt={guildInfo.guildName}
                    className="w-12 h-12 rounded-full mx-auto mb-2"
                  />
                )}
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {guildInfo.guildName}
                </p>
              </div>
            )}
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              This will take about 30 seconds
            </p>

            <div className="mt-6 space-y-2 text-left">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Connected to Discord</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                {status === 'provisioning' ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                    <span>Creating bot instance...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
                    </svg>
                    <span>Preparing resources...</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-600">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
                <span>Deploying to server...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active state - show success briefly before closing
  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20">
            <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            CordBot is Ready! 🎉
          </h2>

          {guildInfo && guildId && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              {guildInfo.guildIcon && (
                <img
                  src={`https://cdn.discordapp.com/icons/${guildId}/${guildInfo.guildIcon}.png?size=64`}
                  alt={guildInfo.guildName}
                  className="w-16 h-16 rounded-full mx-auto mb-3"
                />
              )}
              <h3 className="font-medium text-gray-900 dark:text-white">
                {guildInfo.guildName}
              </h3>
            </div>
          )}

          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Your bot is now active! Head to Discord and try mentioning @CordBot.
          </p>

          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            Redirecting...
          </p>
        </div>
      </div>
    </div>
  );
}
