import { describe, test, expect } from 'bun:test';
import nacl from 'tweetnacl';
import { seal, openEnvelope, isEncryptedEnvelope, bytesToB64, b64ToBytes } from '../cacheEnvelope';

const keyA = bytesToB64(nacl.randomBytes(32));
const keyB = bytesToB64(nacl.randomBytes(32));

describe('cacheEnvelope', () => {
  test('base64 round-trips arbitrary bytes', () => {
    const bytes = nacl.randomBytes(64);
    expect(b64ToBytes(bytesToB64(bytes))).toEqual(bytes);
  });

  test('seal/open round-trips JSON payloads', () => {
    const payload = JSON.stringify({ chats: [{ id: 'c1', name: 'Sam' }], n: 42 });
    const blob = seal(payload, keyA);
    expect(isEncryptedEnvelope(blob)).toBe(true);
    expect(openEnvelope(blob, keyA)).toBe(payload);
  });

  test('wrong key fails closed (null)', () => {
    const blob = seal('secret', keyA);
    expect(openEnvelope(blob, keyB)).toBeNull();
  });

  test('tampered envelope fails closed (null)', () => {
    const blob = seal('secret', keyA);
    const tampered = blob.slice(0, -4) + 'AAAA';
    expect(openEnvelope(blob, keyB)).toBeNull();
    expect(openEnvelope(tampered, keyA)).toBeNull();
  });

  test('non-envelope input is rejected, legacy JSON detectable', () => {
    expect(isEncryptedEnvelope('{"chats":[]}')).toBe(false);
    expect(openEnvelope('{"chats":[]}', keyA)).toBeNull();
    expect(openEnvelope('', keyA)).toBeNull();
  });

  test('seal throws on invalid key length', () => {
    expect(() => seal('x', bytesToB64(new Uint8Array(16)))).toThrow();
  });
});
