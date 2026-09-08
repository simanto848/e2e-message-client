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

export const OUTBOX_MAX_ENTRIES = 50;
const MAX_ENTRIES = OUTBOX_MAX_ENTRIES;
const keyFor = (userId: string) => `@jaby_outbox_${userId}`;

// ── Durable socket queues (separate from the REST outbox above) ──
// socket.ts keeps two in-RAM queues (chat messages vs call signaling) and
// mirrors each to disk here so a force-kill can't eat queued realtime
// traffic. Each queue is capped at 50 with dead-letter overflow (see below)
// so an unbounded offline session can't grow storage without bound.
export interface QueuedSocketItem {
  event: string;
  payload: any;
  enqueuedAt: number;
  attempts: number;
}

export interface DeadLetterEntry {
  queue: 'message' | 'signal';
  event: string;
  payload: any;
  reason: string;
  droppedAt: number;
}

export const SOCKET_QUEUE_CAP = 50;
const socketMsgKey = (uid: string) => `@jaby_socket_msgq_${uid}`;
const socketSigKey = (uid: string) => `@jaby_socket_sigq_${uid}`;
const deadLetterKey = (uid: string) => `@jaby_socket_dead_${uid}`;

function isValidSocketItem(e: any): e is QueuedSocketItem {
  return !!e && typeof e.event === 'string' && e.payload !== undefined && typeof e.enqueuedAt === 'number';
}

async function loadSealedList<T>(uid: string, key: string, validate: (e: any) => boolean, cap: number): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const text = await openForUser(uid, raw);
    if (!text) return [];
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validate).slice(0, cap) as T[];
  } catch {
    return [];
  }
}

async function saveSealedList(uid: string, key: string, entries: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, await sealForUser(uid, JSON.stringify(entries)));
  } catch (err) {
    logger.warn('Outbox', 'Persist notice:', err);
  }
}

export async function loadSocketMessageQueue(userId: string): Promise<QueuedSocketItem[]> {
  return loadSealedList<QueuedSocketItem>(userId, socketMsgKey(userId), isValidSocketItem, SOCKET_QUEUE_CAP);
}

export async function saveSocketMessageQueue(userId: string, entries: QueuedSocketItem[]): Promise<void> {
  await saveSealedList(userId, socketMsgKey(userId), entries.slice(0, SOCKET_QUEUE_CAP));
}

export async function loadSocketSignalQueue(userId: string): Promise<QueuedSocketItem[]> {
  return loadSealedList<QueuedSocketItem>(userId, socketSigKey(userId), isValidSocketItem, SOCKET_QUEUE_CAP);
}

export async function saveSocketSignalQueue(userId: string, entries: QueuedSocketItem[]): Promise<void> {
  await saveSealedList(userId, socketSigKey(userId), entries.slice(0, SOCKET_QUEUE_CAP));
}

export async function clearSocketQueues(userId: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([socketMsgKey(userId), socketSigKey(userId)]);
  } catch {}
}

export async function loadDeadLetter(userId: string): Promise<DeadLetterEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(deadLetterKey(userId));
    const text = await openForUser(userId, raw);
    if (!text) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as DeadLetterEntry[]).slice(0, SOCKET_QUEUE_CAP) : [];
  } catch {
    return [];
  }
}

export async function appendDeadLetter(userId: string, entry: DeadLetterEntry): Promise<void> {
  try {
    const prev = await loadDeadLetter(userId);
    const next = [...prev, entry].slice(-SOCKET_QUEUE_CAP);
    await saveSealedList(userId, deadLetterKey(userId), next);
  } catch {}
}

export async function clearDeadLetter(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(deadLetterKey(userId));
  } catch {}
}

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

/** Remove a single outbox entry (send success, expiry purge, delete-for-everyone). */
export async function removeOutboxEntry(userId: string, messageId: string): Promise<void> {
  try {
    const prev = await loadOutbox(userId);
    if (!prev.some(e => e.wire.id === messageId)) return;
    await saveOutbox(
      userId,
      prev.filter(e => e.wire.id !== messageId)
    );
  } catch {}
}

/** Remove every queued entry belonging to one chat thread. */
export async function removeOutboxEntriesForChat(userId: string, chatId: string): Promise<void> {
  try {
    const prev = await loadOutbox(userId);
    const next = prev.filter(e => e.wire.chatId !== chatId && e.wire.receiverId !== chatId);
    if (next.length !== prev.length) await saveOutbox(userId, next);
  } catch {}
}
