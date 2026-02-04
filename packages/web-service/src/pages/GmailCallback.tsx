import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGmailAuth } from '../hooks/useGmailAuth';

export function GmailCallback() {
  const navigate = useNavigate();
  const { user, userData, loading } = useAuth();
  const [botId, setBotId] = useState<string>('');
  const gmailAuth = useGmailAuth(userData?.id || '', botId);
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Connecting your Gmail account...');
  const hasExchanged = useRef(false);

  useEffect(() => {
    // Wait for auth to load completely
    if (loading) {
      console.log('Still loading auth...');
      return;
    }

    // Wait until BOTH user and userData are available
    if (!user || !userData) {
      console.log('Auth loaded but waiting for data:', { hasUser: !!user, hasUserData: !!userData });
      return;
    }

    console.log('Auth fully loaded:', { hasUser: !!user, hasUserData: !!userData, userId: userData?.id });

    // Prevent double-execution (React StrictMode or re-renders)
    if (hasExchanged.current) {
      console.log('Already exchanged, skipping');
      return;
    }

    const handleCallback = async () => {
      // Mark as exchanged immediately to prevent race conditions
      hasExchanged.current = true;

      console.log('Processing OAuth callback...');

      // Extract authorization code and state from URL
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');
      const stateParam = params.get('state');

      if (error) {
        console.error('OAuth error:', error);
        setStatus('error');
        setMessage(`OAuth error: ${error}`);
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      if (!code) {
        console.error('No authorization code in URL');
        setStatus('error');
        setMessage('No authorization code received');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      if (!stateParam) {
        console.error('No state parameter in URL');
        setStatus('error');
        setMessage('Missing state parameter');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      // Parse state to get botId
      let stateBotId: string;
      let stateUserId: string;
      try {
        const state = JSON.parse(stateParam);
        stateBotId = state.botId;
        stateUserId = state.userId;

        if (!stateBotId) {
          throw new Error('botId missing from state');
        }

        // Verify userId matches
        if (stateUserId !== userData?.id) {
          throw new Error('User ID mismatch');
        }

        setBotId(stateBotId);
      } catch (err) {
        console.error('Failed to parse state parameter:', err);
        setStatus('error');
        setMessage('Invalid state parameter');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      // Exchange code for tokens
      const result = await gmailAuth.exchangeToken(code, stateBotId);

      if (result.success) {
        setStatus('success');
        setMessage(`Gmail connected successfully! (${result.email})`);
        setTimeout(() => navigate('/'), 2000);
      } else {
        setStatus('error');
        setMessage(result.error || 'Failed to connect Gmail');
        setTimeout(() => navigate('/'), 3000);
      }
    };

    handleCallback();
  }, [user, userData, loading, navigate, gmailAuth]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full">
        <div className="text-center">
          {status === 'processing' && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Connecting Gmail</h2>
              <p className="text-gray-600">{message}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✓</span>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Success!</h2>
              <p className="text-gray-600">{message}</p>
              <p className="text-sm text-gray-500 mt-2">Redirecting to dashboard...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✗</span>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Connection Failed</h2>
              <p className="text-gray-600">{message}</p>
              <p className="text-sm text-gray-500 mt-2">Redirecting to dashboard...</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
