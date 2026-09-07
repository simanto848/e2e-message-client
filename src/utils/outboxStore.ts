import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Message } from '../types';
import { openForUser, sealForUser } from './cacheCrypto';
import { logger } from './logger';

/**
 * Durable offline outbox (per user id, so nothing leaks across accounts).
 *
 * NOTE on plaintext: each entry keeps the display copy (with decrypted text)
 * so the queued message still renders after a restart. That puts plaintext in
 * app-private AsyncStorage instead of only in RAM — a deliberate tradeoff for
 * reliability. Entries are wiped on sign-out / emergency wipe, capped at 50,
 * and deleted individually the moment their send succeeds.
 */
export interface OutboxEntry {
  wire: Message;
  display: Message;
}

const MAX_ENTRIES = 50;
const keyFor = (userId: string) => `@jaby_outbox_${userId}`;

function isValidEntry(e: any): e is OutboxEntry {
  return (
    !!e &&
    !!e.wire && typeof e.wire.id === 'string' && !!e.wire.encryptedPayload?.ciphertext &&
    !!e.display && typeof e.display.id === 'string' && e.display.id === e.wire.id
  );
}

export async function loadOutbox(userId: string): Promise<OutboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    // Sealed envelope (or legacy plaintext passthrough) — see cacheCrypto.
    const text = await openForUser(userId, raw);
    if (!text) return [];
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export async function saveOutbox(userId: string, entries: OutboxEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), await sealForUser(userId, JSON.stringify(entries.slice(0, MAX_ENTRIES))));
  } catch (err) {
    logger.warn('Outbox', 'Persist notice:', err);
  }
}

export async function clearOutbox(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {}
}
