import { Client, GatewayIntentBits } from 'discord.js';

export interface BotConfig {
  token: string;
  guildId: string;
}

export async function createDiscordClient(config: BotConfig): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Wait for client to be ready
  await new Promise<void>((resolve, reject) => {
    client.once('clientReady', () => {
      console.log(`✅ Discord bot logged in as ${client.user?.tag}`);
      resolve();
    });

    client.once('error', (error) => {
      console.error('❌ Discord client error:', error);
      reject(error);
    });

    // Connect to Discord
    client.login(config.token).catch(reject);
  });

  return client;
}
