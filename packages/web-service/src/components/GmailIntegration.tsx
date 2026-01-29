import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useGmailAuth } from '../hooks/useGmailAuth';
import { UserData } from '../hooks/useAuth';

interface GmailIntegrationProps {
  userData: UserData;
}

export function GmailIntegration({ userData }: GmailIntegrationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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
    <div className="space-y-4">
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

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {/* Compact Header - Always Visible */}
        <div className="w-full flex items-center gap-4 p-4">
          {/* Icon */}
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/20">
            <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
              <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
            </svg>
          </div>

          {/* Title + Description - Clickable to expand */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
          >
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Gmail</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">Read and manage email messages</p>
          </button>

          {/* Action Buttons - Right Aligned */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {!isConnected ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  initiateOAuth();
                }}
                disabled={isConnecting}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                {isConnecting ? 'Connecting...' : 'Connect'}
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  disconnect();
                }}
                disabled={isConnecting}
                className="text-sm font-semibold text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            )}

            {/* Chevron - only show if connected */}
            {isConnected && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <svg
                  className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Expandable Content - Tools Only */}
        {isExpanded && isConnected && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            <div className="p-4">
              <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                Available Tools
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* List Messages Tool */}
                <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                  <div className="flex h-5 items-center">
                    <input
                      type="checkbox"
                      checked={listMessagesEnabled}
                      onChange={() => handleToggleTool('list_messages', listMessagesEnabled)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">gmail_list_messages</p>
                      <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-400/30">
                        Read
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">List and search email messages from your inbox</p>
                  </div>
                </label>

                {/* Send Email Tool */}
                <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                  <div className="flex h-5 items-center">
                    <input
                      type="checkbox"
                      checked={sendEmailEnabled}
                      onChange={() => handleToggleTool('send_email', sendEmailEnabled)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">gmail_send_email</p>
                      <span className="inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-700/10 dark:ring-amber-400/30">
                        Write
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Send emails via Gmail (requires user approval)</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
