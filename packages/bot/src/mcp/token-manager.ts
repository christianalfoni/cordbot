import fs from 'fs';
import path from 'path';
import { OAuth2Client } from 'google-auth-library';

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope?: string;
  token_type?: string;
}

export interface TokenStorage {
  [serverId: string]: OAuthTokens;
}

export class TokenManager {
  private tokensPath: string;

  constructor(claudeDir: string) {
    this.tokensPath = path.join(claudeDir, 'oauth-tokens.json');
  }

  private ensureFileExists(): void {
    if (!fs.existsSync(this.tokensPath)) {
      const dir = path.dirname(this.tokensPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.tokensPath, '{}', { mode: 0o600 });
    }
  }

  private readTokens(): TokenStorage {
    this.ensureFileExists();
    try {
      const content = fs.readFileSync(this.tokensPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return {};
    }
  }

  private writeTokens(tokens: TokenStorage): void {
    this.ensureFileExists();
    fs.writeFileSync(this.tokensPath, JSON.stringify(tokens, null, 2), {
      mode: 0o600,
    });
  }

  getTokens(serverId: string): OAuthTokens | undefined {
    const tokens = this.readTokens();
    return tokens[serverId];
  }

  saveTokens(serverId: string, tokens: OAuthTokens): void {
    const allTokens = this.readTokens();
    allTokens[serverId] = tokens;
    this.writeTokens(allTokens);
  }

  deleteTokens(serverId: string): void {
    const tokens = this.readTokens();
    delete tokens[serverId];
    this.writeTokens(tokens);
  }

  hasTokens(serverId: string): boolean {
    const tokens = this.getTokens(serverId);
    return !!tokens && !!tokens.access_token && !!tokens.refresh_token;
  }

  isTokenExpired(serverId: string): boolean {
    const tokens = this.getTokens(serverId);
    if (!tokens || !tokens.expiry_date) {
      return true;
    }
    // Token is expired if expiry_date is in the past (with 5 minute buffer)
    return tokens.expiry_date < Date.now() + 5 * 60 * 1000;
  }

  async refreshGoogleToken(
    serverId: string,
    clientId: string,
    clientSecret: string
  ): Promise<OAuthTokens | null> {
    const tokens = this.getTokens(serverId);
    if (!tokens || !tokens.refresh_token) {
      return null;
    }

    try {
      const oauth2Client = new OAuth2Client(clientId, clientSecret);
      oauth2Client.setCredentials({
        refresh_token: tokens.refresh_token,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      const newTokens: OAuthTokens = {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        expiry_date: credentials.expiry_date!,
        scope: credentials.scope || undefined,
        token_type: credentials.token_type || undefined,
      };

      this.saveTokens(serverId, newTokens);
      return newTokens;
    } catch (error) {
      console.error(`Failed to refresh token for ${serverId}:`, error);
      return null;
    }
  }
}
