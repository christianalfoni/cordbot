import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface SetupStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

type GuildStatus = 'pending' | 'provisioning' | 'active' | 'error';
type GuildTier = 'free' | 'starter' | 'pro' | 'business';

interface GuildData {
  guildName: string;
  guildIcon: string | null;
  status: GuildStatus;
  tier?: GuildTier;
  subscriptionId?: string | null;
  errorMessage?: string;
  createdAt: string;
}

interface SubscriptionData {
  id: string;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';
  tier: 'starter' | 'pro';
}

export function SetupStatusModal({ isOpen, onClose, userId }: SetupStatusModalProps) {
  const [status, setStatus] = useState<GuildStatus | 'waiting'>('waiting');
  const [guildInfo, setGuildInfo] = useState<GuildData | null>(null);
  const [guildId, setGuildId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Listen for the most recently created guild by this user (within last 2 minutes)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const guildsRef = collection(db, 'guilds');
    const q = query(
      guildsRef,
      where('userId', '==', userId),
      where('createdAt', '>', twoMinutesAgo),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribeGuild = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data() as GuildData;
        console.log('Guild data received:', data);
        console.log('Guild tier:', data.tier);
        setGuildId(docSnap.id);
        setGuildInfo(data);
        setStatus(data.status);

        // Auto-close after 3 seconds when active
        if (data.status === 'active') {
          setTimeout(() => {
            onClose();
            // Navigate to guilds list
            window.location.href = '/guilds';
          }, 3000);
        }
      }
    });

    return () => unsubscribeGuild();
  }, [isOpen, userId, onClose]);

  // Listen to subscription document if guild has subscriptionId
  useEffect(() => {
    if (!guildInfo?.subscriptionId) {
      setSubscription(null);
      return;
    }

    const subscriptionRef = doc(db, 'subscriptions', guildInfo.subscriptionId);
    const unsubscribeSubscription = onSnapshot(subscriptionRef, (docSnap) => {
      if (docSnap.exists()) {
        setSubscription(docSnap.data() as SubscriptionData);
      } else {
        setSubscription(null);
      }
    });

    return () => unsubscribeSubscription();
  }, [guildInfo?.subscriptionId]);

  // Trigger provisioning when subscription becomes active
  useEffect(() => {
    if (!subscription || !guildId || !guildInfo) return;

    // Only trigger if subscription is active and guild is still pending
    if (subscription.status === 'active' && guildInfo.status === 'pending') {
      const triggerProvisioning = async () => {
        try {
          const functions = getFunctions();
          const provisionPaidTierGuild = httpsCallable(functions, 'provisionPaidTierGuild');

          console.log('Triggering provisioning for paid tier guild:', guildId);
          await provisionPaidTierGuild({ guildId });
          console.log('Provisioning triggered successfully');
        } catch (error) {
          console.error('Error triggering provisioning:', error);
        }
      };

      triggerProvisioning();
    }
  }, [subscription, guildId, guildInfo]);

  const handleCreateSubscription = async () => {
    if (!guildId || !guildInfo?.tier || guildInfo.tier === 'free') return;

    setIsCreatingSubscription(true);

    try {
      const functions = getFunctions();
      const createGuildSubscription = httpsCallable(functions, 'createGuildSubscription');

      const result = await createGuildSubscription({
        guildId,
        tier: guildInfo.tier,
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      }) as { data: { url: string } };

      // Open Stripe checkout in new tab
      window.open(result.data.url, '_blank');
    } catch (error) {
      console.error('Error creating subscription:', error);
      alert('Failed to create subscription. Please try again.');
    } finally {
      setIsCreatingSubscription(false);
    }
  };

  if (!isOpen) return null;

  // Waiting for OAuth authorization
  if (status === 'waiting') {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Waiting for Authorization
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Complete the Discord authorization in the new tab, then we'll set up your bot automatically.
            </p>
            <button
              onClick={onClose}
              className="mt-6 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              Setup Failed
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {guildInfo?.errorMessage || 'Something went wrong during setup.'}
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Determine timeline steps
  const isPaidTier = guildInfo?.tier && guildInfo.tier !== 'free';
  const hasSubscription = !!subscription;
  const isProvisioning = status === 'provisioning';
  const isActive = status === 'active';

  console.log('Timeline state:', {
    tier: guildInfo?.tier,
    isPaidTier,
    hasSubscription,
    status,
    subscriptionId: guildInfo?.subscriptionId,
    subscriptionStatus: subscription?.status
  });

  // Steps for paid tier guilds
  const paidSteps = [
    {
      label: 'Authenticated with Discord',
      completed: true,
    },
    {
      label: 'Create Subscription',
      completed: hasSubscription && subscription?.status === 'active',
      inProgress: !hasSubscription && !isProvisioning && !isActive,
    },
    {
      label: 'Deploying Bot',
      completed: isActive,
      inProgress: isProvisioning || (hasSubscription && subscription?.status === 'active' && !isActive),
    },
  ];

  // Steps for free tier guilds
  const freeSteps = [
    {
      label: 'Authenticated with Discord',
      completed: true,
    },
    {
      label: 'Deploying Bot',
      completed: isActive,
      inProgress: status === 'pending' || isProvisioning,
    },
  ];

  const steps = isPaidTier ? paidSteps : freeSteps;

  // Pending or Provisioning state
  if (status === 'pending' || status === 'provisioning') {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Setting up CordBot...
            </h2>
            {guildInfo && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                {guildInfo.guildIcon && guildId && (
                  <img
                    src={`https://cdn.discordapp.com/icons/${guildId}/${guildInfo.guildIcon}.png?size=48`}
                    alt={guildInfo.guildName}
                    className="w-12 h-12 rounded-full mx-auto mb-2"
                  />
                )}
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {guildInfo.guildName}
                </p>
                {isPaidTier && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {guildInfo.tier === 'starter' ? 'Starter' : 'Pro'} Tier
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 space-y-3 text-left">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center gap-3 text-sm">
                  {step.completed ? (
                    <svg className="h-5 w-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : step.inProgress ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600 flex-shrink-0"></div>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400 dark:text-gray-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
                    </svg>
                  )}
                  <span className={
                    step.completed
                      ? 'text-gray-900 dark:text-white font-medium'
                      : step.inProgress
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-500 dark:text-gray-400'
                  }>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Show Subscribe button if paid tier and no subscription yet */}
            {isPaidTier && !hasSubscription && !isProvisioning && (
              <div className="mt-6">
                <button
                  onClick={handleCreateSubscription}
                  disabled={isCreatingSubscription}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingSubscription ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Opening Checkout...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <span>Subscribe Now</span>
                    </>
                  )}
                </button>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Checkout will open in a new tab. Keep this page open to track progress.
                </p>
              </div>
            )}

            {/* Show waiting message if subscription is active but bot not provisioned yet */}
            {hasSubscription && subscription?.status === 'active' && !isActive && (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                This will take about 30 seconds...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active state - show success briefly before closing
  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20">
            <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            CordBot is Ready! 🎉
          </h2>

          {guildInfo && guildId && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              {guildInfo.guildIcon && (
                <img
                  src={`https://cdn.discordapp.com/icons/${guildId}/${guildInfo.guildIcon}.png?size=64`}
                  alt={guildInfo.guildName}
                  className="w-16 h-16 rounded-full mx-auto mb-3"
                />
              )}
              <h3 className="font-medium text-gray-900 dark:text-white">
                {guildInfo.guildName}
              </h3>
            </div>
          )}

          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Your bot is now active! Head to Discord and try mentioning @CordBot.
          </p>

          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
            Redirecting...
          </p>
        </div>
      </div>
    </div>
  );
}
