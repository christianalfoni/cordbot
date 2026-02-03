import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SetupStatusModal } from '../components/SetupStatusModal';
import { UserData } from '../hooks/useAuth';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

interface DiscordCallbackProps {
  userData: UserData;
}

export function DiscordCallback({ userData }: DiscordCallbackProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const processOAuth = async () => {
      const code = searchParams.get('code');
      const guildId = searchParams.get('guild_id');
      const permissions = searchParams.get('permissions');
      const errorParam = searchParams.get('error');

      // Get the redirect URI (must match what was used in OAuth request)
      const redirectUri = import.meta.env.VITE_DISCORD_REDIRECT_URI ||
        `${window.location.origin}/auth/discord/callback`;

      // Check for OAuth errors
      if (errorParam) {
        setError('Authorization was cancelled or failed');
        setProcessing(false);
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      // Verify we have the required parameters
      if (!code || !guildId) {
        setError('Missing authorization parameters');
        setProcessing(false);
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      try {
        // Call backend Cloud Function to process OAuth securely
        // The client secret stays on the backend - never exposed to client
        // Pass the redirectUri so backend uses the same one for token exchange
        const processDiscordOAuth = httpsCallable(functions, 'processDiscordOAuth');
        const result = await processDiscordOAuth({
          code,
          guildId,
          permissions: permissions || '',
          redirectUri,
        });

        console.log('OAuth processed successfully:', result.data);

        // Show the polling modal to track guild setup
        setProcessing(false);
        setShowModal(true);
      } catch (err: any) {
        console.error('OAuth processing error:', err);
        setError(err.message || 'Failed to process authorization');
        setProcessing(false);
        setTimeout(() => navigate('/'), 3000);
      }
    };

    processOAuth();
  }, [searchParams, navigate]);

  if (processing) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Completing Setup...
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Verifying your Discord server authorization
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Authorization Failed
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {error}
            </p>
            <p className="mt-4 text-xs text-gray-500">
              Redirecting to home...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SetupStatusModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          navigate('/');
        }}
        userId={userData.id}
      />
    </div>
  );
}
