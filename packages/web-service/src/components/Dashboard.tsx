import { useState } from 'react';
import { Dialog, DialogPanel } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/20/solid';
import {
  BellIcon,
  BookOpenIcon,
  CloudArrowUpIcon,
  Cog6ToothIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { UserData } from '../hooks/useAuth';
import { BotSetup } from './BotSetup';
import { GmailIntegration } from './GmailIntegration';
import { Documentation } from './Documentation';
import { HostingBetaApply } from './HostingBetaApply';
import { HostedBotDashboard } from './HostedBotDashboard';
import { Link, useLocation } from 'react-router-dom';
import chatBotLogo from '../chat-bot-logo.svg';

interface DashboardProps {
  userData: UserData;
  onSignOut: () => Promise<void>;
}

const navigation: Array<{ name: string; href: string; current: boolean }> = [];

const secondaryNavigation = [
  { name: 'Bot Setup', href: '/bot-setup', icon: Cog6ToothIcon, section: 'bot-setup' },
  { name: 'Service Integrations', href: '/integrations', icon: LinkIcon, section: 'integrations' },
  { name: 'Hosting', href: '/hosting', icon: CloudArrowUpIcon, section: 'hosting' },
  { name: 'Documentation', href: '/docs', icon: BookOpenIcon, section: 'docs' },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function Dashboard({ userData, onSignOut }: DashboardProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Determine current section from URL path
  const currentSection = location.pathname.substring(1);

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-50 flex h-16 border-b border-gray-900/10 dark:border-white/10 dark:bg-black/10">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex flex-1 items-center gap-x-6">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="-m-3 p-3 md:hidden"
            >
              <span className="sr-only">Open main menu</span>
              <Bars3Icon aria-hidden="true" className="size-5 text-gray-900 dark:text-white" />
            </button>
            <div className="flex items-center gap-3">
              <img src={chatBotLogo} alt="Cordbot" className="h-16 w-16" />
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">Cordbot</h1>
              </div>
            </div>
          </div>
          {navigation.length > 0 && (
            <nav className="hidden md:flex md:gap-x-11 md:text-sm/6 md:font-semibold md:text-gray-700 dark:md:text-gray-300">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className={classNames(
                    item.current ? 'text-indigo-600 dark:text-indigo-400' : '',
                    'hover:text-indigo-600 dark:hover:text-indigo-400'
                  )}
                >
                  {item.name}
                </a>
              ))}
            </nav>
          )}
          <div className="flex flex-1 items-center justify-end gap-x-8">
            <button
              type="button"
              className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500 dark:text-gray-400 dark:hover:text-white"
            >
              <span className="sr-only">View notifications</span>
              <BellIcon aria-hidden="true" className="size-6" />
            </button>
            <div className="flex items-center gap-3">
              {userData.photoURL && (
                <img
                  alt={userData.displayName || 'User'}
                  src={userData.photoURL}
                  className="size-8 rounded-full bg-gray-100 outline -outline-offset-1 outline-black/5 dark:bg-gray-800 dark:outline-white/10"
                />
              )}
              <button
                onClick={onSignOut}
                className="hidden sm:block text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
        <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
          <div className="fixed inset-0 z-50" />
          <DialogPanel className="fixed inset-y-0 left-0 z-50 w-full overflow-y-auto bg-white px-4 pb-6 sm:max-w-sm sm:px-6 sm:ring-1 sm:ring-gray-900/10 dark:bg-gray-900 dark:before:pointer-events-none dark:before:absolute dark:before:inset-0 dark:before:bg-black/10 dark:sm:ring-white/10">
            <div className="relative -ml-0.5 flex h-16 items-center gap-x-6">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="-m-2.5 p-2.5 text-gray-700 dark:text-gray-400"
              >
                <span className="sr-only">Close menu</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
              <div className="-ml-0.5 flex items-center gap-3">
                <img src={chatBotLogo} alt="Cordbot" className="h-16 w-16" />
                <span className="text-lg font-bold text-gray-900 dark:text-white">Cordbot</span>
              </div>
            </div>
            {navigation.length > 0 && (
              <div className="mt-2 space-y-2">
                {navigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-white/5"
                  >
                    {item.name}
                  </a>
                ))}
              </div>
            )}
          </DialogPanel>
        </Dialog>
      </header>

      <div className="mx-auto max-w-7xl pt-16 lg:flex lg:gap-x-16 lg:px-8">
        <h1 className="sr-only">Dashboard</h1>

        <aside className="flex overflow-x-auto border-b border-gray-900/5 py-4 lg:block lg:w-64 lg:flex-none lg:border-0 lg:py-20 dark:border-white/10">
          <nav className="flex-none px-4 sm:px-6 lg:px-0">
            <ul role="list" className="flex gap-x-3 gap-y-1 whitespace-nowrap lg:flex-col">
              {secondaryNavigation.map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={classNames(
                      currentSection === item.section
                        ? 'bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white',
                      'group flex gap-x-3 rounded-md py-2 pr-3 pl-2 text-sm/6 font-semibold'
                    )}
                  >
                    <item.icon
                      aria-hidden="true"
                      className={classNames(
                        currentSection === item.section
                          ? 'text-indigo-600 dark:text-white'
                          : 'text-gray-400 group-hover:text-indigo-600 dark:text-gray-500 dark:group-hover:text-white',
                        'size-6 shrink-0'
                      )}
                    />
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className="px-4 py-16 sm:px-6 lg:flex-auto lg:px-0 lg:py-20">
          <div className="mx-auto max-w-2xl space-y-16 sm:space-y-20 lg:mx-0 lg:max-w-none">
            {currentSection === 'bot-setup' && (
              <div>
                <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">Bot Setup</h2>
                <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
                  Configure your Discord bot to work with the Cordbot agent.
                </p>

                <div className="mt-6">
                  <BotSetup
                    userId={userData.id}
                    initialToken={userData.botToken}
                    initialGuildId={userData.guildId}
                  />
                </div>
              </div>
            )}

            {currentSection === 'integrations' && (
              <div>
                <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">
                  Service Integrations
                </h2>
                <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
                  Connect services to enable tools in your bot. All tools and OAuth tokens are stored in your
                  profile.
                </p>

                <div className="mt-6">
                  <GmailIntegration userData={userData} />
                </div>
              </div>
            )}

            {currentSection === 'hosting' && (
              <div>
                <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">
                  Managed Hosting
                </h2>
                <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
                  Run your bot 24/7 in the cloud with managed hosting.
                </p>

                <div className="mt-6">
                  {!userData.hostingBetaApproved ? (
                    <HostingBetaApply userData={userData} />
                  ) : (
                    <HostedBotDashboard userData={userData} />
                  )}
                </div>
              </div>
            )}

            {currentSection === 'docs' && <Documentation />}
          </div>

          <footer className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center gap-6 text-xs text-gray-500 dark:text-gray-400">
              <Link to="/terms" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                Terms of Service
              </Link>
              <span>•</span>
              <Link to="/privacy" className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                Privacy Policy
              </Link>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}
