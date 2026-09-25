import type { ServerEnvironment } from "./env";

export type DeveloperApiScope = {
  workspaceId: string;
  projectId: string;
  environmentId: string;
};

export function developerApiScope(
  _environment: ServerEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): DeveloperApiScope {
  return {
    workspaceId: env.VETOLAYER_API_WORKSPACE_ID?.trim() || "service:developer-api",
    projectId: env.VETOLAYER_API_PROJECT_ID?.trim() || "service:default-project",
    environmentId: env.VETOLAYER_API_ENVIRONMENT_ID?.trim() || "service:production",
  };
}

/** Compatibility helper for existing callers/tests. */
export function developerApiWorkspaceId(
  environment: ServerEnvironment,
  env: NodeJS.ProcessEnv = process.env,
) {
  return developerApiScope(environment, env).workspaceId;
}
