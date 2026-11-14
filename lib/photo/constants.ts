/** Photo limits shared by the browser (PhotoInput) and server-side validation. */

export const PHOTO_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_SIDE_PX = 512;
export const PHOTO_JPEG_QUALITY = 0.8;
export const PHOTO_OUTPUT_TYPE = "image/jpeg";
/** Max accepted base64 length on the server: 300 KB (a 512 px JPEG at q=0.8 is far below this). */
export const PHOTO_MAX_BASE64_LENGTH = 300 * 1024;
