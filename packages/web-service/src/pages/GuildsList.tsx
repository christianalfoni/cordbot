import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UserData } from '../hooks/useAuth';
import { useGuilds } from '../hooks/useGuilds';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { EllipsisHorizontalIcon, ArrowPathIcon, ArrowUpCircleIcon, TrashIcon, CreditCardIcon, FolderOpenIcon } from '@heroicons/react/20/solid';
import { Header } from '../components/Header';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useNotification } from '../context/NotificationContext';
import { useConfirmation } from '../context/ConfirmationContext';
import { useAppContext } from '../context/AppContextProvider';

interface GuildsListProps {
  userData: UserData | null;
  onSignOut: () => void;
  onSignIn: () => Promise<void>;
  loading: boolean;
}

interface Subscription {
  id: string;
  tier: 'starter' | 'pro';
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export function GuildsList({ userData, onSignOut, onSignIn, loading }: GuildsListProps) {
  const ctx = useAppContext();
  const { guilds, isListening, restartGuild, deployUpdate, deprovisionGuild } = useGuilds(userData?.id ?? '');
  const { showNotification } = useNotification();
  const { confirm } = useConfirmation();
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({});
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Load subscriptions for guilds
  useEffect(() => {
    const loadSubscriptions = async () => {
      const subs: Record<string, Subscription> = {};

      for (const guild of guilds) {
        if (guild.subscriptionId) {
          try {
            const subscriptionDoc = await getDoc(doc(db, 'subscriptions', guild.subscriptionId));
            if (subscriptionDoc.exists()) {
              subs[guild.id] = subscriptionDoc.data() as Subscription;
            }
          } catch (error) {
            console.error(`Failed to load subscription for guild ${guild.id}:`, error);
          }
        }
      }

      setSubscriptions(subs);
    };

    if (guilds.length > 0) {
      loadSubscriptions();
    }
  }, [guilds]);

  const handleUpdate = async (guildId: string) => {
    const confirmed = await confirm({
      title: 'Deploy Update',
      message: 'Deploy the latest version?',
      confirmText: 'Deploy',
    });

    if (confirmed) {
      try {
        await deployUpdate(guildId, 'latest');
      } catch (error) {
        console.error('Failed to update guild:', error);
      }
    }
  };

  const handleRestart = async (guildId: string) => {
    const confirmed = await confirm({
      title: 'Restart Bot',
      message: 'Are you sure you want to restart this bot?',
      confirmText: 'Restart',
    });

    if (confirmed) {
      try {
        await restartGuild(guildId);
      } catch (error) {
        console.error('Failed to restart guild:', error);
      }
    }
  };

  const handleDelete = async (guildId: string, hasPaidSubscription: boolean) => {
    const message = hasPaidSubscription
      ? 'Are you sure you want to delete this bot? This will immediately cancel your subscription and remove the bot. This action cannot be undone.'
      : 'Are you sure you want to delete this bot? This action cannot be undone.';

    const confirmed = await confirm({
      title: 'Delete Bot',
      message,
      confirmText: 'Delete',
      isDangerous: true,
    });

    if (confirmed) {
      try {
        await deprovisionGuild(guildId);
      } catch (error) {
        console.error('Failed to delete guild:', error);
      }
    }
  };

  const handleManageBilling = async () => {
    setLoadingAction('billing');
    try {
      const functions = getFunctions();
      const createBillingPortal = httpsCallable(functions, 'createBillingPortal');
      const result = await createBillingPortal({
        returnUrl: window.location.href,
      }) as { data: { url: string } };

      // Open billing portal in new tab
      window.open(result.data.url, '_blank');
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      showNotification('error', 'Failed to open billing portal. Please try again.');
    } finally {
      setLoadingAction(null);
    }
  };


  return (
    <div className="bg-white dark:bg-gray-900 min-h-screen">
      <Header
        userData={userData}
        onSignOut={onSignOut}
        onSignIn={onSignIn}
        loading={loading}
        confirm={confirm}
        ctx={ctx}
        showNotification={showNotification}
      />

      <main className="mx-auto max-w-7xl px-6 lg:px-8 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl lg:max-w-none">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-gray-900 dark:text-white">Your Guilds</h1>
            <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
              Manage your Discord servers with CordBot
            </p>
          </div>

          {loading || isListening ? (
            <div className="mt-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto mb-4"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{loading ? 'Authenticating...' : 'Loading guilds...'}</p>
            </div>
          ) : guilds.length === 0 ? (
            <div className="mt-12 text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No guilds yet
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Add CordBot to your Discord server to get started.
              </p>
            </div>
          ) : (
            <div className="mt-12">
              <ul role="list" className="divide-y divide-gray-200 dark:divide-gray-800">
                {guilds.map((guild) => {
                  const subscription = guild.subscriptionId ? subscriptions[guild.id] : null;
                  const isPaidTier = guild.tier && guild.tier !== 'free';

                  return (
                    <li key={guild.id} className="py-6">
                      <div className="flex items-start gap-x-6 p-4">
                        {guild.guildIcon ? (
                          <img
                            src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.guildIcon}.png`}
                            alt=""
                            className="h-16 w-16 flex-none rounded-lg bg-gray-50 dark:bg-gray-800"
                          />
                        ) : (
                          <div className="h-16 w-16 flex-none rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
                            <span className="text-2xl font-semibold text-white">
                              {guild.guildName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                              {guild.guildName}
                              {isPaidTier && subscription && (
                                <span className="ml-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                  - {subscription.tier === 'starter' ? 'Starter' : 'Pro'} Plan
                                </span>
                              )}
                            </p>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${
                              // Show subscription status if it exists and is not active
                              isPaidTier && subscription && subscription.status !== 'active'
                                ? subscription.status === 'past_due'
                                  ? 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20'
                                  : subscription.status === 'canceled'
                                  ? 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20'
                                  : 'bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-gray-500/10 dark:text-gray-400 dark:ring-gray-500/20'
                                : // Otherwise show guild deployment status
                                guild.status === 'active'
                                ? 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20'
                                : guild.status === 'provisioning'
                                ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20 dark:bg-yellow-500/10 dark:text-yellow-400 dark:ring-yellow-500/20'
                                : guild.status === 'deprovisioning'
                                ? 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20'
                                : guild.status === 'suspended'
                                ? 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20'
                                : 'bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-gray-500/10 dark:text-gray-400 dark:ring-gray-500/20'
                            }`}>
                              {isPaidTier && subscription && subscription.status !== 'active'
                                ? subscription.status.replace('_', ' ')
                                : guild.status
                              }
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            Added {new Date(guild.createdAt).toLocaleDateString()}
                            {isPaidTier && subscription && (
                              <>
                                {' / '}
                                {subscription.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-x-4">
                          {guild.status === 'active' && (
                            <Link
                              to={`/workspace/${guild.id}`}
                              className="flex items-center gap-x-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                            >
                              <FolderOpenIcon aria-hidden="true" className="size-4" />
                              Workspace
                            </Link>
                          )}
                          <Menu as="div" className="relative">
                            <MenuButton className="relative block text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white">
                              <span className="absolute -inset-2.5" />
                              <span className="sr-only">Open options</span>
                              <EllipsisHorizontalIcon aria-hidden="true" className="size-5" />
                            </MenuButton>
                            <MenuItems
                              transition
                              className="absolute right-0 z-10 mt-2 w-40 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg outline-1 outline-black/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:divide-white/10 dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10"
                            >
                              <div className="py-1">
                                <MenuItem disabled={guild.status !== 'active'}>
                                  {({ focus, disabled }) => (
                                    <button
                                      onClick={() => !disabled && handleUpdate(guild.id)}
                                      className={`group flex w-full items-center px-4 py-2 text-sm ${
                                        focus
                                          ? 'bg-gray-100 text-gray-900 dark:bg-white/5 dark:text-white'
                                          : 'text-gray-700 dark:text-gray-300'
                                      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                      <ArrowUpCircleIcon
                                        aria-hidden="true"
                                        className={`mr-3 size-5 ${
                                          focus
                                            ? 'text-gray-500 dark:text-white'
                                            : 'text-gray-400 dark:text-gray-500'
                                        }`}
                                      />
                                      Update
                                    </button>
                                  )}
                                </MenuItem>
                                <MenuItem disabled={guild.status !== 'active'}>
                                  {({ focus, disabled }) => (
                                    <button
                                      onClick={() => !disabled && handleRestart(guild.id)}
                                      className={`group flex w-full items-center px-4 py-2 text-sm ${
                                        focus
                                          ? 'bg-gray-100 text-gray-900 dark:bg-white/5 dark:text-white'
                                          : 'text-gray-700 dark:text-gray-300'
                                      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                      <ArrowPathIcon
                                        aria-hidden="true"
                                        className={`mr-3 size-5 ${
                                          focus
                                            ? 'text-gray-500 dark:text-white'
                                            : 'text-gray-400 dark:text-gray-500'
                                        }`}
                                      />
                                      Restart
                                    </button>
                                  )}
                                </MenuItem>
                              </div>
                              {isPaidTier && subscription && (
                                <div className="py-1">
                                  <MenuItem>
                                    {({ focus }) => (
                                      <button
                                        onClick={handleManageBilling}
                                        disabled={loadingAction === 'billing'}
                                        className={`group flex w-full items-center px-4 py-2 text-sm ${
                                          focus
                                            ? 'bg-gray-100 text-gray-900 dark:bg-white/5 dark:text-white'
                                            : 'text-gray-700 dark:text-gray-300'
                                        } ${loadingAction === 'billing' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        <CreditCardIcon
                                          aria-hidden="true"
                                          className={`mr-3 size-5 ${
                                            focus
                                              ? 'text-gray-500 dark:text-white'
                                              : 'text-gray-400 dark:text-gray-500'
                                          }`}
                                        />
                                        {loadingAction === 'billing' ? 'Opening...' : 'Manage Billing'}
                                      </button>
                                    )}
                                  </MenuItem>
                                </div>
                              )}
                              <div className="py-1">
                                <MenuItem disabled={guild.status === 'deprovisioning' || guild.status === 'provisioning'}>
                                  {({ focus, disabled }) => (
                                    <button
                                      onClick={() => !disabled && handleDelete(guild.id, !!isPaidTier && !!subscription)}
                                      className={`group flex w-full items-center px-4 py-2 text-sm ${
                                        focus
                                          ? 'bg-gray-100 text-gray-900 dark:bg-white/5 dark:text-white'
                                          : 'text-gray-700 dark:text-gray-300'
                                      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                      <TrashIcon
                                        aria-hidden="true"
                                        className={`mr-3 size-5 ${
                                          focus
                                            ? 'text-gray-500 dark:text-white'
                                            : 'text-gray-400 dark:text-gray-500'
                                        }`}
                                      />
                                      {guild.status === 'deprovisioning' ? 'Deleting...' : 'Delete'}
                                    </button>
                                  )}
                                </MenuItem>
                              </div>
                            </MenuItems>
                          </Menu>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
