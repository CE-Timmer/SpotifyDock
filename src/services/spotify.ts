import type { PlaybackSnapshot, SpotifyPlaybackState } from "../types/spotify";

const SPOTIFY_AUTH = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1/me/player/currently-playing";
const TOKEN_KEY = "spotify_overlay_tokens";
const VERIFIER_KEY = "spotify_overlay_pkce_verifier";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function getEnv(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv] as string | undefined;
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export function validateSpotifyConfig(): string | null {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
  const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined;

  if (!clientId || !redirectUri) {
    return "Missing VITE_SPOTIFY_CLIENT_ID or VITE_SPOTIFY_REDIRECT_URI in .env";
  }

  const currentOrigin = window.location.origin;
  try {
    const redirectOrigin = new URL(redirectUri).origin;
    if (redirectOrigin !== currentOrigin) {
      return `Redirect URI origin mismatch. .env uses ${redirectOrigin}, app is running on ${currentOrigin}`;
    }
  } catch {
    return "VITE_SPOTIFY_REDIRECT_URI is not a valid URL";
  }

  return null;
}

function createCodeVerifier(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  for (const byte of bytes) result += chars[byte % chars.length];
  return result;
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

function base64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function loadTokens(): StoredTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function saveTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearSpotifySession(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function beginSpotifyLogin(): Promise<void> {
  const configError = validateSpotifyConfig();
  if (configError) throw new Error(configError);

  const clientId = getEnv("VITE_SPOTIFY_CLIENT_ID");
  const redirectUri = getEnv("VITE_SPOTIFY_REDIRECT_URI");
  const verifier = createCodeVerifier();
  const challenge = base64Url(await sha256(verifier));
  localStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "user-read-playback-state user-read-currently-playing",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  window.location.href = `${SPOTIFY_AUTH}?${params.toString()}`;
}

export async function handleSpotifyCallbackIfNeeded(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return false;

  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("PKCE verifier missing");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getEnv("VITE_SPOTIFY_REDIRECT_URI"),
    client_id: getEnv("VITE_SPOTIFY_CLIENT_ID"),
    code_verifier: verifier
  });

  const response = await fetch(SPOTIFY_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) throw new Error("Spotify auth failed");

  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 30) * 1000
  });

  localStorage.removeItem(VERIFIER_KEY);
  window.history.replaceState({}, document.title, window.location.pathname);
  return true;
}

async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: getEnv("VITE_SPOTIFY_CLIENT_ID")
  });

  const response = await fetch(SPOTIFY_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) throw new Error("Unable to refresh Spotify token");
  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const next: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in - 30) * 1000
  };

  saveTokens(next);
  return next;
}

async function getAccessToken(): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  return refreshed.accessToken;
}

export async function getCurrentPlayback(): Promise<PlaybackSnapshot | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const response = await fetch(SPOTIFY_API, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 204) return null;
  if (response.status === 401) {
    clearSpotifySession();
    return null;
  }
  if (!response.ok) throw new Error("Failed to fetch playback state");

  const data = (await response.json()) as SpotifyPlaybackState;
  if (!data.item) return null;

  return {
    trackId: data.item.id,
    title: data.item.name,
    artists: data.item.artists.map((a) => a.name),
    album: data.item.album.name,
    albumCoverUrl: data.item.album.images[0]?.url,
    durationMs: data.item.duration_ms,
    progressMs: data.progress_ms,
    isPlaying: data.is_playing,
    fetchedAt: Date.now()
  };
}
