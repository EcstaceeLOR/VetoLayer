import { NextResponse } from "next/server";
import { evaluateGitHubPullRequest, githubGatePolicies, type GitHubGateOperation } from "@vetolayer/github-gate";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../../lib/server/api-auth";
import { getDecisionStore } from "../../../../../lib/server/decision-store";
import { getGitHubInstallationToken, readGitHubAppConfig } from "../../../../../lib/server/github-app";
import { getGitHubAppStore } from "../../../../../lib/server/github-app-store";
import { mergeManagedPolicies } from "../../../../../lib/server/managed-policies";
import { consumeRateLimit, requestClientKey } from "../../../../../lib/server/rate-limit";
import { getReviewStore } from "../../../../../lib/server/review-store";

export const runtime = "nodejs";

const allowedOperations = new Set<GitHubGateOperation>([
  "merge-pull-request",
  "deploy-production",
  "modify-protected-configuration",
  "security-sensitive-change",
]);

export async function POST(request: Request) {
  const auth = await requireApiWorkspace("integrations.read");
  if (!auth.ok) return auth.response;
  const archived = rejectArchivedProjectWrite(auth.workspace);
  if (archived) return archived;

  const rate = consumeRateLimit({ key: `github-evaluate:${auth.workspace.workspaceId}:${auth.workspace.userId}:${requestClientKey(request)}`, limit: 30 });
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many GitHub evaluations. Try again shortly." } }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON." } }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Request body must be an object." } }, { status: 400 });
  const input = body as { repositoryId?: unknown; pullRequest?: unknown; operation?: unknown };
  const repositoryId = Number(input.repositoryId);
  const pullRequest = Number(input.pullRequest);
  const operation = typeof input.operation === "string" ? input.operation as GitHubGateOperation : "merge-pull-request";
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0 || !Number.isSafeInteger(pullRequest) || pullRequest <= 0 || !allowedOperations.has(operation)) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Use a connected repositoryId, positive pullRequest number, and supported operation." } }, { status: 400 });
  }

  const { config } = readGitHubAppConfig();
  if (!config) return NextResponse.json({ error: { code: "GITHUB_APP_NOT_CONFIGURED", message: "The VetoLayer GitHub App is not configured on this deployment." } }, { status: 503 });

  const scope = { workspaceId: auth.workspace.workspaceId, projectId: auth.workspace.projectId, environmentId: auth.workspace.environmentId };
  const { store: githubStore } = getGitHubAppStore();
  const installation = await githubStore.getInstallation(scope);
  if (!installation || installation.state !== "ready") return NextResponse.json({ error: { code: "GITHUB_APP_NOT_READY", message: "Connect a healthy GitHub App installation before evaluating a pull request." } }, { status: 409 });
  const repositories = await githubStore.listRepositories(installation.id);
  const repository = repositories.find((candidate) => candidate.repositoryId === repositoryId && candidate.connected);
  if (!repository) return NextResponse.json({ error: { code: "REPOSITORY_NOT_CONNECTED", message: "That repository is not connected to the active VetoLayer project and environment." } }, { status: 403 });

  try {
    const githubToken = await getGitHubInstallationToken({ config, installationId: installation.installationId });
    const policySet = await mergeManagedPolicies(scope, githubGatePolicies);
    const result = await evaluateGitHubPullRequest({
      owner: repository.owner,
      repo: repository.name,
      pullRequest,
      githubToken,
      operation,
      policies: policySet.policies,
      receiptScope: {
        workspaceId: auth.workspace.workspaceId,
        projectId: auth.workspace.projectId,
        environmentId: auth.workspace.environmentId,
        workspaceName: auth.workspace.workspace.name,
        projectName: auth.workspace.project.name,
        environmentName: auth.workspace.environment.name,
      },
    });

    const { store: decisionStore } = getDecisionStore();
    await decisionStore.save({ id: result.receipt.receiptId, ...scope, source: "integration", receipt: result.receipt, createdAt: result.receipt.timestamps.receiptCreatedAt });

    let reviewCaseId: string | undefined;
    if (result.receipt.outcome === "REVIEW") {
      reviewCaseId = `review_${result.receipt.receiptId}`;
      const now = new Date().toISOString();
      const { store: reviewStore } = getReviewStore();
      await reviewStore.save({
        id: reviewCaseId,
        ...scope,
        status: "pending",
        title: `${operation.replaceAll("-", " ")} · ${repository.fullName}#${pullRequest}`,
        source: "integration",
        receipt: result.receipt,
        context: { kind: "github", snapshot: result.snapshot, operation, restrictedWindow: false },
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      outcome: result.receipt.outcome,
      summary: result.receipt.decisionSummary,
      receipt: result.receipt,
      reviewCaseId,
      managedPolicyVersions: policySet.managedVersions.map((version) => ({ policyId: version.policyId, version: version.version, versionId: version.id })),
      repository: { repositoryId: repository.repositoryId, fullName: repository.fullName },
    });
  } catch {
    return NextResponse.json({ error: { code: "GITHUB_EVALUATION_FAILED", message: "VetoLayer could not collect the required GitHub evidence. No action was approved." } }, { status: 503 });
  }
}
