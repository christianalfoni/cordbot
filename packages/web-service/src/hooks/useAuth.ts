import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContextProvider';
import type { User, UserData } from '../context/types';

// Re-export types for backward compatibility
export type { User, UserData, ToolCategory, OAuthToken, ToolsManifest, GmailConnection } from '../context/types';

export function useAuth() {
  const ctx = useAppContext();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserData: (() => void) | undefined;

    // Watch auth state changes
    const unsubscribeAuth = ctx.watchAuthState((authUser) => {
      setUser(authUser);

      // Clean up previous user data listener
      if (unsubscribeUserData) {
        unsubscribeUserData();
        unsubscribeUserData = undefined;
      }

      if (authUser) {
        // Watch user data changes
        unsubscribeUserData = ctx.watchUserData(authUser.id, (data) => {
          setUserData(data);
          setLoading(false);
        });
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserData) {
        unsubscribeUserData();
      }
    };
  }, [ctx]);

  const signInWithDiscord = async () => {
    try {
      const user = await ctx.signInWithDiscord();
      return user;
    } catch (error) {
      console.error('Error signing in with Discord:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await ctx.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return {
    user,
    userData,
    loading,
    signInWithDiscord,
    signOut,
  };
}
