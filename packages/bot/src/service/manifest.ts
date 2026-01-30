import { ToolManifest } from "./types.js";

export async function fetchManifest(
  botToken: string,
  serviceUrl: string
): Promise<ToolManifest | null> {
  try {
    const response = await fetch(`${serviceUrl}/getBotManifest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { botToken },
      }),
    });

    if (!response.ok) {
      console.error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (data.result?.error) {
      console.error(`Manifest error: ${data.result.error}`);
      return null;
    }

    return data.result as ToolManifest;
  } catch (error) {
    console.error('Error fetching manifest:', error);
    return null;
  }
}

export async function refreshToken(
  botToken: string,
  serviceUrl: string,
  category: string
): Promise<{ accessToken: string; expiresAt: number } | null> {
  try {
    const response = await fetch(`${serviceUrl}/refreshToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { botToken, category },
      }),
    });

    if (!response.ok) {
      console.error(`Failed to refresh token for ${category}: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (data.result?.error) {
      console.error(`Token refresh error: ${data.result.error}`);
      return null;
    }

    return data.result as { accessToken: string; expiresAt: number };
  } catch (error) {
    console.error(`Error refreshing token for ${category}:`, error);
    return null;
  }
}
