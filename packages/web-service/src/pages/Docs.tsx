import { UserData } from '../hooks/useAuth';
import { Navigation } from '../components/Navigation';
import { Documentation } from '../components/Documentation';
import { useGuilds } from '../hooks/useGuilds';

interface DocsProps {
  userData: UserData;
  onSignOut: () => void;
}

export function Docs({ userData, onSignOut }: DocsProps) {
  const { guilds } = useGuilds(userData.id);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation
        userPhotoURL={userData.photoURL}
        userDisplayName={userData.displayName}
        onSignOut={onSignOut}
        guilds={guilds}
      />

      {/* Main Content */}
      <main className="lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <Documentation />
        </div>
      </main>
    </div>
  );
}
