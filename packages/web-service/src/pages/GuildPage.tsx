import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { UserData } from '../hooks/useAuth';
import { db } from '../firebase';
import { Guild, useGuilds } from '../hooks/useGuilds';
import { Navigation } from '../components/Navigation';
import { useNotification } from '../context/NotificationContext';
import { useConfirmation } from '../context/ConfirmationContext';

interface GuildPageProps {
  userData: UserData;
  onSignOut: () => void;
}

export function GuildPage({ userData, onSignOut }: GuildPageProps) {
  const { guildId } = useParams<{ guildId: string }>();
  const navigate = useNavigate();
  const { guilds, restartGuild, deployUpdate, deprovisionGuild, isLoading } = useGuilds(userData.id);
  const { showNotification } = useNotification();
  const { confirm } = useConfirmation();
  const [guild, setGuild] = useState<Guild | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  // Real-time listener for guild document
  useEffect(() => {
    if (!guildId) return;

    const guildRef = doc(db, 'guilds', guildId);
    const unsubscribe = onSnapshot(
      guildRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setGuild({ id: snapshot.id, ...snapshot.data() } as Guild);
        } else {
          setGuild(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to guild:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [guildId]);

  const handleRestart = async () => {
    if (!guildId || !guild) return;

    const confirmed = await confirm({
      title: 'Restart Bot',
      message: 'Restart the bot for this guild?',
      confirmText: 'Restart',
    });

    if (!confirmed) return;

    setIsRestarting(true);

    // Optimistic update - immediately set status to provisioning
    setGuild(prev => prev ? { ...prev, status: 'provisioning' } : null);

    try {
      await restartGuild(guildId);
      showNotification('success', 'Bot restarted successfully');
      // Real-time listener will update with actual status
    } catch (error: any) {
      showNotification('error', `Failed to restart: ${error.message}`);
      // Rollback optimistic update
      setGuild(prev => prev ? { ...prev, status: 'active' } : null);
    } finally {
      setIsRestarting(false);
    }
  };

  const handleDeployUpdate = async () => {
    if (!guildId || !guild) return;

    const confirmed = await confirm({
      title: 'Deploy Update',
      message: 'Deploy latest version of the bot?',
      confirmText: 'Deploy',
    });

    if (!confirmed) return;

    setIsUpdating(true);

    // Optimistic update - immediately set status to provisioning
    setGuild(prev => prev ? { ...prev, status: 'provisioning' } : null);

    try {
      await deployUpdate(guildId, 'latest');
      // Real-time listener will update with actual status
    } catch (error: any) {
      showNotification('error', `Failed to deploy update: ${error.message}`);
      // Rollback optimistic update
      setGuild(prev => prev ? { ...prev, status: 'active' } : null);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!guildId || !guild) return;

    const confirmed = await confirm({
      title: 'Delete Bot',
      message: `Are you sure you want to delete the bot for "${guild.guildName}"? This cannot be undone.`,
      confirmText: 'Delete',
      isDangerous: true,
    });

    if (!confirmed) return;

    setIsDeleting(true);
    setDeleteStatus('Deprovisioning bot...');

    // Optimistic update - immediately set status to deprovisioning
    setGuild(prev => prev ? { ...prev, status: 'deprovisioning' } : null);

    try {
      await deprovisionGuild(guildId);
      setDeleteStatus('Bot deleted successfully');
      setTimeout(() => navigate('/'), 2000);
      // Real-time listener will remove the guild once deleted from Firestore
    } catch (error: any) {
      console.error('Delete error:', error);
      setDeleteStatus(`Failed to delete: ${error.message}`);
      setIsDeleting(false);
      // Rollback optimistic update
      setGuild(prev => prev ? { ...prev, status: 'active' } : null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading guild...</p>
        </div>
      </div>
    );
  }

  if (!guild) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Guild not found</h3>
          <Link to="/" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'provisioning':
      case 'pending':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
      case 'deprovisioning':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300';
      case 'error':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      case 'suspended':
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation
        userPhotoURL={userData.photoURL}
        userDisplayName={userData.displayName}
        onSignOut={onSignOut}
        guilds={guilds}
      />

      <main className="lg:pl-72">
        <div className="px-4 sm:px-6 lg:px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to home
            </Link>

            <div className="flex items-center gap-4">
              {guild.guildIcon ? (
                <img
                  src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.guildIcon}.png`}
                  alt=""
                  className="h-12 w-12 rounded-lg"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                    {guild.guildName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{guild.guildName}</h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(guild.status)}`}>
                  {guild.status}
                </span>
              </div>
            </div>
          </div>

          {/* Status message */}
          {guild.status === 'error' && guild.error && (
            <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-300">
                <strong>Error:</strong> {guild.error}
              </p>
            </div>
          )}

          {guild.status === 'provisioning' || guild.status === 'pending' ? (
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-6">
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                Bot is being provisioned... This usually takes about 30 seconds.
              </p>
            </div>
          ) : guild.status === 'deprovisioning' ? (
            <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 p-6">
              <p className="text-sm text-orange-800 dark:text-orange-300">
                Bot is being removed... This will take a moment.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Restart Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Restart Bot</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Restart the bot if it's not responding or behaving incorrectly.
                </p>
                <button
                  onClick={handleRestart}
                  disabled={isRestarting || isLoading}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRestarting ? 'Restarting...' : 'Restart Bot'}
                </button>
              </div>

              {/* Update Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Deploy Update</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Deploy the latest version of the bot to this guild.
                </p>
                <button
                  onClick={handleDeployUpdate}
                  disabled={isUpdating || isLoading}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdating ? 'Deploying...' : 'Deploy Latest'}
                </button>
              </div>

              {/* Delete Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 lg:col-span-2">
                <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">Danger Zone</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Remove the bot from this guild and delete all associated data. This action cannot be undone.
                </p>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? deleteStatus : 'Delete Bot'}
                </button>
              </div>
            </div>
          )}

          {/* Guild Info */}
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Guild Information</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Guild ID</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{guild.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">App Name</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white font-mono">{guild.appName || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Region</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">{guild.region || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                  {new Date(guild.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </div>
  );
}
