import { correlationIdFromHeaders, logServerEvent, safeErrorMetadata } from "./lib/server/observability";

export function register() {
  // Next.js instrumentation hook. Request error reporting is handled below.
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind?: string; routePath?: string; routeType?: string; renderSource?: string },
) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (Array.isArray(value)) headers.set(key, value.join(","));
    else if (value) headers.set(key, value);
  }
  const requestId = correlationIdFromHeaders(headers);
  logServerEvent("error", "server.unhandled_request_error", {
    requestId,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    ...safeErrorMetadata(error),
  });
}
