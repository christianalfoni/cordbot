import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  hasBot: boolean;
}

export function useUserGuilds() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserGuilds();
  }, []);

  const fetchUserGuilds = async () => {
    try {
      setLoading(true);
      setError(null);

      const functions = getFunctions();
      const getUserGuildsWithBot = httpsCallable(functions, 'getUserGuildsWithBot');

      const result = await getUserGuildsWithBot();
      const data = result.data as { guilds: Guild[] };

      setGuilds(data.guilds || []);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching guilds:', err);
      setError('Unable to check guild status');
      setGuilds([]);
      setLoading(false);
    }
  };

  const guildsWithBot = guilds.filter(g => g.hasBot);
  const hasBot = guildsWithBot.length > 0;

  return {
    guilds,
    guildsWithBot,
    hasBot,
    loading,
    error,
    refetch: fetchUserGuilds,
  };
}
