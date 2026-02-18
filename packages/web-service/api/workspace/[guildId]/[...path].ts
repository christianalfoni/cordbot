/**
 * Vercel Edge Function — proxies workspace API requests to the correct Fly.io machine.
 *
 * Route: /api/workspace/{guildId}/{...path}
 * Proxies to: http://{appName}.fly.dev/api/workspace/{...path}
 *
 * appName is derived deterministically from guildId — no Firestore lookup needed.
 * Edge runtime handles SSE streaming natively.
 */

export const config = { runtime: 'edge' };

function getAppName(guildId: string): string {
  const guildPrefix = guildId.substring(0, 12).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `cordbot-guild-${guildPrefix}`;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Path: /api/workspace/{guildId}/{...rest}
  // pathParts: ['api', 'workspace', guildId, ...rest]
  const guildId = pathParts[2];
  const restPath = pathParts.slice(3).join('/');

  if (!guildId || !restPath) {
    return new Response('Not found', { status: 404 });
  }

  const appName = getAppName(guildId);
  const targetUrl = `http://${appName}.fly.dev/api/workspace/${restPath}${url.search}`;

  // Forward headers, set the correct host
  const headers = new Headers(req.headers);
  headers.set('host', `${appName}.fly.dev`);

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null;

  const proxyRes = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
  } as RequestInit);

  // Return the proxied response — body is streamed, so SSE works natively
  return new Response(proxyRes.body, {
    status: proxyRes.status,
    headers: proxyRes.headers,
  });
}
