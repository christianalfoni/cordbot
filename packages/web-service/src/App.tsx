import './firebase';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useAppContext } from './context/AppContextProvider';
import { Login } from './components/Login';
import { Home } from './pages/Home';
import { GuildsList } from './pages/GuildsList';
import { GmailCallback } from './pages/GmailCallback';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { Docs } from './pages/Docs';
import { OAuthSuccess } from './pages/OAuthSuccess';
import { DiscordCallback } from './pages/DiscordCallback';
import { StripeSuccess } from './pages/StripeSuccess';
import { StripeCancel } from './pages/StripeCancel';
import { Workspace } from './pages/Workspace';
import { NotificationProvider } from './context/NotificationContext';
import { NotificationContainer } from './components/NotificationContainer';
import { ConfirmationProvider } from './context/ConfirmationContext';

const ADMIN_UID = 'T2MzyDqU6BRZknhZHywr9CcOEp42';

function AppContent() {
  const { user, userData, loading, signInWithDiscord, signOut } = useAuth();
  const ctx = useAppContext();
  const location = useLocation();

  useEffect(() => {
    if (user?.id === ADMIN_UID) {
      (window as any).admin = {
        deployBot: (guildId: string, version?: string) => ctx.adminDeployBot(guildId, version),
      };
      console.log('[Admin] Tools available. Usage: admin.deployBot("guild_id")');
    }
  }, [user, ctx]);

  // Public routes that don't require auth - render immediately
  const isPublicRoute = location.pathname === '/privacy' ||
                       location.pathname === '/terms' ||
                       location.pathname === '/auth/discord/callback' ||
                       location.pathname === '/stripe/success' ||
                       location.pathname === '/stripe/cancel';

  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/auth/discord/callback" element={<DiscordCallback />} />
        <Route path="/stripe/success" element={<StripeSuccess />} />
        <Route path="/stripe/cancel" element={<StripeCancel />} />
      </Routes>
    );
  }

  const handleSignIn = async () => {
    await signInWithDiscord();
  };

  return (
    <Routes>
      <Route path="/" element={<Home userData={userData} onSignOut={signOut} onSignIn={handleSignIn} loading={loading} />} />
      <Route path="/guilds" element={<GuildsList userData={userData} onSignOut={signOut} onSignIn={handleSignIn} loading={loading} />} />
      <Route path="/docs" element={<Docs userData={userData} onSignOut={signOut} onSignIn={handleSignIn} loading={loading} />} />
      <Route path="/guilds/:guildId/setup" element={<OAuthSuccess />} />
      <Route path="/auth/callback/gmail" element={<GmailCallback />} />
      <Route path="/workspace/:guildId" element={user ? <Workspace /> : <Login onSignIn={handleSignIn} />} />
      <Route path="*" element={user && userData ? <Navigate to="/" replace /> : <Login onSignIn={handleSignIn} />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <NotificationProvider>
        <ConfirmationProvider>
          <AppContent />
          <NotificationContainer />
        </ConfirmationProvider>
      </NotificationProvider>
    </BrowserRouter>
  );
}

export default App;
