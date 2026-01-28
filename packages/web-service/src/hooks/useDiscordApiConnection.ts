import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_BOT_CLIENT_ID;
const DISCORD_REDIRECT_URI = `${window.location.origin}/discord-callback`;

export function useDiscordApiConnection() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiateDiscordConnection = () => {
    setConnecting(true);
    setError(null);

    // Build Discord OAuth URL
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify email guilds',
    });

    const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

    // Open in popup
    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'discord-oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    // Listen for the callback
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'discord-oauth-success') {
        window.removeEventListener('message', handleMessage);
        popup?.close();

        try {
          // Store the tokens in Firestore
          const user = auth.currentUser;
          if (!user) {
            throw new Error('No authenticated user');
          }

          const userDocRef = doc(db, 'users', user.uid);
          await setDoc(
            userDocRef,
            {
              discordAccessToken: event.data.accessToken,
              discordRefreshToken: event.data.refreshToken,
              discordTokenExpiresAt: event.data.expiresAt,
            },
            { merge: true }
          );

          setConnecting(false);
        } catch (err) {
          console.error('Error storing Discord tokens:', err);
          setError('Failed to save Discord connection');
          setConnecting(false);
        }
      } else if (event.data.type === 'discord-oauth-error') {
        window.removeEventListener('message', handleMessage);
        popup?.close();
        setError(event.data.error || 'Failed to connect Discord');
        setConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup if popup is closed without completing
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
        if (connecting) {
          setConnecting(false);
          setError('Connection cancelled');
        }
      }
    }, 500);
  };

  return {
    connecting,
    error,
    initiateDiscordConnection,
  };
}
