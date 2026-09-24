import type { ServerEnvironment } from "./env";

export function developerApiWorkspaceId(
  _environment: ServerEnvironment,
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.VETOLAYER_API_WORKSPACE_ID?.trim() || "service:developer-api";
}
