import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

interface CreateBotModalProps {
  onClose: () => void;
  userId?: string;
}

export function CreateBotModal({ onClose }: CreateBotModalProps) {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [botName, setBotName] = useState('');
  const [mode, setMode] = useState<'personal' | 'shared'>('personal');

  const handleCreate = async () => {
    if (!botName.trim()) {
      setError('Bot name is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Create bot document without provisioning
      const createBotDocument = httpsCallable(functions, 'createBotDocument');
      const result: any = await createBotDocument({
        botName: botName.trim(),
        mode,
      });

      // Navigate to the new bot's page for onboarding
      if (result.data.botId) {
        navigate(`/bot/${result.data.botId}`);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create bot');
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Create New Bot
          </h3>

          <div className="space-y-4">
            <div>
              <label htmlFor="bot-name" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Bot Name
              </label>
              <input
                id="bot-name"
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder="e.g., My Personal Bot"
                className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Choose a name to help you identify this bot
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-3">
                Mode
              </label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setMode('personal')}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    mode === 'personal'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">👤</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">Personal Mode</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Responds to all messages. Best for private servers.
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('shared')}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    mode === 'shared'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">👥</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">Shared Mode</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Only responds when @mentioned. Best for shared servers.
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 flex items-center justify-end gap-3 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !botName.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Bot
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
