import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogPanel } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { UserData } from '../hooks/useAuth';

interface HeaderProps {
  userData: UserData | null;
  onSignOut: () => void;
  onSignIn: () => Promise<void>;
  loading: boolean;
}

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Guilds', href: '/guilds' },
];

export function Header({ userData, onSignOut, onSignIn, loading }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          ) : (
            userData ? (
              <button onClick={onSignOut} className="text-sm/6 font-semibold text-gray-900 dark:text-white">
                Logout <span aria-hidden="true">&rarr;</span>
              </button>
            ) : (
              <button onClick={onSignIn} className="text-sm/6 font-semibold text-gray-900 dark:text-white">
                Login <span aria-hidden="true">&rarr;</span>
              </button>
            )
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
                  <button
                    onClick={onSignOut}
                    className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-white/5 w-full text-left"
                  >
                    Logout
                  </button>
                ) : (
                  <button
                    onClick={onSignIn}
                    className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-white/5 w-full text-left"
                  >
                    Login
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
