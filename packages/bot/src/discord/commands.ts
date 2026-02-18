import { REST, Routes, SlashCommandBuilder } from 'discord.js';

/**
 * Register Discord application commands (slash commands)
 *
 * Registers the /workspace command to the Discord guild.
 * Uses guild commands for instant updates (good for development).
 *
 * @param token - Discord bot token
 * @param clientId - Discord application/client ID
 * @param guildId - Discord guild ID where commands should be registered
 */
export async function registerCommands(
  token: string,
  clientId: string,
  guildId: string
): Promise<void> {
  const commands = [
    new SlashCommandBuilder()
      .setName('workspace')
      .setDescription('Get a shareable link to browse the workspace in your browser')
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('🔄 Registering Discord slash commands...');

    // Register guild commands (instant updates, good for development)
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log('✅ Successfully registered slash commands');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
    throw error;
  }
}
