import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogPanel, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { UserData } from '../hooks/useAuth';
import { AppContext } from '../context/context';
import { ConfirmationOptions } from '../context/ConfirmationContext';
import { NotificationType } from '../context/NotificationContext';

interface HeaderProps {
  userData: UserData | null;
  onSignOut: () => void;
  onSignIn: () => Promise<void>;
  loading: boolean;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  ctx: AppContext;
  showNotification: (type: NotificationType, message: string) => void;
}

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Guilds', href: '/guilds' },
];

export function Header({ userData, onSignOut, onSignIn, loading, confirm, ctx, showNotification }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleDeleteAccount = async () => {
    const confirmed = await confirm({
      title: 'Delete Account',
      message: 'This will permanently delete your account, cancel all active subscriptions, and remove all bots. This action cannot be undone.',
      confirmText: 'Delete Account',
      isDangerous: true,
    });

    if (confirmed) {
      try {
        await ctx.deleteAccount();
        showNotification('success', 'Account successfully deleted');
      } catch (error) {
        console.error('Failed to delete account:', error);
        showNotification('error', 'Failed to delete account. Please try again.');
      }
    }
  };

  return (
    <header>
      <nav aria-label="Global" className="mx-auto flex max-w-7xl items-center justify-between p-6 lg:px-8">
        <div className="flex lg:flex-1 items-center gap-3">
          <Link to="/" className="-m-1.5 p-1.5">
            <span className="text-xl font-bold text-gray-900 dark:text-white">Cordbot</span>
          </Link>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700 dark:text-gray-200"
          >
            <span className="sr-only">Open main menu</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>
        </div>
        <div className="hidden lg:flex lg:gap-x-12">
          {navigation.map((item) => (
            <Link key={item.name} to={item.href} className="text-sm/6 font-semibold text-gray-900 dark:text-white">
              {item.name}
            </Link>
          ))}
        </div>
        <div className="hidden lg:flex lg:flex-1 lg:justify-end">
          {loading ? (
            <div className="size-9 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
          ) : userData ? (
            <Menu as="div" className="relative">
              <MenuButton className="flex items-center">
                <span className="sr-only">Open user menu</span>
                {userData.photoURL ? (
                  <img
                    src={userData.photoURL}
                    alt=""
                    className="size-9 rounded-full bg-gray-50 outline -outline-offset-1 outline-black/5 dark:bg-gray-800 dark:outline-white/10"
                  />
                ) : (
                  <div className="size-9 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
                    <span className="text-sm font-medium text-white">
                      {userData.displayName?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
              </MenuButton>
              <MenuItems
                transition
                className="absolute right-0 z-10 mt-2 w-48 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg outline-1 outline-black/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:divide-white/10 dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10"
              >
                <div className="py-1">
                  <MenuItem>
                    {({ focus }) => (
                      <button
                        onClick={handleDeleteAccount}
                        className={`group flex w-full items-center px-4 py-2 text-sm text-red-700 dark:text-red-400 ${
                          focus ? 'bg-gray-100 dark:bg-white/5' : ''
                        }`}
                      >
                        Delete account
                      </button>
                    )}
                  </MenuItem>
                </div>
                <div className="py-1">
                  <MenuItem>
                    {({ focus }) => (
                      <button
                        onClick={onSignOut}
                        className={`group flex w-full items-center px-4 py-2 text-sm ${
                          focus
                            ? 'bg-gray-100 text-gray-900 dark:bg-white/5 dark:text-white'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        Sign out
                      </button>
                    )}
                  </MenuItem>
                </div>
              </MenuItems>
            </Menu>
          ) : (
            <button
              onClick={onSignIn}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400"
            >
              Sign in
            </button>
          )}
        </div>
      </nav>
      <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
        <div className="fixed inset-0 z-50" />
        <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white p-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10 dark:bg-gray-900 dark:sm:ring-gray-100/10">
          <div className="flex items-center justify-between">
            <Link to="/" className="-m-1.5 p-1.5">
              <span className="text-xl font-bold text-gray-900 dark:text-white">Cordbot</span>
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="-m-2.5 rounded-md p-2.5 text-gray-700 dark:text-gray-200"
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-gray-500/10 dark:divide-white/10">
              <div className="space-y-2 py-6">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-white/5"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
              <div className="py-6">
                {loading ? (
                  <div className="-mx-3 px-3 py-2.5">
                    <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  </div>
                ) : userData ? (
                  <>
                    <button
                      onClick={handleDeleteAccount}
                      className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-red-600 hover:bg-gray-50 dark:text-red-400 dark:hover:bg-white/5 w-full text-left"
                    >
                      Delete Account
                    </button>
                    <button
                      onClick={onSignOut}
                      className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-white/5 w-full text-left"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onSignIn}
                    className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-white/5 w-full text-left"
                  >
                    Sign in
                  </button>
                )}
              </div>
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  );
}
