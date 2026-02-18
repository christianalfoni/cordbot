import './firebase';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
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

function AppContent() {
  const { user, userData, loading, signInWithDiscord, signOut } = useAuth();
  const location = useLocation();

  // Public routes that don't require auth - render immediately
  const isPublicRoute = location.pathname === '/privacy' ||
                       location.pathname === '/terms' ||
                       location.pathname === '/auth/discord/callback' ||
                       location.pathname === '/stripe/success' ||
                       location.pathname === '/stripe/cancel' ||
                       location.pathname.startsWith('/workspace/');

  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/auth/discord/callback" element={<DiscordCallback />} />
        <Route path="/stripe/success" element={<StripeSuccess />} />
        <Route path="/stripe/cancel" element={<StripeCancel />} />
        <Route path="/workspace/:guildId/:token" element={<Workspace />} />
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
