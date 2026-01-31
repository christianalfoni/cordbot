export function Documentation() {
  return (
    <div className="space-y-12">
      {/* Introduction */}
      <div>
        <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">
          How Cordbot Works
        </h2>
        <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">
          Cordbot is a directory-based Discord bot that syncs channels to local folders and maintains persistent AI conversations.
        </p>
      </div>

      {/* Channels */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          📁 Channels
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300">
            When you run <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">cordbot</code> in a directory,
            it syncs Discord channels to local folders. Each synced channel becomes a folder in your project directory.
          </p>

          <div className="mt-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-mono">Directory structure:</p>
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono">
{`my-project/
├── CLAUDE.md                 # Root instructions
├── general/                  # #general channel
│   ├── CLAUDE.md            # Channel context
│   ├── .claude-cron         # Scheduled jobs
│   └── ... (your files)
└── backend/                  # #backend channel
    ├── CLAUDE.md
    └── ... (your files)`}
            </pre>
          </div>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            The <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">CLAUDE.md</code> file
            in each channel folder provides context to Claude about that specific channel. Use it to describe the
            purpose of the channel, coding conventions, or any relevant information.
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          💬 Messages
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300">
            Simply message the bot in any synced Discord channel to start a conversation. The bot will automatically
            create a thread for the conversation.
          </p>

          <div className="mt-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Example:</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">You:</span>
                <span className="text-gray-700 dark:text-gray-300">Hey Claude, what's the latest commit?</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                [Bot creates thread: "You: Hey Claude, what's the latest..."]
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-semibold">Claude:</span>
                <span className="text-gray-700 dark:text-gray-300">The latest commit is "fix auth flow" (abc123) from 2 hours ago.</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            Claude has access to the files in the channel's directory and can read, write, and execute commands.
            The working directory for each conversation is the channel's folder.
          </p>
        </div>
      </div>

      {/* File Attachments */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          📎 File Attachments
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300">
            You can send files to Claude by attaching them to Discord messages, and Claude can share files back with you.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Sending Files to Claude</p>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">
                Simply attach files to your Discord message (images, code, documents, etc.). The bot will:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside ml-4">
                <li>Automatically download attachments to the channel folder</li>
                <li>Make files available for Claude to read, edit, and process</li>
                <li>Overwrite existing files with the same name</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Receiving Files from Claude</p>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">
                Claude can use the <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">shareFile</code> tool
                to send files back to you. Files are attached to Discord after Claude's response completes.
              </p>
            </div>
          </div>

          <div className="mt-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Example:</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">You:</span>
                <span className="text-gray-700 dark:text-gray-300">[Attach config.json] "Can you increase the timeout?"</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-mono text-xs">📄 Read:</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs">config.json</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-mono text-xs">✏️ Edit:</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs">config.json</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-mono text-xs">📎 shareFile:</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs">config.json</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-semibold">Claude:</span>
                <span className="text-gray-700 dark:text-gray-300">I've updated the timeout to 30 seconds.</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                [Discord attachment: config.json]
              </div>
            </div>
          </div>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            This works with any file type: images, code files, documents, spreadsheets, diagrams, and more.
          </p>
        </div>
      </div>

      {/* Threads */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          🧵 Threads
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300">
            Each Discord thread maintains a persistent Claude session. This means Claude remembers the entire
            conversation history and can reference previous messages, decisions, and changes.
          </p>

          <div className="mt-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Example thread conversation:</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">You:</span>
                <span className="text-gray-700 dark:text-gray-300">Can you explain the auth changes?</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-semibold">Claude:</span>
                <span className="text-gray-700 dark:text-gray-300">That commit fixed the JWT validation logic...</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">You:</span>
                <span className="text-gray-700 dark:text-gray-300">Can you run the tests?</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-mono text-xs">bash:</span>
                <span className="text-gray-700 dark:text-gray-300 text-xs font-mono">npm test</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-semibold">Claude:</span>
                <span className="text-gray-700 dark:text-gray-300">All tests passed! ✓ 23 tests</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            Sessions are stored locally in the <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">.claude/</code> directory
            and persist across bot restarts. You can archive inactive threads after a configurable number of days.
          </p>
        </div>
      </div>

      {/* Memory System */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          💾 Long-Term Memory
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300">
            Cordbot features an intelligent hierarchical memory system that provides long-term context across all conversations in a channel.
            This allows Claude to remember and reference past discussions, decisions, and learnings even after thread sessions end.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">How It Works</p>
              <ol className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-300 list-decimal list-inside ml-4">
                <li><strong>Real-time Capture:</strong> Final responses from each conversation are automatically captured</li>
                <li><strong>Daily Compression:</strong> At midnight, raw messages are compressed into concise daily summaries using Claude</li>
                <li><strong>Hierarchical Compression:</strong> Daily summaries are progressively compressed into weekly, monthly, and yearly summaries</li>
              </ol>
            </div>

            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Memory Loading</p>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">
                Before each query, memories are loaded working backwards from most recent to oldest until the token budget is reached:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside ml-4">
                <li>Today's raw messages (full detail)</li>
                <li>Recent daily summaries</li>
                <li>Weekly summaries</li>
                <li>Monthly summaries</li>
                <li>Yearly summaries</li>
              </ul>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Memory structure per channel:</p>
              <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono overflow-x-auto">
{`.claude/memories/[channel-id]/
  raw/
    2026-01-31.jsonl      # Today's conversations
  daily/
    2026-01-31.md         # Daily summaries
  weekly/
    2026-W04.md           # Weekly summaries
  monthly/
    2026-01.md            # Monthly summaries
  yearly/
    2026.md               # Yearly summaries`}
              </pre>
            </div>

            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Configuration</p>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">
                Control the memory depth in the <strong>Memory Settings</strong> section:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside ml-4">
                <li><strong>5,000-10,000 tokens:</strong> Recommended for most use cases (recent conversations + key summaries)</li>
                <li><strong>10,000-25,000 tokens:</strong> Extended memory for long-running projects</li>
                <li><strong>25,000-100,000 tokens:</strong> Maximum long-term memory with extensive historical context</li>
              </ul>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-2">
                Higher values increase API costs but provide richer historical context for Claude to draw upon.
              </p>
            </div>
          </div>

          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              💡 Why This Matters
            </p>
            <p className="mt-1 text-sm text-blue-800 dark:text-blue-300">
              Unlike standard chat sessions that forget past conversations, Cordbot's memory system allows Claude to:
              reference decisions from weeks ago, recall bug fixes and their outcomes, remember project architecture and patterns,
              and maintain continuity across unlimited conversations.
            </p>
          </div>
        </div>
      </div>

      {/* Cron Jobs */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          ⏰ Scheduled Jobs (Cron)
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300">
            Configure autonomous scheduled tasks using <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">.claude-cron</code> files
            in each channel folder. Claude will execute these tasks automatically on the specified schedule.
          </p>

          <div className="mt-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Example .claude-cron file:</p>
            <pre className="text-xs text-gray-700 dark:text-gray-300 font-mono overflow-x-auto">
{`jobs:
  - name: "Daily summary"
    schedule: "0 9 * * *"
    task: "Summarize recent git commits and post to channel"
    postTo: "thread"

  - name: "Weekly report"
    schedule: "0 9 * * 1"
    task: "Generate weekly progress report"
    postTo: "channel"`}
            </pre>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Schedule Format</p>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">
                Uses standard cron format: <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">minute hour day month weekday</code>
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
                <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">0 9 * * *</code> - Daily at 9:00 AM</li>
                <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">*/30 * * * *</code> - Every 30 minutes</li>
                <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">0 0 * * 0</code> - Weekly on Sunday at midnight</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Post Destinations</p>
              <ul className="mt-1 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
                <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">postTo: "channel"</code> - Posts result as a new message in the channel</li>
                <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">postTo: "thread"</code> - Creates or continues a thread for the job</li>
              </ul>
            </div>
          </div>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            Cron files are watched for changes and automatically reloaded. You can also manage jobs programmatically
            using the built-in cron management tools that Claude has access to.
          </p>
        </div>
      </div>

      {/* Service Integrations */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          🔌 Service Integrations
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-600 dark:text-gray-300">
            Connect external services in the "Service Integrations" section to give Claude access to additional tools.
            When you connect a service (like Gmail), the bot automatically receives tools to interact with that service.
          </p>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            For example, connecting Gmail gives Claude tools to:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300 list-disc list-inside">
            <li>List and search emails</li>
            <li>Read email contents</li>
            <li>Send emails on your behalf</li>
          </ul>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            All OAuth tokens are securely stored and refreshed automatically. The bot fetches available tools
            when it starts based on your connected services.
          </p>
        </div>
      </div>

      {/* Getting Started */}
      <div className="border-t border-gray-200 dark:border-white/10 pt-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          🚀 Getting Started
        </h3>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ol className="space-y-3 text-sm text-gray-600 dark:text-gray-300 list-decimal list-inside">
            <li>
              Complete the "Bot Setup" to configure your Discord bot token and server
              <div className="mt-2 ml-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-xs font-medium text-yellow-900 dark:text-yellow-200 mb-1">
                  Important: Enable Privileged Gateway Intents
                </p>
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  In the Discord Developer Portal, go to Bot → Privileged Gateway Intents and enable "MESSAGE CONTENT INTENT".
                  Without this, your bot will fail to connect.
                </p>
              </div>
            </li>
            <li>Navigate to the workspace directory you want to give the agent and run <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">npx @cordbot/agent</code></li>
            <li>The bot will sync your Discord channels to folders</li>
            <li>Message the bot in Discord to start a conversation</li>
            <li>Optionally, add <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">.claude-cron</code> files to schedule autonomous tasks</li>
          </ol>

          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
              ⚠️ Security Warning
            </p>
            <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-300">
              Cordbot runs with full system access (dangerous mode). It can read/write files, execute commands,
              and make network requests. Only use in trusted environments with controlled Discord access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
