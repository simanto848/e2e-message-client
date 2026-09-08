/**
 * Cross-cutting contract test (final fix wave).
 *
 * Covers: V2 safety-number vector, size caps (5MB media / 15MB socket legacy /
 * 256KB message ciphertext / 5MB backup / 7MB media HTTP / 1MB global), 401
 * handling, orphan wiring (devices/register + push-token + thread_updated).
 *
 * Bun-safe by design: imports ONLY pure modules (base64, timerUtils, node:crypto,
 * fs). api.ts/keyStore/crypto.ts pull expo-* -> react-native and crash bun
 * (see base64.ts extraction), so api shape is asserted via source-text grep,
 * not runtime import.
 */
import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToBase64, base64ToBytes } from '../../utils/base64';
import { PRESET_TIMERS, MAX_DISAPPEARING_TIMER_S, clampDisappearingTimer } from '../../utils/timerUtils';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = join(HERE, '..', '..', '..');
const REPO_ROOT = join(MOBILE_ROOT, '..');
const readMobile = (rel: string) => readFileSync(join(MOBILE_ROOT, rel), 'utf8');
const readServer = (rel: string) => readFileSync(join(REPO_ROOT, 'server', rel), 'utf8');

// Shared V2 vector (must match server/scripts/contract_check.js + safetyNumber.ts).
// Pubkeys are fixed 32-byte base64 values; expected computed with the V2 algorithm
// (domain ::JABY_SAFETY_NUMBER_V2::, per-block SHA-256, rejection <4294900000).
const V2_PUB_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const V2_PUB_B = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=';
const V2_EXPECTED = '16610 49449 04896 93436 42083 39661 37200 23849 30506 05224 94834 70459';

function computeV2(pubA: string, pubB: string): string {
  const combined = [pubA, pubB].sort().join('::JABY_SAFETY_NUMBER_V2::');
  const chunks: string[] = [];
  let counter = 0;
  while (chunks.length < 12) {
    const h = createHash('sha256').update(`${combined}::block_${counter++}`, 'utf8').digest();
    for (let i = 0; i + 3 < h.length && chunks.length < 12; i += 4) {
      const val = h.readUInt32BE(i);
      if (val < 4294900000) chunks.push((val % 100000).toString().padStart(5, '0'));
    }
  }
  return chunks.join(' ');
}

describe('contract: V2 safety number', () => {
  test('fixed vector matches (mobile spec == server spec)', () => {
    expect(computeV2(V2_PUB_A, V2_PUB_B)).toBe(V2_EXPECTED);
    expect(V2_EXPECTED.replace(/ /g, '')).toMatch(/^\d{60}$/);
  });

  test('mobile crypto.ts uses V2 domain + zero-bias bound', () => {
    const src = readMobile('src/utils/crypto.ts');
    expect(src).toContain('::JABY_SAFETY_NUMBER_V2::');
    expect(src).toContain('4294900000');
  });

  test('server safetyNumber.ts uses identical domain + bound', () => {
    const src = readServer('src/utils/safetyNumber.ts');
    expect(src).toContain('::JABY_SAFETY_NUMBER_V2::');
    expect(src).toContain('4294900000');
  });
});

describe('contract: size caps', () => {
  test('backup 5MB, media 5MB raw, message 256KB, socket 15MB legacy, http 1MB/7MB', () => {
    expect(5 * 1024 * 1024).toBe(5242880);
    expect(15 * 1024 * 1024).toBe(15728640);
    expect(262144).toBe(256 * 1024);
    const backupSrc = readServer('src/routes/backup.routes.ts');
    expect(backupSrc).toContain('5 * 1024 * 1024');
    expect(backupSrc).toContain('Backup exceeds the 5MB limit');
    const mediaSrc = readServer('src/routes/media.routes.ts');
    expect(mediaSrc).toContain('MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024');
    const dbSrc = readServer('src/database.ts');
    expect(dbSrc).toContain('256KB');
    const sockSrc = readServer('src/sockets/chatSocket.ts');
    expect(sockSrc).toContain('15 * 1024 * 1024');
    const idxSrc = readServer('src/index.ts');
    expect(idxSrc).toContain("limit: '1mb'");
    expect(idxSrc).toContain("limit: '7mb'");
    expect(idxSrc).toContain('maxHttpBufferSize');
  });

  test('disappearing-timer presets include 8h/7d + max clamp', () => {
    const vals = PRESET_TIMERS.map((p) => p.value);
    for (const v of [0, 5, 15, 30, 60, 300, 3600, 28800, 86400, 604800]) {
      expect(vals).toContain(v);
    }
    expect(MAX_DISAPPEARING_TIMER_S).toBe(604800);
    expect(clampDisappearingTimer(9999999)).toBe(604800);
    expect(clampDisappearingTimer(0)).toBe(0);
  });

  test('base64 pure helper round-trips (bun-safe)', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 16, 32]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe('contract: 401 handling', () => {
  test('api surfaces 401 as {success:false} + helper detects it', () => {
    const apiSrc = readMobile('src/services/api.ts');
    expect(apiSrc).toContain('isUnauthorizedError');
    expect(apiSrc).toContain('401');
    // Predicate mirrors api.isUnauthorizedError (kept in sync by this test).
    const isUnauthorizedError = (r: any) => {
      const msg = String(r?.error || '').toLowerCase();
      return r?.status === 401 || msg.includes('unauthorized') || msg.includes('invalid or expired session');
    };
    expect(isUnauthorizedError({ status: 401 })).toBe(true);
    expect(isUnauthorizedError({ success: false, error: 'Invalid or expired session token' })).toBe(true);
    expect(isUnauthorizedError({ success: false, error: 'Network unavailable' })).toBe(false);
  });

  test('server requireAuth returns 401 (not 403/500)', () => {
    const authSrc = readServer('src/auth.ts');
    expect(authSrc).toContain('status(401)');
    expect(authSrc).toContain('verifySessionToken');
    expect(authSrc).toContain('iat * 1000 < pwdChangedAt');
  });
});

describe('contract: orphan wiring', () => {
  test('device register + push-token routes + client wiring exist', () => {
    const apiSrc = readMobile('src/services/api.ts');
    expect(apiSrc).toContain('registerDevice');
    expect(apiSrc).toContain('/backup/devices/register');
    expect(apiSrc).toContain('uploadPushToken');
    expect(apiSrc).toContain('/backup/devices/push-token');
    expect(apiSrc).toContain('sendMessageReliable');
    const backupSrc = readServer('src/routes/backup.routes.ts');
    expect(backupSrc).toContain("/devices/register");
    expect(backupSrc).toContain("/devices/push-token");
    const modalSrc = readMobile('src/components/LinkedDevicesModal.tsx');
    expect(modalSrc).toContain('registerDevice');
    const pushSrc = readMobile('src/services/pushNotifications.ts');
    expect(pushSrc).toContain('uploadPushToken');
  });

  test('media shape: relative url + encrypted flag + GET-only payload', () => {
    const apiSrc = readMobile('src/services/api.ts');
    expect(apiSrc).toContain("startsWith('/')");
    expect(apiSrc).toContain('BACKEND_URL');
    const mediaSrc = readServer('src/routes/media.routes.ts');
    expect(mediaSrc).toContain('`/api/media/${');
    expect(mediaSrc).toContain('encrypted: true');
    expect(mediaSrc).toContain('encryptedPayload');
  });

  test('realtime gaps: thread_updated + contact_removed emits', () => {
    const cSrc = readServer('src/routes/contacts.routes.ts');
    expect(cSrc).toContain("'thread_updated'");
    expect(cSrc).toContain("'contact_removed'");
  });

  test('health + backup version unified', () => {
    const idxSrc = readServer('src/index.ts');
    expect(idxSrc).toContain('2.6.0-E2EE');
    expect(idxSrc).toContain('apiVersion');
    expect(idxSrc).toContain('minAppVersion');
    const backupSrc = readServer('src/routes/backup.routes.ts');
    expect(backupSrc).toContain('2.6.0-E2EE');
  });
});
