type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(input: {
  key: string;
  limit: number;
  windowMs?: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? 60_000;
  const current = buckets.get(input.key);

  if (!current || current.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(input.key, bucket);
    return { allowed: true, remaining: input.limit - 1, resetAt: bucket.resetAt };
  }

  current.count += 1;
  buckets.set(input.key, current);
  return {
    allowed: current.count <= input.limit,
    remaining: Math.max(0, input.limit - current.count),
    resetAt: current.resetAt,
  };
}

export function requestClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "anonymous";
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
