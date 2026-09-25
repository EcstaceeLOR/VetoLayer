import { readServerEnvironment } from "./env";

export type ReadinessCheck = {
  key: string;
  required: boolean;
  ready: boolean;
  detail: string;
};

export function buildReadinessSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  authConfigured = Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()),
) {
  try {
    const server = readServerEnvironment(env);
    const checks: ReadinessCheck[] = [
      {
        key: "persistence",
        required: true,
        ready: server.persistenceConfigured,
        detail: server.persistenceConfigured ? "Durable Supabase persistence configured." : "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
      },
      {
        key: "auth",
        required: true,
        ready: authConfigured,
        detail: authConfigured ? "Supabase authentication configured." : "Public Supabase authentication configuration is required.",
      },
      {
        key: "serv",
        required: true,
        ready: server.servConfigured,
        detail: server.servConfigured ? "SERV contextual reasoning configured." : "SERV_API_KEY and SERV_MODEL are required.",
      },
      {
        key: "credential-encryption",
        required: true,
        ready: Boolean(env.VETOLAYER_CREDENTIAL_ENCRYPTION_KEY?.trim()),
        detail: env.VETOLAYER_CREDENTIAL_ENCRYPTION_KEY?.trim()
          ? "Webhook credential encryption configured."
          : "VETOLAYER_CREDENTIAL_ENCRYPTION_KEY is required.",
      },
      {
        key: "github-app",
        required: false,
        ready: Boolean(server.githubAppConfigured),
        detail: server.githubAppConfigured ? "GitHub App configured." : "GitHub App is optional until the GitHub integration is enabled.",
      },
    ];
    const ready = checks.filter((check) => check.required).every((check) => check.ready);
    return { status: ready ? "ready" as const : "not-ready" as const, ready, checks };
  } catch (error) {
    return {
      status: "not-ready" as const,
      ready: false,
      checks: [{ key: "configuration", required: true, ready: false, detail: error instanceof Error ? error.message : "Server configuration is invalid." }],
    };
  }
}
