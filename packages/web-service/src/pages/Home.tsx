import { useState, useEffect } from 'react';
import { UserData } from '../hooks/useAuth';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/20/solid';
import { Header } from '../components/Header';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface HomeProps {
  userData: UserData | null;
  onSignOut: () => void;
  onSignIn: () => Promise<void>;
  loading: boolean;
}

// Discord OAuth configuration
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || '';
const REDIRECT_URI = import.meta.env.VITE_DISCORD_REDIRECT_URI ||
  `${window.location.origin}/auth/discord/callback`;

const carouselSlides = [
  '@Cord, create a new channel called #game-night and give everyone with the @Members role access',
  '@Cord, what are the current best practices for Discord community moderation in 2026?',
  '@Cord, every Monday at 9am, research AI news and post a summary',
  '@Cord, create a movie night event for Friday at 8pm',
  '@Cord, create a poll asking which game we should play: Minecraft, Valorant, or Among Us',
  '@Cord, remind me what we decided about the tournament rules?',
  '@Cord, find the best budget gaming laptops under $1000 and compare them',
  '@Cord, analyze this spreadsheet and create a summary report',
];

const pricing = {
  tiers: [
    {
      name: 'Open Source',
      id: 'opensource',
      price: '$0',
      description: 'Self-host on your own infrastructure',
      features: ['Unlimited queries', 'Bring Your Own Key'],
      featured: false,
      isOpenSource: true,
      disabled: false,
    },
    {
      name: 'Try for free',
      id: 'free',
      price: '$0',
      description: 'Try CordBot with limited queries',
      features: ['25 total queries'],
      featured: false,
      disabled: false,
    },
    {
      name: 'Starter',
      id: 'starter',
      price: '$19',
      description: 'Perfect for small communities',
      features: ['500 queries/month', 'Dedicated instance', '6 months memory'],
      featured: false,
      disabled: true,
      comingSoon: true,
    },
    {
      name: 'Pro',
      id: 'pro',
      price: '$39',
      description: 'For growing Discord servers',
      features: [
        '1,200 queries/month',
        'Dedicated instance',
        '24 months memory',
        'Extended permissions and skills',
      ],
      featured: true,
      disabled: true,
      comingSoon: true,
    },
  ],
};

export function Home({ userData, onSignOut, onSignIn, loading }: HomeProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [freeTierConfig, setFreeTierConfig] = useState<{
    maxSlots: number;
    usedSlots: number;
    availableSlots: number;
  } | null>(null);

  // Auto-advance carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Fetch free tier config
  useEffect(() => {
    const freeTierRef = doc(db, 'config', 'freeTier');
    const unsubscribe = onSnapshot(freeTierRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setFreeTierConfig({
          maxSlots: data.maxSlots || 0,
          usedSlots: data.usedSlots || 0,
          availableSlots: (data.maxSlots || 0) - (data.usedSlots || 0),
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAddToDiscord = async (tier: 'free' | 'starter' | 'pro') => {
    if (!userData) {
      await onSignIn();
      return;
    }
    // Build Discord OAuth URL with user ID and tier in state parameter
    const state = btoa(JSON.stringify({ userId: userData.id, tier }));
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&permissions=55370986941526&scope=bot%20applications.commands%20guilds&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(state)}`;
    window.location.href = oauthUrl;
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length);
  };

  return (
    <div className="bg-white dark:bg-gray-900">
      <Header userData={userData} onSignOut={onSignOut} onSignIn={onSignIn} loading={loading} />

      <main>
        {/* Pricing section */}
        <div className="bg-white py-12 sm:py-16 dark:bg-gray-900">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-5xl font-semibold tracking-tight text-balance text-gray-900 sm:text-6xl dark:text-white">
                AI Community Bot for Discord
              </p>
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-center text-lg font-medium text-pretty text-gray-600 sm:text-xl/8 dark:text-gray-400">
              Add an AI bot to your Discord server that remembers conversations, answers questions, and helps you manage your community—all with one click.
            </p>

            {/* Carousel */}
            <div className="mx-auto mt-12 max-w-4xl relative px-4">
              <div className="relative min-h-[120px]">
                {carouselSlides.map((message, index) => (
                  <div
                    key={index}
                    className={`absolute inset-0 transition-all duration-500 flex items-center justify-center ${
                      index === currentSlide
                        ? 'opacity-100 translate-x-0'
                        : index < currentSlide
                        ? 'opacity-0 -translate-x-full'
                        : 'opacity-0 translate-x-full'
                    }`}
                  >
                    <p className="text-xl sm:text-2xl md:text-3xl text-center text-gray-900 dark:text-white font-medium leading-relaxed px-4">
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">@Cord</span>
                      {message.substring(5)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center justify-between mt-8">
                <button
                  onClick={prevSlide}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  aria-label="Previous slide"
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>

                {/* Dots */}
                <div className="flex gap-2">
                  {carouselSlides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentSlide(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentSlide
                          ? 'bg-indigo-600 w-8'
                          : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                      }`}
                      aria-label={`Go to slide ${index + 1}`}
                    />
                  ))}
                </div>

                <button
                  onClick={nextSlide}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  aria-label="Next slide"
                >
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-8 lg:max-w-4xl lg:grid-cols-2 xl:max-w-none xl:grid-cols-4">
              {pricing.tiers.map((tier) => (
                <div
                  key={tier.id}
                  data-featured={tier.featured ? 'true' : undefined}
                  className="rounded-3xl p-8 ring-1 ring-gray-200 data-featured:ring-2 data-featured:ring-indigo-600 dark:bg-gray-800/50 dark:ring-white/15 dark:data-featured:ring-indigo-400"
                >
                  <div className="flex items-center justify-between gap-x-4">
                    <h3
                      id={`tier-${tier.id}`}
                      className="text-lg/8 font-semibold text-gray-900 group-data-featured/tier:text-indigo-600 dark:text-white dark:group-data-featured/tier:text-indigo-400"
                    >
                      {tier.name}
                      {tier.id === 'free' && (
                        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                          ({freeTierConfig?.availableSlots ?? 0} {(freeTierConfig?.availableSlots ?? 0) === 1 ? 'seat' : 'seats'})
                        </span>
                      )}
                    </h3>
                  </div>
                  <p className="mt-4 flex items-baseline gap-x-1">
                    <span className="text-4xl font-semibold tracking-tight text-gray-900 dark:text-white">
                      {tier.price}
                    </span>
                    {tier.id !== 'free' && tier.id !== 'opensource' && <span className="text-sm/6 font-semibold text-gray-600 dark:text-gray-400">/month</span>}
                  </p>
                  {tier.isOpenSource ? (
                    <a
                      href="https://github.com/christianalfoni/cordbot"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-describedby={tier.id}
                      className="mt-6 block w-full rounded-md px-3 py-2 text-center text-sm/6 font-semibold text-indigo-600 inset-ring-1 inset-ring-indigo-200 hover:inset-ring-indigo-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-white/10 dark:text-white dark:inset-ring dark:inset-ring-white/5 dark:hover:bg-white/20 dark:hover:inset-ring-white/5 dark:focus-visible:outline-white/75"
                    >
                      View on GitHub
                    </a>
                  ) : tier.comingSoon ? (
                    <button
                      disabled
                      aria-describedby={tier.id}
                      className="mt-6 block w-full rounded-md px-3 py-2 text-center text-sm/6 font-semibold text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400 cursor-not-allowed"
                    >
                      Coming soon
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAddToDiscord(tier.id as 'free' | 'starter' | 'pro')}
                      disabled={loading || (userData && !userData.hostingBetaApproved) || (tier.id === 'free' && freeTierConfig?.availableSlots === 0) || (tier.id === 'free' && userData?.freeTierBotDeployed)}
                      aria-describedby={tier.id}
                      className="mt-6 block w-full rounded-md px-3 py-2 text-center text-sm/6 font-semibold text-white bg-indigo-600 shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {tier.id === 'free' && freeTierConfig?.availableSlots === 0 ? 'No spots available' : tier.id === 'free' && userData?.freeTierBotDeployed ? 'Already deployed' : userData ? 'Add to server' : 'Sign in to add'}
                    </button>
                  )}
                  <ul role="list" className="mt-8 space-y-3 text-sm/6 text-gray-600 dark:text-gray-300">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-x-3">
                        <CheckIcon
                          aria-hidden="true"
                          className="h-6 w-5 flex-none text-indigo-600 dark:text-indigo-400"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
