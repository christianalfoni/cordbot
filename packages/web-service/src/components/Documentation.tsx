const whatIsCordbot = [
  {
    id: 1,
    title: 'Cloud-Deployed AI Agent',
    description: (
      <>
        Cordbot deploys a{' '}
        <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
          Claude
        </a>{' '}
        agent on a{' '}
        <a href="https://fly.io" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
          Fly.io
        </a>{' '}
        machine that runs 24/7, providing continuous AI assistance to your Discord community
      </>
    ),
  },
  {
    id: 2,
    title: 'Server Observer',
    description: 'The bot observes all conversations across your Discord server, building long-term memory of discussions, decisions, and project context',
  },
  {
    id: 3,
    title: 'Community Assistant',
    description: (
      <>
        Helps your community by answering questions, providing information, and assisting with tasks using the full power of{' '}
        <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
          Claude
        </a>
      </>
    ),
  },
  {
    id: 4,
    title: 'Autonomous Operation',
    description: 'Runs independently on dedicated infrastructure, ensuring reliable availability and consistent performance for your server',
  },
]

const basicCapabilities = [
  {
    id: 1,
    title: 'Web Search',
    description: 'Search the web for current information and lookup online resources',
  },
  {
    id: 2,
    title: 'File Operations',
    description: 'Read, write, edit, and manage files in the workspace',
  },
  {
    id: 3,
    title: 'Image Analysis',
    description: 'View and analyze images attached to Discord messages',
  },
  {
    id: 4,
    title: 'Conversation Memory',
    description: 'Access and recall information from previous conversations observed in Discord channels',
  },
  {
    id: 5,
    title: 'Workspace Management',
    description: 'Each Discord channel has its own dedicated folder in the workspace for organizing files and work',
  },
  {
    id: 6,
    title: 'Scheduled Tasks',
    description: 'Configure autonomous tasks that run on a schedule using cron jobs',
  },
]

const discordCapabilities = [
  {
    id: 1,
    title: 'Thread Management',
    description: 'Create, archive, and manage Discord threads for organizing conversations',
  },
  {
    id: 2,
    title: 'Message Operations',
    description: 'Send, edit, delete messages, and handle file attachments in channels and threads',
  },
  {
    id: 3,
    title: 'Channel Management',
    description: 'Create, update, and delete channels with permission checks for server organization',
  },
  {
    id: 4,
    title: 'Member Management',
    description: 'View member information, manage roles, and perform moderation actions with appropriate permissions',
  },
  {
    id: 5,
    title: 'Role Management',
    description: 'Create roles, assign them to members, and manage role permissions for access control',
  },
  {
    id: 6,
    title: 'Scheduled Events',
    description: 'Create and manage Discord scheduled events for meetings and community activities',
  },
  {
    id: 7,
    title: 'Polls',
    description: 'Create polls with multiple options for gathering community feedback and making decisions',
  },
  {
    id: 8,
    title: 'Forum Channels',
    description: 'Create forum channels and posts with tags for organized community discussions',
  },
]

const openSource = [
  {
    id: 1,
    title: 'Fully Open Source',
    description: 'The entire Cordbot project is open source, allowing anyone to inspect, modify, and improve the code',
  },
  {
    id: 2,
    title: 'Self-Hosted Deployment',
    description: 'Deploy Cordbot on your own infrastructure or self-hosted machines for complete control over your bot',
  },
  {
    id: 3,
    title: 'Free with Your API Key',
    description: (
      <>
        Bring your own{' '}
        <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
          Claude API key
        </a>{' '}
        and use Cordbot completely free, paying only for your API usage
      </>
    ),
  },
  {
    id: 4,
    title: 'Community Collaboration',
    description: 'Open source enables the community to collaborate, share improvements, and collectively build a more useful bot',
  },
  {
    id: 5,
    title: 'Transparency & Trust',
    description: 'When AI integrates with your community, transparency is crucial. Open source code ensures you know exactly what the bot does',
  },
  {
    id: 6,
    title: 'Customization Freedom',
    description: 'Modify the bot to fit your specific needs, add custom features, or contribute improvements back to the project',
  },
]

export function Documentation() {
  return (
    <div className="bg-white dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24 lg:px-8">
        {/* What is Cordbot Section */}
        <div>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
              What is Cordbot
            </h2>
            <p className="mt-6 text-base/7 text-gray-600 dark:text-gray-400">
              An AI-powered Discord bot that deploys a Claude agent to help your community
            </p>
          </div>
          <div className="mt-20">
            <dl className="space-y-16 sm:grid sm:grid-cols-2 sm:space-y-0 sm:gap-x-6 sm:gap-y-16 lg:gap-x-10">
              {whatIsCordbot.map((item) => (
                <div key={item.id}>
                  <dt className="text-base/7 font-semibold text-gray-900 dark:text-white">{item.title}</dt>
                  <dd className="mt-2 text-base/7 text-gray-600 dark:text-gray-400">
                    {typeof item.description === 'string' ? item.description : item.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Basic Capabilities Section */}
        <div className="mt-32">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
              Basic Capabilities
            </h2>
            <p className="mt-6 text-base/7 text-gray-600 dark:text-gray-400">
              Core AI capabilities that Claude provides to assist your community
            </p>
          </div>
          <div className="mt-20">
            <dl className="space-y-16 sm:grid sm:grid-cols-2 sm:space-y-0 sm:gap-x-6 sm:gap-y-16 lg:gap-x-10">
              {basicCapabilities.map((capability) => (
                <div key={capability.id}>
                  <dt className="text-base/7 font-semibold text-gray-900 dark:text-white">{capability.title}</dt>
                  <dd className="mt-2 text-base/7 text-gray-600 dark:text-gray-400">{capability.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Discord API Capabilities Section */}
        <div className="mt-32">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
              Discord Capabilities
            </h2>
            <p className="mt-6 text-base/7 text-gray-600 dark:text-gray-400">
              Discord-specific features for managing and enhancing your server
            </p>
          </div>
          <div className="mt-20">
            <dl className="space-y-16 sm:grid sm:grid-cols-2 sm:space-y-0 sm:gap-x-6 sm:gap-y-16 lg:gap-x-10">
              {discordCapabilities.map((capability) => (
                <div key={capability.id}>
                  <dt className="text-base/7 font-semibold text-gray-900 dark:text-white">{capability.title}</dt>
                  <dd className="mt-2 text-base/7 text-gray-600 dark:text-gray-400">{capability.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Open Source Section */}
        <div className="mt-32">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
              Open Source
            </h2>
            <p className="mt-6 text-base/7 text-gray-600 dark:text-gray-400">
              Built transparently by the community, for the community
            </p>
          </div>
          <div className="mt-20">
            <dl className="space-y-16 sm:grid sm:grid-cols-2 sm:space-y-0 sm:gap-x-6 sm:gap-y-16 lg:gap-x-10">
              {openSource.map((item) => (
                <div key={item.id}>
                  <dt className="text-base/7 font-semibold text-gray-900 dark:text-white">{item.title}</dt>
                  <dd className="mt-2 text-base/7 text-gray-600 dark:text-gray-400">
                    {typeof item.description === 'string' ? item.description : item.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
