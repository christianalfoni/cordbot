import { tool } from '@anthropic-ai/claude-agent-sdk';
import { google } from 'googleapis';
import { z } from 'zod';
import { ToolContext } from '../../service/types.js';

const gmailListMessagesSchema = z.object({
  maxResults: z.number().min(1).max(100).default(10).optional().describe('Max messages to return (1-100)'),
  query: z.string().optional().describe('Gmail search query (e.g., "from:example@gmail.com", "subject:meeting", "is:unread")')
});

export function createTool(context: ToolContext) {
  return tool(
    'gmail_list_messages',
    'List email messages from Gmail inbox with optional search query and filters',
    gmailListMessagesSchema.shape,
    async (params) => {
      // Get fresh token from token manager
      const tokenData = await context.getToken('gmail');

      if (!tokenData) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Gmail token unavailable. Please reconnect Gmail in the dashboard.',
                requiresReauth: true
              }, null, 2)
            }
          ]
        };
      }

      try {
        // Initialize Gmail API with fresh token
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: tokenData.accessToken });
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // List messages
        const listResponse = await gmail.users.messages.list({
          userId: 'me',
          maxResults: Math.min(params.maxResults || 10, 100),
          q: params.query
        });

        if (!listResponse.data.messages?.length) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ messages: [], message: 'No messages found.' }, null, 2)
              }
            ]
          };
        }

        // Fetch message details
        const messages = await Promise.all(
          listResponse.data.messages.map(async (msg) => {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id!,
              format: 'metadata',
              metadataHeaders: ['Subject', 'From', 'Date']
            });

            const headers = detail.data.payload?.headers || [];
            const getHeader = (name: string) =>
              headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

            return {
              id: msg.id,
              subject: getHeader('Subject'),
              from: getHeader('From'),
              date: getHeader('Date'),
              snippet: detail.data.snippet || ''
            };
          })
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ messages, totalResults: messages.length }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Gmail API error:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Failed to list Gmail messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }, null, 2)
            }
          ]
        };
      }
    }
  );
}
