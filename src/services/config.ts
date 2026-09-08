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
 * (see .env.example).
 *
 * EXPO_PUBLIC_* rebuild note: Expo inlines EXPO_PUBLIC_* vars at BUILD time
 * (not at runtime). Changing them requires a new build (or an OTA update if
 * the value is read from JS at startup — BACKEND_URL is, so `eas update`
 * suffices for JS-only URL swaps; native TURN credentials baked via
 * app.config.js would need a rebuild). Never assume a .env edit alone
 * repoints a shipped binary.
 *
 * CORS: production server fails fast at boot unless CORS_ORIGIN is set
 * (server/.env.example). If the app can't reach the backend in prod, check
 * CORS_ORIGIN includes your Expo origin first.
 */

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://e2e-message.onrender.com';
export const API_BASE_URL = `${BACKEND_URL}/api`;
export const SOCKET_SERVER_URL = BACKEND_URL;

// Warn in production when the compiled-in fallback is in use (likely a missing
// EXPO_PUBLIC_BACKEND_URL at build time). Dev keeps quiet (localhost .env flow).
if (typeof __DEV__ !== 'undefined' && !__DEV__ && !process.env.EXPO_PUBLIC_BACKEND_URL) {
  console.warn(
    '[config] EXPO_PUBLIC_BACKEND_URL unset at build time — using production fallback ' +
      BACKEND_URL +
      '. Set it in mobile/.env (or EAS env) and rebuild/OTA if this device should point elsewhere.'
  );
}

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
// .env.example. EXPO_PUBLIC_TURN_* are inlined at build time; since
// getIceServers() reads them when a call starts, a JS-only credential rotation
// ships via OTA (`eas update`), no native rebuild needed.
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
