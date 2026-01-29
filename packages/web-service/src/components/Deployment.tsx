export function Deployment() {
  return (
    <div className="space-y-12">
      {/* Introduction */}
      <div>
        <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">
          Deploy to Fly.io
        </h2>
        <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
          Run your Cordbot agent 24/7 in the cloud with Fly.io. Your bot will stay online and respond to Discord messages even when your local machine is off.
        </p>
      </div>

      {/* Prerequisites */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          1. Install Fly CLI
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            First, install the Fly CLI tool for your operating system:
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">macOS</p>
                <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono overflow-x-auto">
brew install flyctl
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Linux / WSL</p>
                <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono overflow-x-auto">
curl -L https://fly.io/install.sh | sh
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Windows (PowerShell)</p>
                <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono overflow-x-auto">
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
                </pre>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-4">
            After installation, authenticate with Fly.io:
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mt-2">
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono">
fly auth signup
            </pre>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Or if you already have an account: <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">fly auth login</code>
          </p>
        </div>
      </div>

      {/* Generate Template */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          2. Generate Deployment Files
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Navigate to your project directory and generate the Fly.io deployment template:
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono">
npx @cordbot/agent --template=fly
            </pre>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-4">
            This creates two files in your directory:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
            <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">fly.toml</code> - Fly.io configuration</li>
            <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">Dockerfile</code> - Container build instructions</li>
          </ul>
        </div>
      </div>

      {/* Create App */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          3. Create Fly.io App
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Create your app on Fly.io (choose a unique name):
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono">
fly apps create your-bot-name
            </pre>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Replace <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">your-bot-name</code> with a unique name for your bot
          </p>
        </div>
      </div>

      {/* Configure Secrets */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          4. Configure Secrets
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Set your bot credentials as encrypted secrets. Get these values from the "Bot Setup" section above:
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono overflow-x-auto">
{`fly secrets set DISCORD_BOT_TOKEN="your_bot_token"
fly secrets set DISCORD_GUILD_ID="your_guild_id"
fly secrets set ANTHROPIC_API_KEY="your_claude_api_key"`}
            </pre>
          </div>
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              💡 Getting Your Values
            </p>
            <ul className="mt-2 space-y-1 text-sm text-blue-800 dark:text-blue-300 list-disc list-inside">
              <li><strong>Bot Token & Guild ID:</strong> Copy from the "Bot Setup" section above</li>
              <li><strong>Claude API Key:</strong> Get from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline">Anthropic Console</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Create Volume */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          5. Create Persistent Volume
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Create a volume to persist your bot's data across restarts:
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono">
fly volumes create workspace --size 1
            </pre>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-4">
            The volume persists:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
            <li>Channel configurations (CLAUDE.md files)</li>
            <li>Scheduled cron jobs (.claude-cron)</li>
            <li>Conversation history and session data</li>
            <li>Files created or edited by Claude</li>
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
            Cost: ~$0.15/month for 1GB. You can expand it later if needed with <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">fly volumes extend</code>
          </p>
        </div>
      </div>

      {/* Deploy */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          6. Deploy Your Bot
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Deploy your bot to Fly.io:
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono">
fly deploy
            </pre>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-4">
            This will:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
            <li>Build a Docker container with your bot</li>
            <li>Deploy it to Fly.io infrastructure</li>
            <li>Start the bot and connect to Discord</li>
            <li>Mount the persistent volume to /workspace</li>
          </ul>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-4">
            Check deployment status with:
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mt-2">
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono">
fly logs
            </pre>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            You should see the bot connecting to Discord and syncing channels
          </p>
        </div>
      </div>

      {/* Management */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Managing Your Deployment
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Common commands for managing your deployed bot:
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">View live logs</p>
                <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono">fly logs</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Check bot status</p>
                <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono">fly status</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">SSH into container</p>
                <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono">fly ssh console</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Stop the bot</p>
                <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono">fly scale count 0</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Start the bot</p>
                <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono">fly scale count 1</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Restart the bot</p>
                <pre className="text-xs text-gray-600 dark:text-gray-400 font-mono">fly apps restart</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Updating */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Updating Your Bot
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            When a new version of Cordbot is released:
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono overflow-x-auto">
{`# Update the version in your Dockerfile
# Change: RUN npm install -g @cordbot/agent@1.3.x
# To:     RUN npm install -g @cordbot/agent@1.4.x

# Then redeploy
fly deploy`}
            </pre>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Your data persists in the volume, so updates are safe and don't lose any configuration or history
          </p>
        </div>
      </div>

      {/* Cost */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          💰 Cost Estimate
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-3">
              Monthly Pricing (approximate)
            </p>
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
              <div className="flex justify-between">
                <span>App (1GB RAM, shared CPU)</span>
                <span className="font-mono">~$5-7/month</span>
              </div>
              <div className="flex justify-between">
                <span>Persistent Volume (1GB)</span>
                <span className="font-mono">~$0.15/month</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-700 font-semibold">
                <span>Total for 24/7 operation</span>
                <span className="font-mono">~$5-7/month</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-blue-700 dark:text-blue-400">
              See <a href="https://fly.io/docs/about/pricing/" target="_blank" rel="noopener noreferrer" className="underline">Fly.io pricing</a> for current rates. Prices may vary by region.
            </p>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          🔧 Troubleshooting
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <div className="space-y-4">
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Bot not starting</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
                <li>Check logs with <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">fly logs</code></li>
                <li>Verify secrets are set: <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">fly secrets list</code></li>
                <li>Ensure volume is created: <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">fly volumes list</code></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Bot crashes or restarts</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
                <li>Check memory usage: <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">fly status</code></li>
                <li>Increase memory in fly.toml if needed (default: 1GB)</li>
                <li>Review error logs for specific issues</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Files not persisting</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
                <li>Verify volume is mounted to /workspace in fly.toml</li>
                <li>Check volume exists and has space: <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">fly volumes list</code></li>
                <li>SSH in and verify files in /workspace: <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">fly ssh console</code></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
