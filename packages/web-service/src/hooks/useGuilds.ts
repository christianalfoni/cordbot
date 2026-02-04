import { useState, useEffect, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { functions, db } from '../firebase';

interface Guild {
  id: string;
  guildName: string;
  guildIcon: string | null;
  status: 'pending' | 'provisioning' | 'active' | 'error' | 'suspended' | 'deprovisioning' | 'deleted';
  tier?: 'free' | 'starter' | 'pro' | 'business';
  subscriptionId?: string | null;
  appName?: string;
  machineId?: string;
  volumeId?: string;
  region?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  provisionedAt?: string;
  memoryContextSize: number;
}

interface GuildStatus {
  status: 'provisioning' | 'running' | 'stopped' | 'error';
  state: string;
  region: string;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    type: string;
    status: string;
    timestamp: number;
  }>;
}

interface GuildLogs {
  message: string;
  cliCommand: string;
  machineCommand: string;
}

export function useGuilds(userId: string | null) {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Real-time listener for guilds collection filtered by userId (Firebase auth ID)
  useEffect(() => {
    if (!userId) {
      setGuilds([]);
      return;
    }

    setIsListening(true);
    const guildsRef = collection(db, 'guilds');
    const q = query(guildsRef, where('userId', '==', userId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const guildsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Guild[];

        setGuilds(guildsData);
        setIsListening(false);
      },
      (err) => {
        console.error('Error listening to guilds:', err);
        setError(err.message);
        setIsListening(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const getStatus = useCallback(async (guildId: string): Promise<GuildStatus> => {
    setIsLoading(true);
    setError(null);

    try {
      const getGuildStatus = httpsCallable(functions, 'getGuildStatus');
      const result = await getGuildStatus({ guildId });
      return result.data as GuildStatus;
    } catch (err: any) {
      setError(err.message || 'Failed to get guild status');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLogs = useCallback(async (guildId: string): Promise<GuildLogs> => {
    setIsLoading(true);
    setError(null);

    try {
      const getGuildLogs = httpsCallable(functions, 'getGuildLogs');
      const result = await getGuildLogs({ guildId });
      return result.data as GuildLogs;
    } catch (err: any) {
      setError(err.message || 'Failed to get guild logs');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restartGuild = useCallback(async (guildId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const restartGuildFunc = httpsCallable(functions, 'restartGuild');
      await restartGuildFunc({ guildId });
    } catch (err: any) {
      setError(err.message || 'Failed to restart guild bot');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deployUpdate = useCallback(async (guildId: string, version: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const deployGuildUpdate = httpsCallable(functions, 'deployGuildUpdate');
      await deployGuildUpdate({ guildId, version });
    } catch (err: any) {
      setError(err.message || 'Failed to deploy update');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deprovisionGuild = useCallback(async (guildId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const deprovisionGuildFunc = httpsCallable(functions, 'deprovisionGuild');
      await deprovisionGuildFunc({ guildId });
    } catch (err: any) {
      setError(err.message || 'Failed to delete guild bot');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    guilds,
    isLoading,
    isListening,
    error,
    getStatus,
    getLogs,
    restartGuild,
    deployUpdate,
    deprovisionGuild,
  };
}

export type { Guild, GuildStatus, GuildLogs };
