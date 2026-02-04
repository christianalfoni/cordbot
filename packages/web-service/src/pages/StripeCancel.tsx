import { useEffect } from 'react';

export function StripeCancel() {
  useEffect(() => {
    // Close the window after a short delay to show the message
    const timer = setTimeout(() => {
      window.close();
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
          <svg className="h-8 w-8 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Subscription Cancelled
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Closing window...
        </p>
      </div>
    </div>
  );
}
