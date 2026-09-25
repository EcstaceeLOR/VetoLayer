export type ServerEnvironment = {
  servConfigured: boolean;
  /** Legacy PAT flag retained only for backwards-compatible fixtures; product GitHub auth uses GitHub Apps. */
  githubTokenConfigured?: boolean;
  githubAppConfigured?: boolean;
  persistenceConfigured: boolean;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  apiRateLimitPerMinute: number;
  apiAuthConfigured: boolean;
  apiKey?: string;
};

export function readServerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ServerEnvironment {
  const servApiKey = env.SERV_API_KEY?.trim();
  const servModel = env.SERV_MODEL?.trim();
  const githubToken = env.GITHUB_TOKEN?.trim();
  const githubAppConfigured = [
    env.GITHUB_APP_ID,
    env.GITHUB_APP_SLUG,
    env.GITHUB_APP_CLIENT_ID,
    env.GITHUB_APP_CLIENT_SECRET,
    env.GITHUB_APP_PRIVATE_KEY,
    env.GITHUB_APP_WEBHOOK_SECRET,
  ].every((value) => Boolean(value?.trim()));
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const apiRateLimitValue = env.VETOLAYER_API_RATE_LIMIT_PER_MINUTE?.trim();
  const apiRateLimitPerMinute = apiRateLimitValue ? Number(apiRateLimitValue) : 60;
  const apiKey = env.VETOLAYER_API_KEY?.trim();

  if (Boolean(supabaseUrl) !== Boolean(supabaseServiceRoleKey)) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together.",
    );
  }

  if (!Number.isInteger(apiRateLimitPerMinute) || apiRateLimitPerMinute < 1 || apiRateLimitPerMinute > 1_000) {
    throw new Error("VETOLAYER_API_RATE_LIMIT_PER_MINUTE must be an integer between 1 and 1000.");
  }

  return {
    servConfigured: Boolean(servApiKey && servModel),
    githubTokenConfigured: Boolean(githubToken),
    githubAppConfigured,
    persistenceConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey),
    ...(supabaseUrl ? { supabaseUrl } : {}),
    ...(supabaseServiceRoleKey ? { supabaseServiceRoleKey } : {}),
    apiRateLimitPerMinute,
    apiAuthConfigured: Boolean(apiKey),
    ...(apiKey ? { apiKey } : {}),
  };
}
