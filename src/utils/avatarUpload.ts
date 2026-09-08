import { api } from '../services/api';

/**
 * Uploads a picked profile photo straight to Cloudinary from the device —
 * the image bytes never pass through our server. The server only ever
 * hands out a signed, time-limited upload authorization (api.getAvatarUploadSignature)
 * computed with a secret the app never sees. Returns the resulting public
 * https URL to save via api.updateProfile({ avatar: url }).
 *
 * Unlike chat attachments (E2E-encrypted, stored as ciphertext in Postgres),
 * avatars are public profile pictures shown to your contacts, so a CDN is
 * the right fit — no encryption to preserve here.
 *
 * DISCLOSURE (shown in Settings before upload): avatars are PUBLIC — they are
 * stored unencrypted on Cloudinary's CDN, visible to anyone with the URL, and
 * are NOT end-to-end encrypted. Do not upload sensitive imagery. EXIF location
 * metadata should be stripped before upload (see TODO below).
 *
 * public_id: server-generated random (never client-predictable like
 * `avatar_<userId>`); the signed `signature` binds folder/public_id/timestamp,
 * so the client MUST use sig.publicId verbatim — inventing its own would
 * invalidate the signature and allow enumeration attacks.
 *
 * TODO(EXIF): strip EXIF client-side + downscale to <=1024px before upload
 * (e.g. expo-image-manipulator: manipulateAsync(uri, [{ resize: { width: 1024 } }],
 * { compress: 0.8, format: SaveFormat.JPEG }) which drops EXIF/GPS by default).
 * expo-image-manipulator is not yet a dependency, so this step is deferred —
 * until then, prefer photos without embedded location tags.
 */
const AVATAR_UPLOAD_TIMEOUT_MS = 10_000;

export async function uploadAvatar(localUri: string, mimeType: string = 'image/jpeg'): Promise<string> {
  const sig = await api.getAvatarUploadSignature();
  if (!sig.success) {
    throw new Error(sig.error || 'Could not get an upload authorization from the server');
  }
  if (!sig.publicId || sig.publicId.length < 8) {
    throw new Error('Invalid upload authorization from the server');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AVATAR_UPLOAD_TIMEOUT_MS);
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: localUri,
      type: mimeType,
      name: 'avatar.jpg',
    } as any);
    formData.append('api_key', sig.apiKey);
    formData.append('timestamp', String(sig.timestamp));
    formData.append('signature', sig.signature);
    formData.append('folder', sig.folder);
    // Server-generated random public_id — used verbatim (see header comment).
    formData.append('public_id', sig.publicId);
    formData.append('overwrite', 'true');

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    const uploadData = await uploadRes.json();

    if (!uploadData.secure_url) {
      throw new Error(uploadData.error?.message || 'Cloudinary upload failed');
    }
    const url = uploadData.secure_url as string;
    if (!url.startsWith('https://')) {
      throw new Error('Insecure avatar URL rejected');
    }

    return url;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Avatar upload timed out after ${AVATAR_UPLOAD_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
