/**
 * Backend Service Configuration
 *
 * Defaults to the production deployed backend on Render — NOT Vercel.
 * Vercel serverless functions can't hold the persistent connection
 * Socket.IO needs, so real-time messaging and call signaling silently don't
 * work there. Render runs this as a real persistent Node process, so both
 * work correctly (verified with live register/login + real-time message +
 * call-signal round trips against this exact URL).
 *
 * Override for local dev by setting EXPO_PUBLIC_BACKEND_URL in mobile/.env
 * (see .env.example) — Expo inlines EXPO_PUBLIC_* vars from .env at build
 * time, no native rebuild needed.
 */

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://e2e-message.onrender.com';
export const API_BASE_URL = `${BACKEND_URL}/api`;
export const SOCKET_SERVER_URL = BACKEND_URL;

export function getBackendBaseUrl(): string {
  return BACKEND_URL;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function getSocketServerUrl(): string {
  return SOCKET_SERVER_URL;
}

export interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

// Fallback ICE servers. NOTE: the OpenRelay entries below use the public
// community credentials, which Metered has been throttling/requiring accounts
// for — treat them as a last resort. In practice, an emulator (10.0.2.x NAT)
// calling a phone (carrier NAT) can almost never connect peer-to-peer, so a
// working TURN relay is mandatory for audio to flow at all. Bring your own
// (self-hosted coturn or Metered free 5GB plan) via mobile/.env — see
// .env.example. Expo inlines EXPO_PUBLIC_* at build time, no rebuild needed
// for JS, but these are read when a call starts so an OTA update suffices.
const FALLBACK_ICE_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:5349?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export function getIceServers(): IceServerConfig[] {
  const raw = (process.env.EXPO_PUBLIC_TURN_URLS || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (raw.length === 0) return FALLBACK_ICE_SERVERS;
  const username = process.env.EXPO_PUBLIC_TURN_USERNAME || undefined;
  const credential = process.env.EXPO_PUBLIC_TURN_CREDENTIAL || undefined;
  const stun: IceServerConfig[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turn: IceServerConfig[] = raw.map((urls: string) =>
    username ? { urls, username, credential } : { urls }
  );
  return [...stun, ...turn];
}
