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
 */
export async function uploadAvatar(localUri: string, mimeType: string = 'image/jpeg'): Promise<string> {
  const sig = await api.getAvatarUploadSignature();
  if (!sig.success) {
    throw new Error('Could not get an upload authorization from the server');
  }

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
  formData.append('public_id', sig.publicId);
  formData.append('overwrite', 'true');

  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  const uploadData = await uploadRes.json();

  if (!uploadData.secure_url) {
    throw new Error(uploadData.error?.message || 'Cloudinary upload failed');
  }

  return uploadData.secure_url as string;
}
