import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useGmailAuth } from '../hooks/useGmailAuth';
import { UserData } from '../hooks/useAuth';

interface GmailIntegrationProps {
  userData: UserData;
}

export function GmailIntegration({ userData }: GmailIntegrationProps) {
  const { initiateOAuth, disconnect, isConnecting, error } = useGmailAuth(userData.id);

  const gmailConnection = userData.oauthConnections?.gmail;
  const isConnected = !!gmailConnection;

  // Tool states - check if tool name is in the gmail array
  const gmailTools = userData.toolsConfig?.gmail ?? [];
  const listMessagesEnabled = gmailTools.includes('list_messages');
  const sendEmailEnabled = gmailTools.includes('send_email');

  const handleToggleTool = async (toolName: string, currentEnabled: boolean) => {
    if (!isConnected) return;

    const userRef = doc(db, 'users', userData.id);

    // Get current gmail tools array
    const currentGmailTools = userData.toolsConfig?.gmail ?? [];

    // Toggle the tool in the array
    const updatedTools = currentEnabled
      ? currentGmailTools.filter(t => t !== toolName) // Remove if currently enabled
      : [...currentGmailTools, toolName]; // Add if currently disabled

    await updateDoc(userRef, {
      'toolsConfig.gmail': updatedTools,
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
        {/* Gmail Connection Status */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/20">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Gmail</h4>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Read and manage email messages
              </p>

              {!isConnected ? (
                <div className="mt-4">
                  <button
                    onClick={initiateOAuth}
                    disabled={isConnecting}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    {isConnecting ? 'Connecting...' : 'Connect Gmail'}
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-medium text-green-900 dark:text-green-200">Connected</span>
                    </div>
                    <p className="mt-1 text-xs text-green-700 dark:text-green-300 truncate">{gmailConnection.email}</p>
                  </div>
                  <button
                    onClick={disconnect}
                    disabled={isConnecting}
                    className="text-sm font-semibold text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isConnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Available Tools */}
        <div className="p-6">
          <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Available Tools</h5>

          {!isConnected ? (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Connect Gmail to enable tools</p>
            </div>
          ) : (
            <ul role="list" className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {/* List Messages Tool */}
              <li>
                <label className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                  <div className="flex h-6 items-center">
                    <input
                      type="checkbox"
                      checked={listMessagesEnabled}
                      onChange={() => handleToggleTool('list_messages', listMessagesEnabled)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">gmail_list_messages</p>
                      <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-400/30">
                        Read
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">List and search email messages from your inbox</p>
                  </div>
                </label>
              </li>

              {/* Send Email Tool */}
              <li>
                <label className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                  <div className="flex h-6 items-center">
                    <input
                      type="checkbox"
                      checked={sendEmailEnabled}
                      onChange={() => handleToggleTool('send_email', sendEmailEnabled)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">gmail_send_email</p>
                      <span className="inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-900/30 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-700/10 dark:ring-amber-400/30">
                        Write
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Send emails via Gmail (requires user approval)</p>
                  </div>
                </label>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
