import { Link } from 'react-router-dom';

export function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Home
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <div className="prose prose-gray dark:prose-invert max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                1. Information We Collect
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                When you use Cordbot, we collect the following information:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>
                  <strong>Account Information:</strong> Your Discord user ID, username, email address,
                  and profile photo when you sign in with Discord.
                </li>
                <li>
                  <strong>Bot Configuration:</strong> Your Discord bot token and guild (server) ID to
                  connect your bot.
                </li>
                <li>
                  <strong>Service Integrations:</strong> OAuth tokens and connection data for services
                  you connect (such as Gmail), stored securely in your user profile.
                </li>
                <li>
                  <strong>Hosted Bot Data:</strong> If you use managed hosting, we store your bot's
                  configuration, deployment region, and operational status.
                </li>
                <li>
                  <strong>Usage Data:</strong> Service logs and error reports to maintain and improve
                  the platform.
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                2. How We Use Your Information
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">We use your information to:</p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Provide and operate the Cordbot service</li>
                <li>Authenticate your Discord bot and enable tool integrations</li>
                <li>Deploy and manage your hosted bot instances</li>
                <li>Send service notifications and support messages</li>
                <li>Improve and debug the platform</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                3. Data Storage and Security
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Your data is stored securely using industry-standard practices:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>
                  <strong>Firestore Database:</strong> User profiles and configuration are stored in
                  Google Cloud Firestore with encryption at rest.
                </li>
                <li>
                  <strong>Secret Manager:</strong> Sensitive credentials (API keys, OAuth tokens) are
                  stored in Google Cloud Secret Manager with strict access controls.
                </li>
                <li>
                  <strong>Fly.io Infrastructure:</strong> Hosted bots run on Fly.io with isolated
                  environments and encrypted secrets.
                </li>
                <li>
                  <strong>Access Control:</strong> Your data is only accessible to you and necessary
                  system operations.
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                4. Data Sharing
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                We do not sell or share your personal information with third parties, except:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>
                  <strong>Service Providers:</strong> Google Cloud (Firebase, Firestore) and Fly.io for
                  infrastructure hosting.
                </li>
                <li>
                  <strong>Third-Party Services:</strong> When you explicitly connect services (Gmail,
                  etc.), your OAuth tokens enable your bot to act on your behalf.
                </li>
                <li>
                  <strong>Legal Requirements:</strong> When required by law or to protect our rights.
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                5. Your Rights
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">You have the right to:</p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Access your personal data stored in our systems</li>
                <li>Correct inaccurate data through your dashboard</li>
                <li>Delete your account and all associated data</li>
                <li>Disconnect service integrations at any time</li>
                <li>Export your bot configuration</li>
                <li>Object to data processing for marketing purposes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                6. Data Retention
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                We retain your data for as long as your account is active. When you delete your account:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Your user profile and configuration are permanently deleted</li>
                <li>Connected service tokens are revoked and removed</li>
                <li>Hosted bot instances are destroyed along with their data</li>
                <li>Service logs may be retained for up to 90 days for security and compliance</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                7. Cookies and Tracking
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                We use cookies and similar technologies for:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Authentication and session management</li>
                <li>Storing user preferences (theme, settings)</li>
                <li>Basic analytics to improve the service</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                We do not use tracking cookies for advertising purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                8. Changes to This Policy
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                We may update this Privacy Policy from time to time. We will notify you of significant
                changes by email or through the dashboard. Continued use of Cordbot after changes
                constitutes acceptance of the updated policy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                9. Contact Us
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                If you have questions about this Privacy Policy or your data, please contact us at:
              </p>
              <p className="text-gray-700 dark:text-gray-300 mt-2">
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:privacy@cordbot.dev"
                  className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  privacy@cordbot.dev
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
