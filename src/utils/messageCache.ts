import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatThread, Message, UserProfile } from '../types';

/**
 * Offline message cache — ciphertext ONLY, never plaintext.
 *
 * Every entry stored here is exactly what the server returned (encrypted
 * payloads, empty text), so at-rest data is useless without the identity
 * private key in SecureStore. Decryption happens at load time through the
 * normal decrypt path, which also means key rotation / mismatch rules apply
 * to cached history identically to live history.
 *
 * Caps: all threads, newest 200 messages per thread. Writes are
 * fire-and-forget; a corrupt entry set parses to empty, never a crash.
 */
const MAX_MSGS_PER_CHAT = 200;

const chatsKey = (uid: string) => `@jaby_cache_chats_${uid}`;
const msgsKey = (uid: string, chatId: string) => `@jaby_cache_msgs_${uid}_${chatId}`;
const profileKey = (uid: string) => `@jaby_cache_profile_${uid}`;

function validThread(t: any): t is ChatThread {
  if (!t || typeof t.id !== 'string' || !t.participant || typeof t.participant.id !== 'string') return false;
  if (t.lastMessage && (!t.lastMessage.encryptedPayload?.ciphertext || !t.lastMessage.encryptedPayload?.iv)) return false;
  return true;
}

function validMessage(m: any): m is Message {
  return !!m && typeof m.id === 'string' && !!m.encryptedPayload?.ciphertext && !!m.encryptedPayload?.iv;
}

export async function saveCachedProfile(uid: string, profile: UserProfile): Promise<void> {
  try {
    const { ...rest } = profile as any;
    delete rest.pinCode;
    await AsyncStorage.setItem(profileKey(uid), JSON.stringify(rest));
  } catch {}
}

export async function loadCachedProfile(uid: string): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(profileKey(uid));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && typeof p.id === 'string' ? (p as UserProfile) : null;
  } catch {
    return null;
  }
}

export async function clearCachedProfile(uid: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([profileKey(uid), chatsKey(uid)]);
  } catch {}
}

/** Wipe every cached trace of a user (sign-out / emergency wipe). */
export async function clearUserCache(uid: string, chatIds: string[]): Promise<void> {
  try {
    const keys = [profileKey(uid), chatsKey(uid), ...chatIds.map(id => msgsKey(uid, id))];
    await AsyncStorage.multiRemove(keys);
  } catch {}
}

export async function saveCachedChats(uid: string, threads: ChatThread[]): Promise<void> {
  try {
    await AsyncStorage.setItem(chatsKey(uid), JSON.stringify(threads.filter(validThread)));
  } catch (err) {
    console.warn('[Cache] Save chats notice:', err);
  }
}

export async function loadCachedChats(uid: string): Promise<ChatThread[]> {
  try {
    const raw = await AsyncStorage.getItem(chatsKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validThread) : [];
  } catch {
    return [];
  }
}

/** Merge raw (ciphertext) messages into the per-chat cache, newest 200 win. */
export async function mergeCachedMessages(uid: string, chatId: string, incoming: Message[]): Promise<void> {
  try {
    const valid = incoming.filter(validMessage);
    if (valid.length === 0) return;
    const prev = await loadCachedMessageList(uid, chatId);
    const byId = new Map(prev.map(m => [m.id, m]));
    for (const m of valid) byId.set(m.id, { ...byId.get(m.id), ...m });
    const merged = Array.from(byId.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_MSGS_PER_CHAT);
    await AsyncStorage.setItem(msgsKey(uid, chatId), JSON.stringify(merged));
  } catch (err) {
    console.warn('[Cache] Merge messages notice:', err);
  }
}

export async function loadCachedMessageList(uid: string, chatId: string): Promise<Message[]> {
  try {
    const raw = await AsyncStorage.getItem(msgsKey(uid, chatId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validMessage) : [];
  } catch {
    return [];
  }
}
