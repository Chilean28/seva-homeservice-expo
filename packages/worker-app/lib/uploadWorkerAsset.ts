import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase/client';

export const WORKER_UPLOADS_BUCKET = 'worker-uploads';

const MAX_UPLOAD_WIDTH = 1024;
const UPLOAD_QUALITY = 0.65;
const MAX_UPLOAD_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetriableUploadMessage(msg: string): boolean {
  return /network request failed|aborted|timeout|fetch failed|load failed|ECONNRESET|ENOTFOUND|socket|timed out/i.test(
    msg
  );
}

/**
 * Prefer streaming read via fetch (often more reliable than base64 + atob on RN for file://).
 * Falls back to FileSystem base64 when fetch cannot read the URI.
 */
async function localUriToBytes(localUri: string): Promise<Uint8Array> {
  try {
    const res = await fetch(localUri);
    if (!res.ok) throw new Error(`fetch file uri ${res.status}`);
    const ab = await res.arrayBuffer();
    if (!ab || ab.byteLength < 50) throw new Error('empty body');
    return new Uint8Array(ab);
  } catch {
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
    if (!base64 || base64.length < 100) throw new Error('Could not read image data.');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
}

async function storageUploadOnce(
  path: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const { error } = await supabase.storage.from(WORKER_UPLOADS_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

/**
 * Resize and compress image for upload to avoid timeouts and large payloads.
 * Loads expo-image-manipulator only when needed so the app won't crash if the native module isn't built yet.
 * Returns a local URI to the processed image (JPEG), or the original URI if manipulation fails or module is missing.
 * Exported for use in chat image uploads.
 */
export async function resizeImageForUpload(localUri: string): Promise<string> {
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    const result = await manipulateAsync(
      localUri,
      [{ resize: { width: MAX_UPLOAD_WIDTH } }],
      { compress: UPLOAD_QUALITY, format: SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return localUri;
  }
}

/**
 * Upload image from local URI to worker-uploads/{workerId}/{pathSuffix}.
 * Image is resized (max width) and compressed before upload. Retries on transient network errors.
 * Returns public URL or throws.
 */
export async function uploadWorkerImage(
  workerId: string,
  localUri: string,
  pathSuffix: string,
  contentType: string = 'image/jpeg'
): Promise<string> {
  const toUpload = await resizeImageForUpload(localUri);
  const bytes = await localUriToBytes(toUpload);
  const path = `${workerId}/${pathSuffix}`;

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      await storageUploadOnce(path, bytes, contentType);
      const {
        data: { publicUrl },
      } = supabase.storage.from(WORKER_UPLOADS_BUCKET).getPublicUrl(path);
      return `${publicUrl}?t=${Date.now()}`;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastError = err;
      const retriable = isRetriableUploadMessage(err.message);
      if (!retriable || attempt === MAX_UPLOAD_ATTEMPTS) throw err;
      if (attempt === 2) {
        try {
          await supabase.auth.refreshSession();
        } catch {
          /* ignore */
        }
      }
      await sleep(400 * attempt * attempt);
    }
  }
  throw lastError ?? new Error('Upload failed');
}
