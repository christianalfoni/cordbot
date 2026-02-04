import { UserData } from '../hooks/useAuth';
import { Documentation } from '../components/Documentation';
import { Header } from '../components/Header';

interface DocsProps {
  userData: UserData | null;
  onSignOut: () => void;
  onSignIn: () => Promise<void>;
  loading: boolean;
}

export function Docs({ userData, onSignOut, onSignIn, loading }: DocsProps) {
  return (
    <div className="bg-white dark:bg-gray-900 min-h-screen">
      <Header userData={userData} onSignOut={onSignOut} onSignIn={onSignIn} loading={loading} />

      <main className="mx-auto max-w-7xl px-6 lg:px-8 py-24 sm:py-32">
        <Documentation />
      </main>
    </div>
  );
}
