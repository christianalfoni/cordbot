import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

type GuildStatus = 'pending' | 'provisioning' | 'active' | 'error';

interface GuildData {
  guildName: string;
  guildIcon: string | null;
  status: GuildStatus;
  errorMessage?: string;
  appName?: string;
  machineId?: string;
}

export function OAuthSuccess() {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<GuildStatus>('pending');
  const [guildInfo, setGuildInfo] = useState<GuildData | null>(null);
  const [provisioningStarted, setProvisioningStarted] = useState(false);

  useEffect(() => {
    if (!guildId) {
      navigate('/');
      return;
    }

    // Listen to guild document for status updates
    const unsubscribe = onSnapshot(
      doc(db, 'guilds', guildId),
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data() as GuildData;
          setGuildInfo(data);
          setStatus(data.status);

          // If status is still pending and we haven't started provisioning yet, trigger it
          if (data.status === 'pending' && !provisioningStarted) {
            setProvisioningStarted(true);
            try {
              // Call provisionGuild function
              // Note: This requires the shared tokens to be passed from backend
              // In reality, the backend OAuth handler should trigger this automatically
              // For now, we'll show the provisioning status
              console.log('Guild is pending, waiting for provisioning...');
            } catch (error) {
              console.error('Failed to start provisioning:', error);
            }
          }
        } else {
          // Guild document doesn't exist yet
          console.log('Guild document not found, redirecting...');
          setTimeout(() => navigate('/'), 3000);
        }
      },
      (error) => {
        console.error('Error listening to guild document:', error);
      }
    );

    return () => unsubscribe();
  }, [guildId, navigate, provisioningStarted]);

  if (!guildInfo) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
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
              {guildInfo.errorMessage || 'Something went wrong during setup.'}
            </p>
            <div className="mt-6 space-y-2">
              <button
                onClick={() => navigate('/')}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Go Home
              </button>
              <a
                href="https://github.com/christianalfoni/cordbot/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                Report Issue →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'pending' || status === 'provisioning') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Setting up CordBot...
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
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
                    <span>Waiting to provision...</span>
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

  // Active status
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20">
            <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            CordBot Added Successfully! 🎉
          </h2>

          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
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

          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            CordBot is now active in your server! Head back to Discord and try mentioning @CordBot to start chatting.
          </p>

          <div className="mt-6 space-y-2">
            <button
              onClick={() => navigate(`/guilds/${guildId}`)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Manage CordBot
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
