export type ServerEnvironment = {
  servConfigured: boolean;
  /** @deprecated Issue #56 replaces personal tokens with GitHub App installations. */
  githubTokenConfigured?: boolean;
  githubAppConfigured?: boolean;
  githubAppSlug?: string;
  githubAppMissing?: string[];
  persistenceConfigured: boolean;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  demoWorkspaceId: string;
  demoRateLimitPerMinute: number;
  apiRateLimitPerMinute: number;
  apiAuthConfigured: boolean;
  apiKey?: string;
};

export function readServerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ServerEnvironment {
  const servApiKey = env.SERV_API_KEY?.trim();
  const servModel = env.SERV_MODEL?.trim();
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const demoRateLimitValue = env.VETOLAYER_DEMO_RATE_LIMIT_PER_MINUTE?.trim();
  const apiRateLimitValue = env.VETOLAYER_API_RATE_LIMIT_PER_MINUTE?.trim();
  const demoRateLimitPerMinute = demoRateLimitValue ? Number(demoRateLimitValue) : 30;
  const apiRateLimitPerMinute = apiRateLimitValue ? Number(apiRateLimitValue) : 60;
  const apiKey = env.VETOLAYER_API_KEY?.trim();
  const githubAppFields = [
    ["GITHUB_APP_ID", env.GITHUB_APP_ID],
    ["GITHUB_APP_SLUG", env.GITHUB_APP_SLUG],
    ["GITHUB_APP_CLIENT_ID", env.GITHUB_APP_CLIENT_ID],
    ["GITHUB_APP_CLIENT_SECRET", env.GITHUB_APP_CLIENT_SECRET],
    ["GITHUB_APP_PRIVATE_KEY", env.GITHUB_APP_PRIVATE_KEY],
    ["GITHUB_APP_WEBHOOK_SECRET", env.GITHUB_APP_WEBHOOK_SECRET],
  ] as const;
  const githubAppMissing = githubAppFields
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  const githubAppSlug = env.GITHUB_APP_SLUG?.trim();

  if (Boolean(supabaseUrl) !== Boolean(supabaseServiceRoleKey)) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together.",
    );
  }

  for (const [name, value] of [
    ["VETOLAYER_DEMO_RATE_LIMIT_PER_MINUTE", demoRateLimitPerMinute],
    ["VETOLAYER_API_RATE_LIMIT_PER_MINUTE", apiRateLimitPerMinute],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 1_000) {
      throw new Error(`${name} must be an integer between 1 and 1000.`);
    }
  }

  return {
    servConfigured: Boolean(servApiKey && servModel),
    githubTokenConfigured: false,
    githubAppConfigured: githubAppMissing.length === 0,
    ...(githubAppSlug ? { githubAppSlug } : {}),
    githubAppMissing,
    persistenceConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey),
    ...(supabaseUrl ? { supabaseUrl } : {}),
    ...(supabaseServiceRoleKey ? { supabaseServiceRoleKey } : {}),
    demoWorkspaceId: env.VETOLAYER_DEMO_WORKSPACE_ID?.trim() || "demo",
    demoRateLimitPerMinute,
    apiRateLimitPerMinute,
    apiAuthConfigured: Boolean(apiKey),
    ...(apiKey ? { apiKey } : {}),
  };
}
