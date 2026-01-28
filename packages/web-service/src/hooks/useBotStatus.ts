import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

const BOT_CLIENT_ID = import.meta.env.VITE_DISCORD_BOT_CLIENT_ID;
const BOT_PERMISSIONS = import.meta.env.VITE_DISCORD_BOT_PERMISSIONS || '8'; // Administrator by default

interface BotStatus {
  isInGuild: boolean;
  botUser?: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
  };
  error?: string;
}

export function useBotStatus(guildId: string | undefined) {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!guildId) {
      setLoading(false);
      return;
    }

    checkBotStatus();
  }, [guildId]);

  const checkBotStatus = async () => {
    if (!guildId) return;

    try {
      setLoading(true);
      setError(null);

      const functions = getFunctions();
      const checkBotInGuild = httpsCallable(functions, 'checkBotInGuild');

      const result = await checkBotInGuild({
        guildId,
      });

      const data = result.data as BotStatus;
      setStatus(data);
      setLoading(false);
    } catch (err: any) {
      console.error('Error checking bot status:', err);

      // Don't show error if functions aren't deployed yet
      if (err.code === 'functions/not-found') {
        setError(null);
        setStatus({ isInGuild: false });
      } else {
        setError('Unable to verify bot status');
        setStatus({ isInGuild: false });
      }

      setLoading(false);
    }
  };

  const getBotInviteUrl = (guildId: string) => {
    const params = new URLSearchParams({
      client_id: BOT_CLIENT_ID,
      permissions: BOT_PERMISSIONS,
      scope: 'bot',
      guild_id: guildId,
      disable_guild_select: 'true', // Forces the selected guild
    });

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  };

  const openBotInvite = (guildId: string) => {
    const url = getBotInviteUrl(guildId);
    window.open(url, '_blank', 'width=500,height=700');

    // Recheck status after a delay (assuming user completes the flow)
    setTimeout(() => {
      checkBotStatus();
    }, 5000);
  };

  return {
    status,
    loading,
    error,
    getBotInviteUrl,
    openBotInvite,
    recheckStatus: checkBotStatus,
  };
}
