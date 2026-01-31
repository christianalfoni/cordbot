import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { UserData } from './useAuth';

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

interface LegacyHostedBot {
  status?: string;
  appName?: string;
  region?: string;
  version?: string;
  provisionedAt?: string;
  lastRestartedAt?: string;
  errorMessage?: string;
}

export function useHostedBot(userData: UserData | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isApproved = userData?.hostingBetaApproved || false;
  const hasApplied = userData?.hostingBetaRequested || false;
  const hasHostedBot = false; // Bots are now in subcollection
  const hostedBot: LegacyHostedBot | null = null; // Bots are now in subcollection

  const applyForBeta = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const applyForHostingBeta = httpsCallable(functions, 'applyForHostingBeta');
      await applyForHostingBeta();
    } catch (err: any) {
      setError(err.message || 'Failed to apply for beta access');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const provisionBot = useCallback(async (anthropicApiKey: string, region: string = 'sjc') => {
    setIsLoading(true);
    setError(null);

    try {
      const provisionHostedBot = httpsCallable(functions, 'provisionHostedBot');
      const result = await provisionHostedBot({ anthropicApiKey, region });
      return result.data;
    } catch (err: any) {
      setError(err.message || 'Failed to provision hosted bot');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getStatus = useCallback(async (): Promise<HostedBotStatus> => {
    setIsLoading(true);
    setError(null);

    try {
      const getHostedBotStatus = httpsCallable(functions, 'getHostedBotStatus');
      const result = await getHostedBotStatus();
      return result.data as HostedBotStatus;
    } catch (err: any) {
      setError(err.message || 'Failed to get bot status');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLogs = useCallback(async (): Promise<HostedBotLogs> => {
    setIsLoading(true);
    setError(null);

    try {
      const getHostedBotLogs = httpsCallable(functions, 'getHostedBotLogs');
      const result = await getHostedBotLogs();
      return result.data as HostedBotLogs;
    } catch (err: any) {
      setError(err.message || 'Failed to get bot logs');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const restartBot = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const restartHostedBot = httpsCallable(functions, 'restartHostedBot');
      await restartHostedBot();
    } catch (err: any) {
      setError(err.message || 'Failed to restart bot');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deployUpdate = useCallback(async (version: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const deployHostedBot = httpsCallable(functions, 'deployHostedBot');
      await deployHostedBot({ version });
    } catch (err: any) {
      setError(err.message || 'Failed to deploy update');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const redeployBot = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const redeployHostedBot = httpsCallable(functions, 'redeployHostedBot');
      await redeployHostedBot();
    } catch (err: any) {
      setError(err.message || 'Failed to redeploy bot');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deprovisionBot = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const deprovisionHostedBot = httpsCallable(functions, 'deprovisionHostedBot');
      await deprovisionHostedBot();
    } catch (err: any) {
      setError(err.message || 'Failed to delete hosted bot');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    isApproved,
    hasApplied,
    hasHostedBot,
    hostedBot: hostedBot as LegacyHostedBot | null,
    applyForBeta,
    provisionBot,
    getStatus,
    getLogs,
    restartBot,
    deployUpdate,
    redeployBot,
    deprovisionBot,
  };
}
