import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContextProvider';
import type { Guild, GuildStatus, GuildLogs } from '../context/types';

// Re-export types for backward compatibility
export type { Guild, GuildStatus, GuildLogs };

export function useGuilds(userId: string | null) {
  const ctx = useAppContext();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Real-time listener for guilds collection filtered by userId
  useEffect(() => {
    if (!userId) {
      setGuilds([]);
      setIsListening(false);
      return;
    }

    setIsListening(true);

    const unsubscribe = ctx.watchUserGuilds(userId, (guildsData) => {
      setGuilds(guildsData);
      setIsListening(false);
    });

    return () => unsubscribe();
  }, [userId, ctx]);

  const getStatus = useCallback(
    async (guildId: string): Promise<GuildStatus> => {
      setIsLoading(true);
      setError(null);

      try {
        const status = await ctx.getGuildStatus(guildId);
        return status;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to get guild status';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx]
  );

  const getLogs = useCallback(
    async (guildId: string): Promise<GuildLogs> => {
      setIsLoading(true);
      setError(null);

      try {
        const logs = await ctx.getGuildLogs(guildId);
        return logs;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to get guild logs';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx]
  );

  const restartGuild = useCallback(
    async (guildId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        await ctx.restartGuild(guildId);
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to restart guild bot';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx]
  );

  const deployUpdate = useCallback(
    async (guildId: string, version: string) => {
      setIsLoading(true);
      setError(null);

      try {
        await ctx.deployGuildUpdate(guildId, version);
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to deploy update';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx]
  );

  const deprovisionGuild = useCallback(
    async (guildId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        await ctx.deprovisionGuild(guildId);
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to delete guild bot';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [ctx]
  );

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
