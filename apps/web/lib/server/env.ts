export type ServerEnvironment = {
  servConfigured: boolean;
  githubTokenConfigured?: boolean;
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
  const githubToken = env.GITHUB_TOKEN?.trim();
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const demoRateLimitValue = env.VETOLAYER_DEMO_RATE_LIMIT_PER_MINUTE?.trim();
  const apiRateLimitValue = env.VETOLAYER_API_RATE_LIMIT_PER_MINUTE?.trim();
  const demoRateLimitPerMinute = demoRateLimitValue ? Number(demoRateLimitValue) : 30;
  const apiRateLimitPerMinute = apiRateLimitValue ? Number(apiRateLimitValue) : 60;
  const apiKey = env.VETOLAYER_API_KEY?.trim();

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
    githubTokenConfigured: Boolean(githubToken),
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
