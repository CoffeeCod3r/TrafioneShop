/**
 * Minimal server logger that only accepts flat, primitive fields.
 * Use it instead of console.* in API routes so request bodies, photos
 * and error objects (which may carry request data) can never be logged by accident.
 */
type SafeValue = string | number | boolean | null | undefined;

export function logEvent(event: string, fields: Record<string, SafeValue> = {}): void {
  const safe: Record<string, SafeValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    // Truncate strings defensively: nothing long (like base64) should ever pass through.
    safe[key] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  console.log(JSON.stringify({ event, ...safe }));
}

/** Error description without message bodies: type and HTTP status only. */
export function describeError(error: unknown): { errorName: string; status?: number } {
  if (error && typeof error === "object") {
    const name = (error as { name?: unknown }).name;
    const status = (error as { status?: unknown }).status;
    return {
      errorName: typeof name === "string" ? name.slice(0, 50) : "UnknownError",
      status: typeof status === "number" ? status : undefined,
    };
  }
  return { errorName: "UnknownError" };
}
