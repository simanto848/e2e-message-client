import type { ChatThread } from '../types';

/**
 * True when this contact was verified in the past but the safety number has
 * since changed (either party rotated keys). The server revokes the approval
 * in that case while keeping the old number, so the UI can tell "re-verify"
 * apart from "never verified".
 */
export function isSafetyNumberChanged(chat: Pick<ChatThread, 'safetyNumber' | 'verifiedSafetyNumber'>): boolean {
  if (!chat.verifiedSafetyNumber || !chat.safetyNumber) return false;
  return chat.verifiedSafetyNumber.replace(/\s/g, '') !== chat.safetyNumber.replace(/\s/g, '');
}
