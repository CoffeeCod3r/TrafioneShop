/**
 * Loads an image for next/og as a data URI. Satori renders PNG, JPEG, GIF and SVG
 * (not WEBP), so other formats return null and the card shows a placeholder.
 */
const SUPPORTED = ["image/png", "image/jpeg", "image/gif", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 3000;

export async function loadImageDataUri(src: string | null, baseUrl: string): Promise<string | null> {
  if (!src) return null;
  let url: URL;
  try {
    // Relative paths (demo images in /public) are resolved against the request origin.
    url = new URL(src, baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!SUPPORTED.includes(type)) return null;
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
