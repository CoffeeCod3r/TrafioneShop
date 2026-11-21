import { gunzipSync } from "node:zlib";

export const FEED_FETCH_TIMEOUT_MS = 120_000;
export const FEED_MAX_BYTES = 300 * 1024 * 1024;

/** Downloads a feed and returns its decoded text. Supports gzip and non-UTF-8 charsets. */
export async function fetchFeed(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
    headers: { "user-agent": "Prezentoskop-FeedImporter/1.0" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > FEED_MAX_BYTES) throw new Error(`Feed too large (${declaredLength} bytes)`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  return decodeFeedBody(bytes, response.headers.get("content-type"));
}

export function decodeFeedBody(input: Uint8Array, contentType?: string | null): string {
  let bytes = input;
  if (bytes.byteLength > FEED_MAX_BYTES) throw new Error(`Feed too large (${bytes.byteLength} bytes)`);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(gunzipSync(bytes));

  const charset = detectCharset(bytes, contentType);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  // TextDecoder strips a UTF-8 BOM by default.
  return decoder.decode(bytes);
}

function detectCharset(bytes: Uint8Array, contentType?: string | null): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();

  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const fromProlog = head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1];
  return (fromProlog ?? "utf-8").toLowerCase();
}
