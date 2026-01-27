export interface MCPServer {
  id: string;
  name: string;
  description: string;
  package: string;
  authType: 'oauth2' | 'none';
  oauth?: {
    provider: 'google';
    scopes: string[];
    authUrl: string;
    tokenUrl: string;
  };
}

export const MCP_REGISTRY: Record<string, MCPServer> = {
  gmail: {
    id: 'gmail',
    name: 'Gmail MCP Server',
    description: 'Access Gmail messages, send emails, and manage your inbox',
    package: '@shinzolabs/gmail-mcp',
    authType: 'oauth2',
    oauth: {
      provider: 'google',
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
  },
};

export function getMCPServer(id: string): MCPServer | undefined {
  return MCP_REGISTRY[id];
}

export function listMCPServers(): MCPServer[] {
  return Object.values(MCP_REGISTRY);
}
