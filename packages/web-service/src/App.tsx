import './firebase';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Login } from './components/Login';
import { Home } from './pages/Home';
import { GuildsList } from './pages/GuildsList';
import { GmailCallback } from './pages/GmailCallback';
import { CliAuth } from './pages/CliAuth';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { Docs } from './pages/Docs';
import { OAuthSuccess } from './pages/OAuthSuccess';
import { DiscordCallback } from './pages/DiscordCallback';
import { StripeSuccess } from './pages/StripeSuccess';
import { StripeCancel } from './pages/StripeCancel';
import { useEffect } from 'react';

function AppContent() {
  const { user, userData, loading, signInWithDiscord, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Check for pending agent auth after successful login
  useEffect(() => {
    if (user && userData && !loading) {
      const pendingCallback = sessionStorage.getItem('cli_auth_callback');
      if (pendingCallback) {
        sessionStorage.removeItem('cli_auth_callback');
        navigate(`/auth/cli?callback=${encodeURIComponent(pendingCallback)}`);
      }
    }
  }, [user, userData, loading, navigate]);

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

  return (
    <Routes>
      <Route path="/" element={<Home userData={userData} onSignOut={signOut} onSignIn={signInWithDiscord} loading={loading} />} />
      <Route path="/guilds" element={<GuildsList userData={userData} onSignOut={signOut} onSignIn={signInWithDiscord} loading={loading} />} />
      <Route path="/docs" element={<Docs userData={userData} onSignOut={signOut} onSignIn={signInWithDiscord} loading={loading} />} />
      <Route path="/guilds/:guildId/setup" element={<OAuthSuccess />} />
      <Route path="/auth/callback/gmail" element={<GmailCallback />} />
      <Route path="/auth/cli" element={<CliAuth />} />
      <Route path="*" element={user && userData ? <Navigate to="/" replace /> : <Login onSignIn={async () => { await signInWithDiscord(); }} />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
