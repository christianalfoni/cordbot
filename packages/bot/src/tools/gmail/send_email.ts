import { tool } from '@anthropic-ai/claude-agent-sdk';
import { google } from 'googleapis';
import { z } from 'zod';
import { ToolContext } from '../../service/types.js';

const gmailSendEmailSchema = z.object({
  to: z.string().email().describe('Recipient email address'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Email body content (plain text or HTML)'),
  cc: z.string().email().optional().describe('CC email address (optional)'),
  bcc: z.string().email().optional().describe('BCC email address (optional)')
});

export function createTool(context: ToolContext) {
  return tool(
    'gmail_send_email',
    'Send an email via Gmail. Requires user approval before sending. The email will be sent from the authenticated Gmail account.',
    gmailSendEmailSchema.shape,
    async (params) => {
      // Request permission from user
      const permissionMessage = [
        `Send email to **${params.to}**`,
        params.cc ? `CC: ${params.cc}` : null,
        params.bcc ? `BCC: ${params.bcc}` : null,
        `Subject: "${params.subject}"`,
        `\nBody preview: ${params.body.slice(0, 100)}${params.body.length > 100 ? '...' : ''}`
      ].filter(Boolean).join('\n');

      try {
        await context.requestPermission(permissionMessage);
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Permission denied',
                cancelled: true
              }, null, 2)
            }
          ]
        };
      }

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

        // Compose email in RFC 2822 format
        const emailLines: string[] = [
          `To: ${params.to}`,
          `Subject: ${params.subject}`
        ];

        if (params.cc) {
          emailLines.push(`Cc: ${params.cc}`);
        }

        if (params.bcc) {
          emailLines.push(`Bcc: ${params.bcc}`);
        }

        // Add MIME headers
        emailLines.push('MIME-Version: 1.0');
        emailLines.push('Content-Type: text/plain; charset=utf-8');
        emailLines.push(''); // Empty line separates headers from body
        emailLines.push(params.body);

        const email = emailLines.join('\r\n');

        // Encode email in base64url format
        const encodedEmail = Buffer.from(email)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        // Send email
        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedEmail
          }
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                message: 'Email sent successfully!',
                messageId: response.data.id,
                threadId: response.data.threadId,
                to: params.to,
                subject: params.subject
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Gmail send error:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
                details: error instanceof Error ? error.stack : undefined
              }, null, 2)
            }
          ]
        };
      }
    }
  );
}
