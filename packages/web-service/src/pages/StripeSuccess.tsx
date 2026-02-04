import { useEffect } from 'react';

export function StripeSuccess() {
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
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
          <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Subscription Created!
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Closing window...
        </p>
      </div>
    </div>
  );
}
