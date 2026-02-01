import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { functions, db } from '../firebase';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const REDIRECT_URI = `${window.location.origin}/auth/callback/gmail`;

export function useGmailAuth(userId: string, botId?: string) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiateOAuth = () => {
    if (!botId) {
      setError('Bot ID is required to connect Gmail');
      return;
    }

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');

    // Store botId in the state parameter to retrieve it after OAuth redirect
    const state = JSON.stringify({ botId, userId });

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    window.location.href = authUrl;
  };

  const exchangeToken = async (code: string, stateBotId: string): Promise<{ success: boolean; email?: string; error?: string }> => {
    setIsConnecting(true);
    setError(null);

    try {
      const exchangeGmailToken = httpsCallable(functions, 'exchangeGmailToken');
      const result = await exchangeGmailToken({
        code,
        userId,
        botId: stateBotId,
        redirectUri: REDIRECT_URI
      });
      const data = result.data as { success: boolean; email?: string };

      setIsConnecting(false);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect Gmail';
      setError(errorMessage);
      setIsConnecting(false);
      return { success: false, error: errorMessage };
    }
  };

  const disconnect = async () => {
    if (!botId) {
      setError('Bot ID is required to disconnect Gmail');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const botRef = doc(db, 'users', userId, 'bots', botId);
      await updateDoc(botRef, {
        'oauthConnections.gmail': deleteField(),
        'toolsConfig.gmail': deleteField(),
      });
      setIsConnecting(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect Gmail';
      setError(errorMessage);
      setIsConnecting(false);
    }
  };

  return {
    initiateOAuth,
    exchangeToken,
    disconnect,
    isConnecting,
    error,
  };
}
