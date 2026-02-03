import { useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, TransitionChild } from '@headlessui/react';
import { Bars3Icon, XMarkIcon, HomeIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Link, useLocation } from 'react-router-dom';
import chatBotLogo from '../chat-bot-logo.svg';

interface NavigationProps {
  userPhotoURL?: string | null;
  userDisplayName?: string | null;
  onSignOut: () => void;
  guilds?: Array<{ id: string; guildName: string; guildIcon: string | null }>;
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function Navigation({ userPhotoURL, userDisplayName, onSignOut, guilds = [] }: NavigationProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const navigation = [
    { name: 'Home', href: '/', icon: HomeIcon, current: location.pathname === '/' },
    { name: 'Documentation', href: '/docs', icon: DocumentTextIcon, current: location.pathname === '/docs' },
  ];

  return (
    <>
      {/* Mobile sidebar */}
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button type="button" onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5">
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>

            <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2 dark:bg-gray-900 dark:ring dark:ring-white/10 dark:before:pointer-events-none dark:before:absolute dark:before:inset-0 dark:before:bg-black/10">
              <div className="relative flex h-16 shrink-0 items-center gap-3">
                <img alt="Cordbot" src={chatBotLogo} className="h-8 w-8" />
                <span className="text-lg font-bold text-gray-900 dark:text-white">Cordbot</span>
              </div>
              <nav className="relative flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                  <li>
                    <ul role="list" className="-mx-2 space-y-1">
                      {navigation.map((item) => (
                        <li key={item.name}>
                          <Link
                            to={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={classNames(
                              item.current
                                ? 'bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white'
                                : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
                              'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                            )}
                          >
                            <item.icon
                              aria-hidden="true"
                              className={classNames(
                                item.current
                                  ? 'text-indigo-600 dark:text-white'
                                  : 'text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white',
                                'size-6 shrink-0',
                              )}
                            />
                            {item.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                  {guilds.length > 0 && (
                    <li>
                      <div className="text-xs/6 font-semibold text-gray-400">Your Guilds</div>
                      <ul role="list" className="-mx-2 mt-2 space-y-1">
                        {guilds.map((guild) => (
                          <li key={guild.id}>
                            <Link
                              to={`/guild/${guild.id}`}
                              onClick={() => setSidebarOpen(false)}
                              className={classNames(
                                location.pathname === `/guild/${guild.id}`
                                  ? 'bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white'
                                  : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
                                'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                              )}
                            >
                              {guild.guildIcon ? (
                                <img
                                  src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.guildIcon}.png`}
                                  alt=""
                                  className="size-6 shrink-0 rounded-lg"
                                />
                              ) : (
                                <span
                                  className={classNames(
                                    location.pathname === `/guild/${guild.id}`
                                      ? 'border-indigo-600 text-indigo-600 dark:border-white/20 dark:text-white'
                                      : 'border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600 dark:border-white/10 dark:group-hover:border-white/20 dark:group-hover:text-white',
                                    'flex size-6 shrink-0 items-center justify-center rounded-lg border bg-white text-[0.625rem] font-medium dark:bg-white/5',
                                  )}
                                >
                                  {guild.guildName.charAt(0).toUpperCase()}
                                </span>
                              )}
                              <span className="truncate">{guild.guildName}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )}
                </ul>
              </nav>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col dark:bg-gray-900">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 dark:border-white/10 dark:bg-black/10">
          <div className="flex h-16 shrink-0 items-center gap-3">
            <img alt="Cordbot" src={chatBotLogo} className="h-8 w-8" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">Cordbot</span>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navigation.map((item) => (
                    <li key={item.name}>
                      <Link
                        to={item.href}
                        className={classNames(
                          item.current
                            ? 'bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
                          'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                        )}
                      >
                        <item.icon
                          aria-hidden="true"
                          className={classNames(
                            item.current
                              ? 'text-indigo-600 dark:text-white'
                              : 'text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white',
                            'size-6 shrink-0',
                          )}
                        />
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
              {guilds.length > 0 && (
                <li>
                  <div className="text-xs/6 font-semibold text-gray-400">Your Guilds</div>
                  <ul role="list" className="-mx-2 mt-2 space-y-1">
                    {guilds.map((guild) => (
                      <li key={guild.id}>
                        <Link
                          to={`/guild/${guild.id}`}
                          className={classNames(
                            location.pathname === `/guild/${guild.id}`
                              ? 'bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white'
                              : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
                            'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                          )}
                        >
                          {guild.guildIcon ? (
                            <img
                              src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.guildIcon}.png`}
                              alt=""
                              className="size-6 shrink-0 rounded-lg"
                            />
                          ) : (
                            <span
                              className={classNames(
                                location.pathname === `/guild/${guild.id}`
                                  ? 'border-indigo-600 text-indigo-600 dark:border-white/20 dark:text-white'
                                  : 'border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600 dark:border-white/10 dark:group-hover:border-white/20 dark:group-hover:text-white',
                                'flex size-6 shrink-0 items-center justify-center rounded-lg border bg-white text-[0.625rem] font-medium dark:bg-white/5',
                              )}
                            >
                              {guild.guildName.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="truncate">{guild.guildName}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
              <li className="-mx-6 mt-auto">
                <button
                  onClick={onSignOut}
                  className="flex w-full items-center gap-x-4 px-6 py-3 text-sm/6 font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-white/5"
                >
                  {userPhotoURL ? (
                    <img
                      alt=""
                      src={userPhotoURL}
                      className="size-8 rounded-full bg-gray-50 outline -outline-offset-1 outline-black/5 dark:bg-gray-800 dark:outline-white/10"
                    />
                  ) : (
                    <div className="size-8 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
                      <span className="text-sm font-medium text-white">
                        {userDisplayName?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}
                  <span className="sr-only">Your profile</span>
                  <span aria-hidden="true">{userDisplayName || 'User'}</span>
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-white px-4 py-4 shadow-xs sm:px-6 lg:hidden dark:bg-gray-900 dark:shadow-none dark:after:pointer-events-none dark:after:absolute dark:after:inset-0 dark:after:border-b dark:after:border-white/10 dark:after:bg-black/10">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900 lg:hidden dark:text-gray-400 dark:hover:text-white"
        >
          <span className="sr-only">Open sidebar</span>
          <Bars3Icon aria-hidden="true" className="size-6" />
        </button>
        <div className="flex-1 flex items-center gap-3">
          <img alt="Cordbot" src={chatBotLogo} className="h-6 w-6" />
          <span className="text-sm/6 font-semibold text-gray-900 dark:text-white">Cordbot</span>
        </div>
        <button onClick={onSignOut}>
          <span className="sr-only">Your profile</span>
          {userPhotoURL ? (
            <img
              alt=""
              src={userPhotoURL}
              className="size-8 rounded-full bg-gray-50 outline -outline-offset-1 outline-black/5 dark:bg-gray-800 dark:outline-white/10"
            />
          ) : (
            <div className="size-8 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
              <span className="text-sm font-medium text-white">
                {userDisplayName?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
          )}
        </button>
      </div>
    </>
  );
}
