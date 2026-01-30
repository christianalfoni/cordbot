import './firebase';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { GmailCallback } from './pages/GmailCallback';
import { CliAuth } from './pages/CliAuth';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { useEffect } from 'react';
import chatBotLogo from './chat-bot-logo.svg';

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
  const isPublicRoute = location.pathname === '/privacy' || location.pathname === '/terms';

  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-32 w-32 flex items-center justify-center mb-6">
            <img src={chatBotLogo} alt="Cordbot" className="h-32 w-32" />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !userData) {
    return (
      <Routes>
        <Route path="/auth/callback/gmail" element={<GmailCallback />} />
        <Route path="/auth/cli" element={<CliAuth />} />
        <Route path="*" element={<Login onSignIn={async () => { await signInWithDiscord(); }} />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/bot-setup" replace />} />
      <Route path="/bot-setup" element={<Dashboard userData={userData} onSignOut={signOut} />} />
      <Route path="/integrations" element={<Dashboard userData={userData} onSignOut={signOut} />} />
      <Route path="/hosting" element={<Dashboard userData={userData} onSignOut={signOut} />} />
      <Route path="/docs" element={<Dashboard userData={userData} onSignOut={signOut} />} />
      <Route path="/auth/callback/gmail" element={<GmailCallback />} />
      <Route path="/auth/cli" element={<CliAuth />} />
      <Route path="*" element={<Navigate to="/bot-setup" replace />} />
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
