/**
 * Backend Service Configuration
 * Configured with the production deployed backend URL.
 */

export const BACKEND_URL = 'https://e2e-message.vercel.app';
export const API_BASE_URL = 'https://e2e-message.vercel.app/api';
export const SOCKET_SERVER_URL = 'https://e2e-message.vercel.app';

export function getBackendBaseUrl(): string {
  return BACKEND_URL;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function getSocketServerUrl(): string {
  return SOCKET_SERVER_URL;
}
