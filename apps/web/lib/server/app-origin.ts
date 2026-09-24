function normalizeOrigin(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the canonical application origin without trusting a caller-controlled
 * Origin header ahead of configured deployment metadata.
 */
export function resolveAppOrigin(
  requestOrigin?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return (
    normalizeOrigin(env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeOrigin(env.VERCEL_URL) ??
    normalizeOrigin(requestOrigin)
  );
}
