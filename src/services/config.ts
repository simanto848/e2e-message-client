/**
 * Backend Service Configuration
 *
 * Defaults to the production deployed backend. Override for local dev by
 * setting EXPO_PUBLIC_BACKEND_URL in mobile/.env (see .env.example) — Expo
 * inlines EXPO_PUBLIC_* vars from .env at build time, no native rebuild needed.
 */

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://e2e-message.vercel.app';
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
