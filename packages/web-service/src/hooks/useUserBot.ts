import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase';

interface BotInfo {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

interface BotValidationResult {
  valid: boolean;
  bot?: BotInfo;
  guilds?: Guild[];
  error?: string;
}

export function useUserBot(userId: string, initialToken?: string) {
  const [token, setToken] = useState<string | undefined>(initialToken);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<BotValidationResult | null>(null);

  useEffect(() => {
    if (token) {
      validateToken(token);
    } else {
      setValidationResult(null);
    }
  }, [token]);

  const validateToken = async (botToken: string) => {
    setValidating(true);
    setValidationResult(null);

    try {
      const functions = getFunctions();
      const validateBotToken = httpsCallable(functions, 'validateBotToken');

      const result = await validateBotToken({ botToken });
      const data = result.data as BotValidationResult;

      setValidationResult(data);
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
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        botToken: newToken,
      });
      setToken(newToken);
      return true;
    } catch (error) {
      console.error('Error saving bot token:', error);
      return false;
    }
  };

  const saveGuildSelection = async (guildId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        guildId: guildId,
      });
      return true;
    } catch (error) {
      console.error('Error saving guild selection:', error);
      return false;
    }
  };

  const clearToken = async () => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        botToken: null,
        guildId: null,
      });
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
