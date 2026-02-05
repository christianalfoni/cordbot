import { useState } from 'react';
import { useAppContext } from '../context/AppContextProvider';

const REDIRECT_URI = `${window.location.origin}/auth/callback/gmail`;

export function useGmailAuth(userId: string, botId?: string) {
  const ctx = useAppContext();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiateOAuth = () => {
    if (!botId) {
      setError('Bot ID is required to connect Gmail');
      return;
    }

    ctx.initiateGmailOAuth(userId, botId);
  };

  const exchangeToken = async (
    code: string,
    stateBotId: string
  ): Promise<{ success: boolean; email?: string; error?: string }> => {
    setIsConnecting(true);
    setError(null);

    try {
      const result = await ctx.exchangeGmailToken(code, userId, stateBotId, REDIRECT_URI);
      setIsConnecting(false);
      return result;
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
      await ctx.disconnectGmail(userId, botId);
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
