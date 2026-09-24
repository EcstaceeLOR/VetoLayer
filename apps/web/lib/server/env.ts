export type ServerEnvironment = {
  servConfigured: boolean;
  persistenceConfigured: boolean;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  demoWorkspaceId: string;
  demoRateLimitPerMinute: number;
};

export function readServerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ServerEnvironment {
  const servApiKey = env.SERV_API_KEY?.trim();
  const servModel = env.SERV_MODEL?.trim();
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const rateLimitValue = env.VETOLAYER_DEMO_RATE_LIMIT_PER_MINUTE?.trim();
  const demoRateLimitPerMinute = rateLimitValue ? Number(rateLimitValue) : 30;

  if (Boolean(supabaseUrl) !== Boolean(supabaseServiceRoleKey)) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together.",
    );
  }

  if (
    !Number.isInteger(demoRateLimitPerMinute) ||
    demoRateLimitPerMinute < 1 ||
    demoRateLimitPerMinute > 1_000
  ) {
    throw new Error(
      "VETOLAYER_DEMO_RATE_LIMIT_PER_MINUTE must be an integer between 1 and 1000.",
    );
  }

  return {
    servConfigured: Boolean(servApiKey && servModel),
    persistenceConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey),
    ...(supabaseUrl ? { supabaseUrl } : {}),
    ...(supabaseServiceRoleKey ? { supabaseServiceRoleKey } : {}),
    demoWorkspaceId: env.VETOLAYER_DEMO_WORKSPACE_ID?.trim() || "demo",
    demoRateLimitPerMinute,
  };
}
