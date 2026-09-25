type LogLevel = "info" | "warn" | "error";

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|api.?key|cookie|credential|private.?key)/i;
const SECRET_VALUE_PATTERN = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

export function requestCorrelationId(request?: Request) {
  if (request) return correlationIdFromHeaders(request.headers);
  return `req_${crypto.randomUUID()}`;
}

export function correlationIdFromHeaders(headers: Headers) {
  for (const header of ["x-vetolayer-request-id", "x-request-id", "x-correlation-id", "x-vercel-id"]) {
    const value = headers.get(header)?.trim();
    if (value && REQUEST_ID_PATTERN.test(value)) return value;
  }
  return `req_${crypto.randomUUID()}`;
}

export function safeErrorMetadata(error: unknown) {
  if (!(error instanceof Error)) return { errorName: "UnknownError", message: "Unknown error" };
  return {
    errorName: error.name.slice(0, 120),
    message: sanitizeString(error.message).slice(0, 500),
    ...(typeof (error as Error & { digest?: unknown }).digest === "string"
      ? { digest: String((error as Error & { digest?: unknown }).digest).slice(0, 160) }
      : {}),
  };
}

export function logServerEvent(
  level: LogLevel,
  event: string,
  metadata: Record<string, unknown> = {},
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitizeRecord(metadata),
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeValue(child),
    ]),
  );
}

function sanitizeString(value: string) {
  return value.replace(SECRET_VALUE_PATTERN, "$1[redacted]");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.slice(0, 100).map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  return sanitizeRecord(value as Record<string, unknown>);
}
