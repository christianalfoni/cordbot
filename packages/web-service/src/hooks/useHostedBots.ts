import { useState, useEffect, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { functions, db } from '../firebase';

interface Bot {
  id: string;
  botName: string;
  discordBotUserId?: string;
  botDiscordUsername?: string;
  botDiscordAvatar?: string | null;
  mode: 'personal' | 'shared';
  appName?: string;
  machineId?: string;
  volumeId?: string;
  region?: string;
  status: 'provisioning' | 'running' | 'stopped' | 'error' | 'unconfigured' | 'configured';
  version?: string;
  provisionedAt?: string;
  lastRestartedAt?: string;
  errorMessage?: string;
  discordBotToken?: string;
  discordGuildId?: string;
  discordGuildName?: string;
  discordGuildIcon?: string | null;
  memoryContextSize?: number;
  oauthConnections?: Record<string, any>; // Per-bot OAuth connections (gmail, etc.)
  toolsConfig?: Record<string, string[]>; // Per-bot tools configuration
  createdAt: string;
  updatedAt: string;
}

interface HostedBotStatus {
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

interface HostedBotLogs {
  message: string;
  cliCommand: string;
  machineCommand: string;
}

export function useHostedBots(userId: string | null) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const canCreateMore = bots.length < 10;

  // Real-time listener for bots subcollection
  useEffect(() => {
    if (!userId) {
      setBots([]);
      return;
    }

    setIsListening(true);
    const botsRef = collection(db, 'users', userId, 'bots');
    const q = query(botsRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const botsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Bot[];

        setBots(botsData);
        setIsListening(false);
      },
      (err) => {
        console.error('Error listening to bots:', err);
        setError(err.message);
        setIsListening(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const createBot = useCallback(async (
    botName: string,
    mode: 'personal' | 'shared',
    discordBotToken: string,
    discordGuildId: string,
    anthropicApiKey: string,
    region: string = 'sjc'
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const createHostedBot = httpsCallable(functions, 'createHostedBot');
      const result = await createHostedBot({
        botName,
        mode,
        discordBotToken,
        discordGuildId,
        anthropicApiKey,
        region,
      });
      return result.data;
    } catch (err: any) {
      setError(err.message || 'Failed to create hosted bot');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const listBots = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const listHostedBots = httpsCallable(functions, 'listHostedBots');
      const result = await listHostedBots();
      return result.data;
    } catch (err: any) {
      setError(err.message || 'Failed to list hosted bots');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getStatus = useCallback(async (botId: string): Promise<HostedBotStatus> => {
    setIsLoading(true);
    setError(null);

    try {
      const getHostedBotStatus = httpsCallable(functions, 'getHostedBotStatus');
      const result = await getHostedBotStatus({ botId });
      return result.data as HostedBotStatus;
    } catch (err: any) {
      setError(err.message || 'Failed to get bot status');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLogs = useCallback(async (botId: string): Promise<HostedBotLogs> => {
    setIsLoading(true);
    setError(null);

    try {
      const getHostedBotLogs = httpsCallable(functions, 'getHostedBotLogs');
      const result = await getHostedBotLogs({ botId });
      return result.data as HostedBotLogs;
    } catch (err: any) {
      setError(err.message || 'Failed to get bot logs');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restartBot = useCallback(async (botId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const restartHostedBot = httpsCallable(functions, 'restartHostedBot');
      await restartHostedBot({ botId });
    } catch (err: any) {
      setError(err.message || 'Failed to restart bot');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deployUpdate = useCallback(async (botId: string, version: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const deployHostedBot = httpsCallable(functions, 'deployHostedBot');
      await deployHostedBot({ version, botId });
    } catch (err: any) {
      setError(err.message || 'Failed to deploy update');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deprovisionBot = useCallback(async (botId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const deprovisionHostedBot = httpsCallable(functions, 'deprovisionHostedBot');
      await deprovisionHostedBot({ botId });
    } catch (err: any) {
      setError(err.message || 'Failed to delete hosted bot');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    bots,
    isLoading,
    isListening,
    error,
    canCreateMore,
    createBot,
    listBots,
    getStatus,
    getLogs,
    restartBot,
    deployUpdate,
    deprovisionBot,
  };
}

export type { Bot, HostedBotStatus, HostedBotLogs };
