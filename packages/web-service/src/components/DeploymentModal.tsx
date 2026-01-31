import { useState } from 'react';

interface DeploymentModalProps {
  onClose: () => void;
  onDeploy: (anthropicApiKey: string, memoryContextSize: number, region: string) => Promise<void>;
  botName: string;
}

export function DeploymentModal({ onClose, onDeploy, botName }: DeploymentModalProps) {
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [memoryContextSize, setMemoryContextSize] = useState(10000);
  const [region, setRegion] = useState('sjc');
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fly.io regions
  const regions = [
    { code: 'sjc', name: 'San Jose, California (US West)', flag: '🇺🇸' },
    { code: 'iad', name: 'Ashburn, Virginia (US East)', flag: '🇺🇸' },
    { code: 'lhr', name: 'London, United Kingdom', flag: '🇬🇧' },
    { code: 'ams', name: 'Amsterdam, Netherlands', flag: '🇳🇱' },
    { code: 'fra', name: 'Frankfurt, Germany', flag: '🇩🇪' },
    { code: 'syd', name: 'Sydney, Australia', flag: '🇦🇺' },
    { code: 'nrt', name: 'Tokyo, Japan', flag: '🇯🇵' },
    { code: 'gru', name: 'São Paulo, Brazil', flag: '🇧🇷' },
    { code: 'sin', name: 'Singapore', flag: '🇸🇬' },
  ];

  const handleDeploy = async () => {
    if (!anthropicApiKey.trim()) {
      setError('Anthropic API key is required');
      return;
    }

    setIsDeploying(true);
    setError(null);

    try {
      await onDeploy(anthropicApiKey.trim(), memoryContextSize, region);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to deploy bot');
      setIsDeploying(false);
    }
  };

  // Calculate estimated cost impact
  const costMultiplier = memoryContextSize / 10000;
  const estimatedCostIncrease = ((costMultiplier - 1) * 100).toFixed(0);

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Deploy {botName} to Fly.io
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Configure your bot's deployment settings. Your API key is encrypted and stored securely.
          </p>

          <div className="space-y-6">
            {/* Anthropic API Key */}
            <div>
              <label htmlFor="api-key" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Anthropic API Key <span className="text-red-500">*</span>
              </label>
              <input
                id="api-key"
                type="password"
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
                disabled={isDeploying}
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Get your API key from{' '}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>

            {/* Region Selection */}
            <div>
              <label htmlFor="region" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Deployment Region
              </label>
              <select
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={isDeploying}
                className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
              >
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.flag} {r.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Choose a region close to your Discord server's primary location for best performance.
              </p>
            </div>

            {/* Memory Context Size */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
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
                disabled={isDeploying}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-indigo-600"
              />

              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>5k</span>
                <span>25k</span>
                <span>50k</span>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-md p-3 mt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Cost impact:</span>
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

              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Controls the token budget for the long-term memory system. Higher values allow more historical context (summaries, conversations, learnings) to be included in each request.
              </p>
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
            disabled={isDeploying}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDeploy}
            disabled={isDeploying || !anthropicApiKey.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {isDeploying ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Deploying...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Deploy to Fly.io
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
