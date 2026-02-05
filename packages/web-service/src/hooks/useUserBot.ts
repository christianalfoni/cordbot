import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContextProvider';
import type { BotValidationResult } from '../context/types';

// Re-export types for backward compatibility
export type { BotValidationResult, BotInfo, BotGuild as Guild } from '../context/types';

export function useUserBot(userId: string, initialToken?: string) {
  const ctx = useAppContext();
  const [token, setToken] = useState<string | undefined>(initialToken);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<BotValidationResult | null>(null);

  useEffect(() => {
    if (token) {
      validateToken(token);
    } else {
      setValidationResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const validateToken = async (botToken: string) => {
    setValidating(true);
    setValidationResult(null);

    try {
      const result = await ctx.validateBotToken(botToken);
      setValidationResult(result);
    } catch (error) {
      console.error('Error validating bot token:', error);
      setValidationResult({
        valid: false,
        error: 'An error occurred while validating the token.',
      });
    } finally {
      setValidating(false);
    }
  };

  const saveToken = async (newToken: string) => {
    try {
      await ctx.saveBotToken(userId, newToken);
      setToken(newToken);
      return true;
    } catch (error) {
      console.error('Error saving bot token:', error);
      return false;
    }
  };

  const saveGuildSelection = async (guildId: string) => {
    try {
      await ctx.saveGuildSelection(userId, guildId);
      return true;
    } catch (error) {
      console.error('Error saving guild selection:', error);
      return false;
    }
  };

  const clearToken = async () => {
    try {
      await ctx.clearBotToken(userId);
      setToken(undefined);
      setValidationResult(null);
      return true;
    } catch (error) {
      console.error('Error clearing bot token:', error);
      return false;
    }
  };

  return {
    token,
    validating,
    validationResult,
    saveToken,
    saveGuildSelection,
    clearToken,
    revalidate: () => token && validateToken(token),
  };
}
