import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase/client';

export const WORKER_UPLOADS_BUCKET = 'worker-uploads';

const MAX_UPLOAD_WIDTH = 1200;
const UPLOAD_QUALITY = 0.7;

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
 * Image is resized (max width 1200px) and compressed before upload to reduce size and avoid timeouts.
 * Returns public URL or throws.
 */
export async function uploadWorkerImage(
  workerId: string,
  localUri: string,
  pathSuffix: string,
  contentType: string = 'image/jpeg'
): Promise<string> {
  const toUpload = await resizeImageForUpload(localUri);
  const base64 = await FileSystem.readAsStringAsync(toUpload, { encoding: 'base64' });
  if (!base64 || base64.length < 100) throw new Error('Could not read image data.');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const path = `${workerId}/${pathSuffix}`;
  const { error } = await supabase.storage.from(WORKER_UPLOADS_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from(WORKER_UPLOADS_BUCKET).getPublicUrl(path);
  return `${publicUrl}?t=${Date.now()}`;
}
