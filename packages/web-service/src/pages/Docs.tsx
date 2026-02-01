import { UserData } from '../hooks/useAuth';
import { Navigation } from '../components/Navigation';
import { Documentation } from '../components/Documentation';
import { useHostedBots } from '../hooks/useHostedBots';
import { useState } from 'react';
import { CreateBotModal } from '../components/CreateBotModal';

interface DocsProps {
  userData: UserData;
  onSignOut: () => void;
}

export function Docs({ userData, onSignOut }: DocsProps) {
  const { bots } = useHostedBots(userData.id);
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation
        userPhotoURL={userData.photoURL}
        userDisplayName={userData.displayName}
        onSignOut={onSignOut}
        bots={bots}
        onCreateBot={() => setShowCreateModal(true)}
      />

      {/* Main Content */}
      <main className="lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <Documentation />
        </div>
      </main>

      {showCreateModal && (
        <CreateBotModal
          onClose={() => setShowCreateModal(false)}
          userId={userData.id}
        />
      )}
    </div>
  );
}
