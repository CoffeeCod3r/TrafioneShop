import {
  PHOTO_ACCEPTED_TYPES,
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_INPUT_BYTES,
  PHOTO_MAX_SIDE_PX,
  PHOTO_OUTPUT_TYPE,
} from "./constants.ts";

/**
 * Browser-only image processing. The photo never leaves memory:
 * no uploads here, no storage, no logging.
 */

export type ProcessedPhoto = {
  /** data:image/jpeg;base64,... for the preview */
  dataUrl: string;
  /** Raw base64 (no prefix), ready for the AI API */
  base64: string;
  mediaType: typeof PHOTO_OUTPUT_TYPE;
  width: number;
  height: number;
};

export class PhotoError extends Error {}

export function validatePhotoFile(file: File): void {
  if (!(PHOTO_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    throw new PhotoError("Obsługujemy tylko zdjęcia JPG, PNG i WEBP.");
  }
  if (file.size > PHOTO_MAX_INPUT_BYTES) {
    throw new PhotoError("Zdjęcie jest za duże. Maksymalny rozmiar to 10 MB.");
  }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      // Applies EXIF orientation so portrait photos are not rotated.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall back to <img> below.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoError("Nie udało się odczytać zdjęcia. Spróbuj z innym plikiem.");
  }
}

/** Downscales to max 512 px on the longer side and re-encodes as JPEG (drops EXIF metadata). */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  validatePhotoFile(file);
  const decoded = await decode(file);

  try {
    if (!decoded.width || !decoded.height) throw new PhotoError("Nie udało się odczytać zdjęcia.");

    const scale = Math.min(1, PHOTO_MAX_SIDE_PX / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoError("Twoja przeglądarka nie obsługuje przetwarzania zdjęć.");

    // JPEG has no transparency: paint white under transparent PNG/WEBP areas.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, width, height);

    const dataUrl = canvas.toDataURL(PHOTO_OUTPUT_TYPE, PHOTO_JPEG_QUALITY);
    canvas.width = 0;
    canvas.height = 0;

    const prefix = `data:${PHOTO_OUTPUT_TYPE};base64,`;
    if (!dataUrl.startsWith(prefix)) throw new PhotoError("Nie udało się przetworzyć zdjęcia.");

    return { dataUrl, base64: dataUrl.slice(prefix.length), mediaType: PHOTO_OUTPUT_TYPE, width, height };
  } finally {
    decoded.release();
  }
}
