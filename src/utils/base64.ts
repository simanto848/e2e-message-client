/**
 * Pure base64 helpers — zero native/RN dependencies.
 *
 * Extracted from crypto.ts so unit tests (bun/node) can import base64 without
 * pulling expo-crypto -> react-native (which crashes bun with 'Unexpected typeof').
 * Single source of truth: crypto.ts and cacheEnvelope.ts both import from here
 * and re-export for backwards compat. Do NOT duplicate B64 loops elsewhere.
 *
 * base64ToBytes is whitespace-tolerant by design (strips anything outside the
 * base64 alphabet) so PEM/MIME-wrapped keys still decode.
 */
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : NaN;
    const b3 = i < bytes.length ? bytes[i++] : NaN;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    let enc3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    let enc4 = isNaN(b3) ? 64 : b3 & 63;

    if (isNaN(b2)) {
      enc3 = 64;
      enc4 = 64;
    } else if (isNaN(b3)) {
      enc4 = 64;
    }

    output += B64_CHARS.charAt(enc1) + B64_CHARS.charAt(enc2) + B64_CHARS.charAt(enc3) + B64_CHARS.charAt(enc4);
  }
  return output;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  let i = 0;
  while (i < clean.length) {
    const enc1 = B64_CHARS.indexOf(clean.charAt(i++));
    const enc2 = B64_CHARS.indexOf(clean.charAt(i++));
    const enc3 = B64_CHARS.indexOf(clean.charAt(i++));
    const enc4 = B64_CHARS.indexOf(clean.charAt(i++));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    bytes.push(chr1);
    if (enc3 !== 64 && !isNaN(enc3)) bytes.push(chr2);
    if (enc4 !== 64 && !isNaN(enc4)) bytes.push(chr3);
  }
  return new Uint8Array(bytes);
}
