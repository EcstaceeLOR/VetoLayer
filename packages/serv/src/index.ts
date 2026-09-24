export type ServEnvironment = {
  apiKey: string;
  baseUrl?: string;
};

/**
 * Server-only configuration boundary for the SERV adapter.
 * The API client itself is intentionally implemented in Issue #4.
 */
export function readServEnvironment(env: NodeJS.ProcessEnv = process.env): ServEnvironment {
  const apiKey = env.SERV_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("SERV_API_KEY is required for SERV-backed evaluations.");
  }

  const baseUrl = env.SERV_BASE_URL?.trim();
  return baseUrl ? { apiKey, baseUrl } : { apiKey };
}
