const MAX_UPLOAD_WIDTH = 1200;
const UPLOAD_QUALITY = 0.7;

/**
 * Resize and compress image for upload (e.g. chat attachments) to avoid timeouts and large payloads.
 * Loads expo-image-manipulator only when needed.
 * Returns a local URI to the processed image (JPEG), or the original URI if manipulation fails.
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
