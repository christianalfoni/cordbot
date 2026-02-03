import { defineSecret, defineString } from "firebase-functions/params";

/**
 * Shared Discord bot token used by all guild instances
 * This single bot token is provisioned across all Fly.io machines
 */
export const sharedDiscordBotToken = defineSecret("SHARED_DISCORD_BOT_TOKEN");

/**
 * Shared Anthropic API key used by all guild instances
 * This single API key is provisioned across all Fly.io machines
 */
export const sharedAnthropicApiKey = defineSecret("SHARED_ANTHROPIC_API_KEY");

/**
 * Discord OAuth application credentials
 */
export const discordClientId = defineString("DISCORD_CLIENT_ID");
export const discordClientSecret = defineSecret("DISCORD_CLIENT_SECRET");

/**
 * OAuth redirect URI for Discord OAuth flow
 */
export const discordRedirectUri = defineString("DISCORD_REDIRECT_URI");
