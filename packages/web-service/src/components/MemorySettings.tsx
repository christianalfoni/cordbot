import { useState } from 'react';
import { UserData } from '../hooks/useAuth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface MemorySettingsProps {
  userData: UserData;
}

export function MemorySettings({ userData }: MemorySettingsProps) {
  const currentMemorySize = userData.memoryContextSize || 10000;

  const [memoryContextSize, setMemoryContextSize] = useState(currentMemorySize);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const userRef = doc(db, 'users', userData.id);
      // Update self-hosted bot's memory context size
      await updateDoc(userRef, { memoryContextSize });

      setSaveMessage({ type: 'success', text: 'Memory settings saved successfully!' });
    } catch (error) {
      console.error('Error saving memory settings:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save memory settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanged = memoryContextSize !== currentMemorySize;

  // Calculate estimated cost impact
  const costMultiplier = memoryContextSize / 10000;
  const estimatedCostIncrease = ((costMultiplier - 1) * 100).toFixed(0);

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
        Memory Settings
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Control the token budget for the bot's long-term memory system. This determines how much historical context
        (compressed conversations, summaries, learnings) can be loaded. Higher values provide richer context but increase API costs.
      </p>

      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Memory Context Size
            </label>
            <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
              {memoryContextSize.toLocaleString()} tokens
            </span>
          </div>

          <input
            type="range"
            min="5000"
            max="50000"
            step="1000"
            value={memoryContextSize}
            onChange={(e) => setMemoryContextSize(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-indigo-600"
          />

          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>5k</span>
            <span>25k</span>
            <span>50k</span>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-md p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Estimated cost impact:</span>
            <span className={`font-medium ${
              costMultiplier > 1
                ? 'text-orange-600 dark:text-orange-400'
                : costMultiplier < 1
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-700 dark:text-gray-300'
            }`}>
              {costMultiplier > 1 ? '+' : ''}{estimatedCostIncrease}%
            </span>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {memoryContextSize <= 10000 && "Recommended for most use cases. Provides recent messages plus compressed historical context."}
            {memoryContextSize > 10000 && memoryContextSize <= 25000 && "Extended memory for long-running projects. Includes more daily/weekly summaries. Moderate cost increase."}
            {memoryContextSize > 25000 && "Maximum long-term memory. Includes extensive historical summaries and learnings. Significant cost increase."}
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          <div>
            {saveMessage && (
              <p className={`text-sm ${
                saveMessage.type === 'success'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {saveMessage.text}
              </p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!hasChanged || isSaving}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">How Long-Term Memory Works</h4>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 mt-0.5">•</span>
            <span>Recent messages are kept with full detail for immediate context</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 mt-0.5">•</span>
            <span>Older conversations are compressed into daily summaries to preserve key information</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 mt-0.5">•</span>
            <span>Weekly, monthly, and yearly summaries create a hierarchical long-term memory</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-500 mt-0.5">•</span>
            <span>Memory is loaded working backwards, filling the token budget with as much history as possible</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
