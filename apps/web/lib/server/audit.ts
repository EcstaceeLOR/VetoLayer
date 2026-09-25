import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { WorkspaceContext } from "./workspace";
import { getAuditStore, type AuditActorKind, type AuditCategory, type AuditEvent } from "./audit-store";
import { logServerEvent } from "./observability";
import { getWorkspaceStore } from "./workspace-store";

const sensitiveKey = /(authorization|cookie|password|passphrase|secret|token|credential|private.?key|api.?key|signing.?secret|service.?role|client.?secret|session|jwt)/i;
const maxDepth = 6;
const maxArrayItems = 100;
const maxStringLength = 4_000;

function redactString(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:token|secret|api[_-]?key|password|signature)=)[^&#\s]+/gi, "$1[REDACTED]")
    .slice(0, maxStringLength);
}

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth > maxDepth) return "[TRUNCATED]";
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value ?? null;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.slice(0, maxArrayItems).map((item) => redactAuditValue(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      output[key] = sensitiveKey.test(key) ? "[REDACTED]" : redactAuditValue(item, depth + 1);
    }
    return output;
  }
  return String(value).slice(0, maxStringLength);
}

async function requestContext(request?: Request) {
  const source = request?.headers ?? await headers();
  const requestId = source.get("x-request-id")?.trim() || source.get("x-vercel-id")?.trim() || `req_${randomUUID()}`;
  const correlationId = source.get("x-correlation-id")?.trim() || source.get("traceparent")?.trim() || undefined;
  const forwardedFor = source.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = source.get("user-agent")?.trim();
  return {
    requestId,
    ...(correlationId ? { correlationId } : {}),
    ...(forwardedFor ? { ipAddress: forwardedFor.slice(0, 120) } : {}),
    ...(userAgent ? { userAgent: userAgent.slice(0, 500) } : {}),
  };
}

export type AuditWriteInput = {
  workspaceId: string;
  projectId?: string;
  environmentId?: string;
  actorKind?: AuditActorKind;
  actorUserId?: string;
  actorLabel?: string;
  actorRole?: string;
  action: string;
  category: AuditCategory;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  href?: string;
  metadata?: Record<string, unknown>;
  request?: Request;
};

export async function appendAuditEvent(input: AuditWriteInput): Promise<AuditEvent> {
  const context = await requestContext(input.request);
  const { store } = getAuditStore();
  return store.append({
    workspaceId: input.workspaceId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.environmentId ? { environmentId: input.environmentId } : {}),
    actorKind: input.actorKind ?? (input.actorUserId ? "human" : "system"),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.actorLabel ? { actorLabel: redactString(input.actorLabel) } : {}),
    ...(input.actorRole ? { actorRole: input.actorRole } : {}),
    action: input.action.slice(0, 160),
    category: input.category,
    targetType: input.targetType.slice(0, 120),
    ...(input.targetId ? { targetId: input.targetId.slice(0, 240) } : {}),
    ...(input.targetLabel ? { targetLabel: redactString(input.targetLabel) } : {}),
    ...(input.href ? { href: input.href.slice(0, 1_000) } : {}),
    ...context,
    metadata: redactAuditValue(input.metadata ?? {}) as Record<string, unknown>,
  });
}

export async function recordAuditEvent(input: AuditWriteInput) {
  try {
    return await appendAuditEvent(input);
  } catch (error) {
    logServerEvent("error", "audit.write.failed", {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      message: error instanceof Error ? error.message : "Audit write failed",
    });
    return null;
  }
}

export async function recordUserSecurityAudit(input: {
  userId: string;
  email?: string;
  displayName?: string;
  action: string;
  metadata?: Record<string, unknown>;
  request?: Request;
}) {
  try {
    const { store } = getWorkspaceStore();
    const memberships = await store.listWorkspacesForUser(input.userId);
    await Promise.all(memberships.map(({ workspace, membership }) => recordAuditEvent({
      workspaceId: workspace.id,
      actorKind: "human",
      actorUserId: input.userId,
      actorLabel: input.displayName ?? input.email ?? input.userId,
      actorRole: membership.role,
      action: input.action,
      category: "security",
      targetType: "user_account",
      targetId: input.userId,
      targetLabel: input.displayName ?? input.email ?? input.userId,
      href: "/account",
      ...(input.request ? { request: input.request } : {}),
      metadata: input.metadata ?? {},
    })));
  } catch (error) {
    logServerEvent("error", "audit.security_fanout.failed", { userId: input.userId, action: input.action, message: error instanceof Error ? error.message : "Security audit fan-out failed" });
  }
}

export function workspaceAuditInput(workspace: WorkspaceContext, input: Omit<AuditWriteInput, "workspaceId" | "projectId" | "environmentId" | "actorUserId" | "actorLabel" | "actorRole" | "actorKind">): AuditWriteInput {
  return {
    ...input,
    workspaceId: workspace.workspaceId,
    projectId: workspace.projectId,
    environmentId: workspace.environmentId,
    actorKind: "human",
    actorUserId: workspace.userId,
    actorLabel: workspace.displayName ?? workspace.email ?? workspace.userId,
    actorRole: workspace.role,
  };
}
