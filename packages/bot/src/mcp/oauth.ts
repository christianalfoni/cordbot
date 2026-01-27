import http from 'http';
import { URL } from 'url';
import { OAuth2Client } from 'google-auth-library';
import { exec } from 'child_process';
import { getMCPServer } from './registry.js';
import { TokenManager, OAuthTokens } from './token-manager.js';

const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/callback`;
const OAUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export interface OAuthFlowResult {
  success: boolean;
  tokens?: OAuthTokens;
  error?: string;
}

export class OAuthFlow {
  private tokenManager: TokenManager;

  constructor(claudeDir: string) {
    this.tokenManager = new TokenManager(claudeDir);
  }

  async startGoogleOAuthFlow(
    serverId: string,
    clientId: string,
    clientSecret: string
  ): Promise<OAuthFlowResult> {
    const server = getMCPServer(serverId);
    if (!server || !server.oauth) {
      return { success: false, error: 'Invalid MCP server configuration' };
    }

    const oauth2Client = new OAuth2Client(clientId, clientSecret, REDIRECT_URI);

    // Generate authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: server.oauth.scopes,
      prompt: 'consent', // Force consent screen to get refresh token
    });

    console.log('\n🔐 Opening browser for OAuth authorization...');
    console.log('If the browser does not open automatically, visit this URL:');
    console.log(authUrl);
    console.log('');

    // Open browser
    await this.openBrowser(authUrl);

    // Start local server and wait for callback
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        httpServer.close();
        resolve({
          success: false,
          error: 'OAuth flow timed out after 5 minutes',
        });
      }, OAUTH_TIMEOUT);

      const httpServer = http.createServer(async (req, res) => {
        if (!req.url?.startsWith('/oauth/callback')) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }

        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          clearTimeout(timeout);
          httpServer.close();
          this.sendHTMLResponse(
            res,
            '❌ Authorization Denied',
            `<p>OAuth authorization was denied: ${error}</p><p>You can close this window.</p>`
          );
          resolve({
            success: false,
            error: `Authorization denied: ${error}`,
          });
          return;
        }

        if (!code) {
          clearTimeout(timeout);
          httpServer.close();
          this.sendHTMLResponse(
            res,
            '❌ Invalid Callback',
            '<p>No authorization code received.</p><p>You can close this window.</p>'
          );
          resolve({
            success: false,
            error: 'No authorization code received',
          });
          return;
        }

        try {
          // Exchange code for tokens
          const { tokens } = await oauth2Client.getToken(code);

          if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
            throw new Error('Incomplete token response from OAuth server');
          }

          const oauthTokens: OAuthTokens = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date,
            scope: tokens.scope || undefined,
            token_type: tokens.token_type || undefined,
          };

          // Save tokens
          this.tokenManager.saveTokens(serverId, oauthTokens);

          clearTimeout(timeout);
          httpServer.close();
          this.sendHTMLResponse(
            res,
            '✅ Authorization Successful',
            '<p>Gmail MCP Server has been authorized successfully!</p><p>You can close this window and return to the terminal.</p>'
          );
          resolve({
            success: true,
            tokens: oauthTokens,
          });
        } catch (err) {
          clearTimeout(timeout);
          httpServer.close();
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          this.sendHTMLResponse(
            res,
            '❌ Authorization Failed',
            `<p>Failed to exchange authorization code: ${errorMessage}</p><p>You can close this window.</p>`
          );
          resolve({
            success: false,
            error: `Failed to exchange authorization code: ${errorMessage}`,
          });
        }
      });

      httpServer.listen(REDIRECT_PORT, '127.0.0.1', () => {
        console.log(`🌐 Local OAuth server listening on port ${REDIRECT_PORT}`);
        console.log('⏳ Waiting for authorization... (timeout in 5 minutes)\n');
      });

      httpServer.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: `Failed to start local server: ${err.message}`,
        });
      });
    });
  }

  private async openBrowser(url: string): Promise<void> {
    const command =
      process.platform === 'darwin'
        ? `open "${url}"`
        : process.platform === 'win32'
        ? `start "${url}"`
        : `xdg-open "${url}"`;

    return new Promise((resolve) => {
      exec(command, (error) => {
        if (error) {
          console.warn('Could not open browser automatically.');
        }
        resolve();
      });
    });
  }

  private sendHTMLResponse(res: http.ServerResponse, title: string, message: string): void {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 500px;
      text-align: center;
    }
    h1 {
      margin-top: 0;
      font-size: 2rem;
      color: #333;
    }
    p {
      font-size: 1.1rem;
      line-height: 1.6;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    ${message}
  </div>
</body>
</html>
    `;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }
}
