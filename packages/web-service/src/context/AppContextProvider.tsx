import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AppContext } from './context';

const AppContextContext = createContext<AppContext | null>(null);

interface AppContextProviderProps {
  children: React.ReactNode;
  context?: AppContext; // Allow injecting context for testing
}

export function AppContextProvider({ children, context }: AppContextProviderProps) {
  const [contextInstance, setContextInstance] = useState<AppContext | null>(context || null);

  useEffect(() => {
    // If context prop is provided (testing), use it
    if (context) {
      setContextInstance(context);
      return;
    }

    // Otherwise, create the real Firebase context
    const initContext = async () => {
      const { FirebaseContext } = await import('./context.impl');

      const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const discordRedirectUri =
        import.meta.env.VITE_DISCORD_REDIRECT_URI ||
        `${window.location.origin}/auth/discord/callback`;

      const firebaseContext = await FirebaseContext.create({
        googleClientId,
        discordRedirectUri,
      });

      setContextInstance(firebaseContext);
    };

    initContext();
  }, [context]);

  if (!contextInstance) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AppContextContext.Provider value={contextInstance}>{children}</AppContextContext.Provider>
  );
}

export function useAppContext(): AppContext {
  const context = useContext(AppContextContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppContextProvider');
  }
  return context;
}
