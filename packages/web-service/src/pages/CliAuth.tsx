import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { BotSetup } from '../components/BotSetup';

export function CliAuth() {
  const [searchParams] = useSearchParams();
  const { user, userData, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'redirecting' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [callback, setCallback] = useState<string>('');
  const [hasRedirected, setHasRedirected] = useState(false);
  const initialCheckDone = useRef(false);
  const hadBotToken = useRef<boolean | null>(null);

  useEffect(() => {
    const callbackParam = searchParams.get('callback');

    if (!callbackParam) {
      setStatus('error');
      setErrorMessage('Missing callback URL');
      return;
    }

    if (callback !== callbackParam) {
      setCallback(callbackParam);
    }

    // Wait for auth to load - CRITICAL: Don't process until loading is complete
    if (loading) {
      console.log('[CliAuth] Still loading auth...');
      return;
    }

    // If we have a user but no userData yet, wait for userData to load
    if (user && !userData) {
      console.log('[CliAuth] User exists but userData still loading, waiting...');
      return;
    }

    // Prevent multiple redirects
    if (hasRedirected) {
      console.log('[CliAuth] Already redirected, skipping');
      return;
    }

    // Only process once auth is fully loaded
    if (initialCheckDone.current) {
      console.log('[CliAuth] Initial check already done, skipping');
      return;
    }

    console.log('[CliAuth] Performing initial auth check', { user: !!user, userData: !!userData });
    initialCheckDone.current = true;

    // Check if user is authenticated
    if (!user) {
      console.log('[CliAuth] User not authenticated');
      // Store the callback URL for after login
      sessionStorage.setItem('cli_auth_callback', callbackParam);
      setStatus('error');
      setErrorMessage('Please sign in with Discord to continue agent authentication.');
      return;
    }

    console.log('[CliAuth] User authenticated:', user.id);
    console.log('[CliAuth] UserData:', { botToken: !!userData?.botToken, guildId: userData?.guildId });

    // Check if user has bot configured
    const hasBotConfigured = !!(userData?.botToken && userData?.guildId);
    hadBotToken.current = hasBotConfigured;

    console.log('[CliAuth] Bot configured:', hasBotConfigured);

    if (!hasBotConfigured) {
      setStatus('error');
      setErrorMessage('No bot configured. Set up your bot below, then try running the agent again.');

      // Don't redirect - let user set up bot here
      return;
    }

    // Success - redirect to callback with token and guild ID
    console.log('[CliAuth] Redirecting to agent with token');
    setStatus('redirecting');
    setHasRedirected(true);
    const redirectUrl = new URL(callbackParam);
    redirectUrl.searchParams.set('token', userData.botToken!);
    redirectUrl.searchParams.set('guildId', userData.guildId!);
    window.location.href = redirectUrl.toString();
  }, [user, userData, loading, searchParams, navigate, hasRedirected, callback]);

  // Watch for bot configuration completion
  useEffect(() => {
    console.log('[CliAuth] Bot watch effect', {
      hasRedirected,
      callback: !!callback,
      hadBotToken: hadBotToken.current,
      botToken: !!userData?.botToken,
      guildId: !!userData?.guildId
    });

    if (hasRedirected || !callback) {
      console.log('[CliAuth] Skipping bot watch - already redirected or no callback');
      return;
    }

    // Only trigger if we initially didn't have a bot token, but now we do
    const hasBotNow = !!(userData?.botToken && userData?.guildId);

    console.log('[CliAuth] Bot status check', { hadBotToken: hadBotToken.current, hasBotNow });

    if (hadBotToken.current === false && hasBotNow) {
      // Bot just got configured! Redirect to agent
      console.log('[CliAuth] Bot detected! Redirecting to agent');
      setStatus('redirecting');
      setHasRedirected(true);
      const redirectUrl = new URL(callback);
      redirectUrl.searchParams.set('token', userData!.botToken!);
      redirectUrl.searchParams.set('guildId', userData!.guildId!);
      window.location.href = redirectUrl.toString();
    }
  }, [userData?.botToken, userData?.guildId, callback, hasRedirected]);

  if (loading || status === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <span className="text-white font-bold text-3xl">C</span>
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (status === 'redirecting') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <span className="text-white font-bold text-3xl">C</span>
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Redirecting to agent...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    // If not logged in, show redirect message
    if (errorMessage.includes('sign in')) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="max-w-md w-full mx-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
              <div className="mx-auto h-16 w-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-2xl flex items-center justify-center mb-6">
                <span className="text-yellow-600 dark:text-yellow-400 text-3xl">⚠️</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Sign In Required
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {errorMessage}
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-2"></div>
                <p>Redirecting to login...</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // No bot configured - show setup page
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-2xl">C</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Cordbot Setup
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configure your bot to continue with agent authentication
                </p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Bot Configuration Required
                  </h3>
                  <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                    Complete the bot setup below, then run <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">npx cordbot</code> again in your terminal.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {user && <BotSetup userId={user.id} initialToken={userData?.botToken} initialGuildId={userData?.guildId} />}
        </div>
      </div>
    );
  }

  return null;
}
