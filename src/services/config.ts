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
