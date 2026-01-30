import { Link } from 'react-router-dom';

export function Terms() {
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <div className="prose prose-gray dark:prose-invert max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                1. Acceptance of Terms
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                By accessing or using Cordbot ("the Service"), you agree to be bound by these Terms of
                Service. If you do not agree to these terms, do not use the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                2. Description of Service
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Cordbot provides tools and infrastructure for deploying and managing Discord bots powered
                by AI agents. The Service includes:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Web dashboard for bot configuration and management</li>
                <li>Integration with third-party services (Gmail, etc.)</li>
                <li>Self-hosted deployment templates</li>
                <li>Managed cloud hosting (Beta) for running bots 24/7</li>
                <li>Documentation and support resources</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                3. User Obligations
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">As a user of Cordbot, you agree to:</p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Provide accurate and complete information during registration</li>
                <li>Maintain the security of your account credentials</li>
                <li>Comply with Discord's Terms of Service and Community Guidelines</li>
                <li>Comply with the terms of service for all integrated third-party services</li>
                <li>Use the Service only for lawful purposes</li>
                <li>Not use the Service to harass, abuse, or harm others</li>
                <li>Not attempt to gain unauthorized access to the Service or related systems</li>
                <li>Not use the Service to distribute malware, spam, or illegal content</li>
                <li>Not reverse engineer or attempt to extract source code from the Service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                4. Bot Usage and Conduct
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">You are responsible for:</p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>The behavior and actions of your Discord bot</li>
                <li>Ensuring your bot complies with Discord's Bot Developer Terms</li>
                <li>Monitoring your bot's API usage and costs with Anthropic and other services</li>
                <li>Promptly addressing any issues or complaints about your bot</li>
                <li>Keeping your bot's credentials and API keys secure</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                5. Managed Hosting (Beta)
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                The managed hosting feature is currently in beta and subject to the following:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Access requires manual approval by Cordbot administrators</li>
                <li>The Service is provided on a best-effort basis during the beta period</li>
                <li>We may temporarily suspend or restart your hosted bot for maintenance</li>
                <li>Pricing and features may change as we exit the beta phase</li>
                <li>We reserve the right to terminate beta access at any time</li>
                <li>
                  You are responsible for your Anthropic API usage costs when using hosted bots
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                6. Third-Party Services
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Cordbot integrates with third-party services including:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Discord for bot hosting and communication</li>
                <li>Anthropic for AI model access (Claude)</li>
                <li>Google (Gmail, OAuth) for email integration</li>
                <li>Fly.io for managed hosting infrastructure</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                You must comply with each service's terms of service. We are not responsible for the
                availability, functionality, or policies of third-party services.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                7. Intellectual Property
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Cordbot and its original content, features, and functionality are owned by Cordbot and
                protected by international copyright, trademark, and other intellectual property laws.
                You may not copy, modify, distribute, or reverse engineer any part of the Service without
                explicit permission.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                8. Disclaimers and Limitation of Liability
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO
                THE FULLEST EXTENT PERMITTED BY LAW:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>We do not guarantee the Service will be uninterrupted, secure, or error-free</li>
                <li>We are not responsible for bot behavior, API costs, or third-party service issues</li>
                <li>
                  We are not liable for data loss, business interruption, or other damages resulting from
                  use of the Service
                </li>
                <li>You use the Service at your own risk</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                IN NO EVENT SHALL CORDBOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                9. Termination
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                We reserve the right to suspend or terminate your access to the Service at any time for:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Violation of these Terms of Service</li>
                <li>Abusive or harmful behavior</li>
                <li>Extended periods of inactivity</li>
                <li>Any reason we deem necessary to protect the Service or other users</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                You may terminate your account at any time through the dashboard. Upon termination, your
                data will be deleted according to our Privacy Policy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                10. Changes to Terms
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                We may modify these Terms of Service at any time. We will notify users of significant
                changes via email or dashboard notification. Continued use of the Service after changes
                constitutes acceptance of the updated terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                11. Governing Law
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                These Terms shall be governed by and construed in accordance with the laws of the United
                States, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                12. Contact Information
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                For questions about these Terms of Service, please contact us at:
              </p>
              <p className="text-gray-700 dark:text-gray-300 mt-2">
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:legal@cordbot.dev"
                  className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  legal@cordbot.dev
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
