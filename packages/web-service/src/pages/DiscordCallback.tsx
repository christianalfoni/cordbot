import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckIcon } from '@heroicons/react/20/solid';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContextProvider';
import type { Guild, Subscription } from '../context/types';
import { useNotification } from '../context/NotificationContext';

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'error';

interface SetupStep {
  id: number;
  title: string;
  status: StepStatus;
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function DiscordCallback() {
  const { user } = useAuth();
  const ctx = useAppContext();
  const { showNotification } = useNotification();
  const userId = user?.id || null;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [guildInfo, setGuildInfo] = useState<Guild | null>(null);
  const [guildId, setGuildId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false);
  const [checkoutOpened, setCheckoutOpened] = useState(false);
  const [steps, setSteps] = useState<SetupStep[]>([
    { id: 1, title: 'Authenticate with Cordbot', status: 'in_progress' },
    { id: 2, title: 'Connect to Discord', status: 'pending' },
    { id: 3, title: 'Create Subscription', status: 'pending' },
    { id: 4, title: 'Provision bot instance', status: 'pending' },
    { id: 5, title: 'Complete setup', status: 'pending' },
  ]);

  // Listen for guild status changes
  useEffect(() => {
    if (!userId) return;

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const unsubscribe = ctx.watchUserGuilds(userId, (guilds) => {
      // Filter for guilds created in the last 2 minutes and get the most recent
      const recentGuilds = guilds
        .filter((g) => g.createdAt > twoMinutesAgo)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (recentGuilds.length > 0) {
        const latestGuild = recentGuilds[0];
        setGuildId(latestGuild.id);
        setGuildInfo(latestGuild);

        // Check if this is a paid tier
        const isPaidTier = latestGuild.tier && latestGuild.tier !== 'free';
        const hasSubscription = !!latestGuild.subscriptionId;

        // Update steps based on guild status and tier
        // Always include subscription step, but it's disabled for free tier
        if (latestGuild.status === 'pending') {
          if (isPaidTier && !hasSubscription) {
            // Paid tier waiting for subscription
            setSteps([
              { id: 1, title: 'Authenticate with Cordbot', status: 'completed' },
              { id: 2, title: 'Connect to Discord', status: 'completed' },
              { id: 3, title: 'Create Subscription', status: 'in_progress' },
              { id: 4, title: 'Provision bot instance', status: 'pending' },
              { id: 5, title: 'Complete setup', status: 'pending' },
            ]);
          } else {
            // Free tier (subscription disabled) or paid tier with subscription - provisioning
            setSteps([
              { id: 1, title: 'Authenticate with Cordbot', status: 'completed' },
              { id: 2, title: 'Connect to Discord', status: 'completed' },
              { id: 3, title: 'Create Subscription', status: 'completed' },
              { id: 4, title: 'Provision bot instance', status: 'in_progress' },
              { id: 5, title: 'Complete setup', status: 'pending' },
            ]);
          }
        } else if (latestGuild.status === 'provisioning') {
          setSteps([
            { id: 1, title: 'Authenticate with Cordbot', status: 'completed' },
            { id: 2, title: 'Connect to Discord', status: 'completed' },
            { id: 3, title: 'Create Subscription', status: 'completed' },
            { id: 4, title: 'Provision bot instance', status: 'completed' },
            { id: 5, title: 'Complete setup', status: 'in_progress' },
          ]);
        } else if (latestGuild.status === 'active') {
          setSteps([
            { id: 1, title: 'Authenticate with Cordbot', status: 'completed' },
            { id: 2, title: 'Connect to Discord', status: 'completed' },
            { id: 3, title: 'Create Subscription', status: 'completed' },
            { id: 4, title: 'Provision bot instance', status: 'completed' },
            { id: 5, title: 'Complete setup', status: 'completed' },
          ]);

          // Redirect to guilds after completion
          setTimeout(() => {
            navigate('/guilds');
          }, 2000);
        } else if (latestGuild.status === 'error') {
          setError(latestGuild.error || 'Setup failed');
          setSteps((prev) =>
            prev.map((step) =>
              step.status === 'in_progress' ? { ...step, status: 'error' as StepStatus } : step
            )
          );
        }
      }
    });

    return () => unsubscribe();
  }, [userId, navigate, ctx]);

  // Listen to subscription document if guild has subscriptionId
  useEffect(() => {
    if (!guildInfo?.subscriptionId) {
      setSubscription(null);
      return;
    }

    const unsubscribe = ctx.watchSubscription(guildInfo.subscriptionId, (sub) => {
      setSubscription(sub);
    });

    return () => unsubscribe();
  }, [guildInfo?.subscriptionId, ctx]);

  // Trigger provisioning when subscription becomes active
  useEffect(() => {
    if (!subscription || !guildId || !guildInfo) return;

    // Only trigger if subscription is active and guild is still pending
    if (subscription.status === 'active' && guildInfo.status === 'pending') {
      const triggerProvisioning = async () => {
        try {
          console.log('Triggering provisioning for paid tier guild:', guildId);
          await ctx.triggerPaidTierProvisioning(guildId);
          console.log('Provisioning triggered successfully');
        } catch (error) {
          console.error('Error triggering provisioning:', error);
        }
      };

      triggerProvisioning();
    }
  }, [subscription, guildId, guildInfo, ctx]);

  // Process OAuth
  useEffect(() => {
    const processOAuth = async () => {
      const code = searchParams.get('code');
      const guildId = searchParams.get('guild_id');
      const permissions = searchParams.get('permissions');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');

      const redirectUri = import.meta.env.VITE_DISCORD_REDIRECT_URI ||
        `${window.location.origin}/auth/discord/callback`;

      let tier: 'free' | 'starter' | 'pro' | 'business' = 'free';
      if (state) {
        try {
          const stateData = JSON.parse(atob(state));
          tier = stateData.tier || 'free';
        } catch (error) {
          console.error('Failed to decode state parameter:', error);
        }
      }

      if (errorParam) {
        setError('Authorization was cancelled or failed');
        setSteps(prev => prev.map(step =>
          step.status === 'in_progress' ? { ...step, status: 'error' as StepStatus } : step
        ));
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      if (!code || !guildId) {
        setError('Missing authorization parameters');
        setSteps(prev => prev.map(step =>
          step.status === 'in_progress' ? { ...step, status: 'error' as StepStatus } : step
        ));
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      try {
        await ctx.processDiscordOAuth({
          code,
          guildId,
          permissions: permissions || '',
          redirectUri,
          tier,
        });

        // OAuth completed, move to next step
        setSteps([
          { id: 1, title: 'Authenticate with Cordbot', status: 'completed' },
          { id: 2, title: 'Connect to Discord', status: 'in_progress' },
          { id: 3, title: 'Create Subscription', status: 'pending' },
          { id: 4, title: 'Provision bot instance', status: 'pending' },
          { id: 5, title: 'Complete setup', status: 'pending' },
        ]);
      } catch (err: any) {
        console.error('OAuth processing error:', err);
        setError(err.message || 'Failed to process authorization');
        setSteps(prev => prev.map(step =>
          step.status === 'in_progress' ? { ...step, status: 'error' as StepStatus } : step
        ));
        setTimeout(() => navigate('/'), 3000);
      }
    };

    processOAuth();
  }, [searchParams, navigate, ctx]);

  const handleCreateSubscription = async () => {
    if (!guildId || !guildInfo?.tier || guildInfo.tier === 'free' || !userId) return;

    // Only starter and pro tiers are supported for subscription creation
    if (guildInfo.tier !== 'starter' && guildInfo.tier !== 'pro') {
      showNotification('error', 'Invalid tier for subscription creation');
      return;
    }

    setIsCreatingSubscription(true);

    try {
      const result = await ctx.createGuildSubscription(
        guildId,
        guildInfo.tier,
        userId,
        `${window.location.origin}/stripe/success`,
        `${window.location.origin}/stripe/cancel`
      );

      // Open Stripe checkout in new tab
      window.open(result.url, '_blank');
      setCheckoutOpened(true);
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        fullError: JSON.stringify(error, null, 2),
      });
      showNotification('error', `Failed to create subscription: ${error.message || 'Unknown error'}`);
    } finally {
      setIsCreatingSubscription(false);
    }
  };

  const getIconBackground = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400 dark:bg-gray-600';
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
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
            {error}
          </p>
          <p className="mt-4 text-xs text-gray-500">
            Redirecting to home...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Guild Info Header - Fixed height to prevent layout shift */}
        <div className="text-center mb-8 h-48">
          {/* Icon container - fixed size */}
          <div className="w-24 h-24 rounded-full mx-auto mb-4">
            {guildInfo && guildId && guildInfo.guildIcon ? (
              <img
                src={`https://cdn.discordapp.com/icons/${guildId}/${guildInfo.guildIcon}.png?size=128`}
                alt={guildInfo.guildName}
                className="w-24 h-24 rounded-full object-cover"
                width="96"
                height="96"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            )}
          </div>

          {/* Title - fixed height */}
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white h-8 leading-8">
            {guildInfo ? guildInfo.guildName : 'Setting up CordBot'}
          </h2>

          {/* Subtitle - fixed height */}
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 h-5 leading-5">
            {guildInfo ? 'Setting up CordBot for your server' : 'Connecting to your Discord server'}
          </p>

          {/* Tier label - fixed height to prevent shift */}
          <div className="mt-1 h-5">
            {guildInfo?.tier && guildInfo.tier !== 'free' && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium leading-5">
                {guildInfo.tier === 'starter' ? 'Starter' : 'Pro'} Tier
              </p>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="flow-root">
          <ul role="list" className="-mb-8">
            {steps.map((step, stepIdx) => {
              const isFreeTier = guildInfo?.tier === 'free';
              const isPaidTier = guildInfo?.tier && guildInfo.tier !== 'free';
              const isSubscriptionStep = step.title === 'Create Subscription';
              const isDisabledStep = isFreeTier && isSubscriptionStep;
              const showSubscribeButton = isPaidTier && isSubscriptionStep && step.status === 'in_progress' && !checkoutOpened;
              const showWaitingText = isPaidTier && isSubscriptionStep && step.status === 'in_progress' && checkoutOpened;

              return (
                <li key={step.id}>
                  <div className="relative pb-8">
                    {stepIdx !== steps.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-white/10"
                      />
                    ) : null}
                    <div className="relative flex space-x-3">
                      <div>
                        <span
                          className={classNames(
                            isDisabledStep ? 'bg-gray-300 dark:bg-gray-700' : getIconBackground(step.status),
                            'flex size-8 items-center justify-center rounded-full ring-8 ring-gray-50 dark:ring-gray-900',
                          )}
                        >
                          {step.status === 'completed' ? (
                            isDisabledStep ? (
                              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
                              </svg>
                            ) : (
                              <CheckIcon aria-hidden="true" className="size-5 text-white" />
                            )
                          ) : step.status === 'in_progress' ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          ) : step.status === 'error' ? (
                            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          ) : (
                            <div className="size-2 rounded-full bg-white" />
                          )}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 items-center h-10">
                        {showSubscribeButton ? (
                          <button
                            onClick={handleCreateSubscription}
                            disabled={isCreatingSubscription}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed h-10"
                          >
                            {isCreatingSubscription ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Opening...</span>
                              </>
                            ) : (
                              <>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                                <span>Create Subscription</span>
                              </>
                            )}
                          </button>
                        ) : showWaitingText ? (
                          <p className="text-sm text-gray-900 dark:text-white font-medium leading-10 h-10">
                            Waiting for subscription...
                          </p>
                        ) : (
                          <p className={classNames(
                            'text-sm leading-10 h-10',
                            isDisabledStep
                              ? 'text-gray-400 dark:text-gray-600'
                              : step.status === 'completed' || step.status === 'in_progress'
                                ? 'text-gray-900 dark:text-white font-medium'
                                : 'text-gray-500 dark:text-gray-400'
                          )}>
                            {step.title}
                            {isDisabledStep && (
                              <span className="ml-2 text-xs">(N/A)</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
