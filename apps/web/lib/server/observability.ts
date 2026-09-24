type LogLevel = "info" | "warn" | "error";

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|api.?key)/i;

export function logServerEvent(
  level: LogLevel,
  event: string,
  metadata: Record<string, unknown> = {},
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(metadata),
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitize(child),
    ]),
  );
}
