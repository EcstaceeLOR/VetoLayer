import { NextResponse } from "next/server";
import type { GitHubGateOperation } from "@vetolayer/github-gate";
import { rejectArchivedProjectWrite, requireApiWorkspace } from "../../../../lib/server/api-auth";
import { evaluateConnectedPullRequest } from "../../../../lib/server/github-app-service";
import { logServerEvent } from "../../../../lib/server/observability";

export const runtime = "nodejs";

const operations = new Set<GitHubGateOperation>([
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Request body must be an object." } }, { status: 400 });
  }
  const input = raw as Record<string, unknown>;
  const installationId = Number(input.installationId);
  const owner = typeof input.owner === "string" ? input.owner.trim() : "";
  const repo = typeof input.repo === "string" ? input.repo.trim() : "";
  const pullRequest = Number(input.pullRequest);
  const operation = typeof input.operation === "string" && operations.has(input.operation as GitHubGateOperation)
    ? input.operation as GitHubGateOperation
    : "merge-pull-request";

  if (!Number.isInteger(installationId) || installationId < 1 || !owner || !repo || !Number.isInteger(pullRequest) || pullRequest < 1) {
    return NextResponse.json({ error: { code: "INVALID_GITHUB_TARGET", message: "Choose a connected repository and provide a valid pull request number." } }, { status: 400 });
  }

  try {
    const result = await evaluateConnectedPullRequest({
      workspace: auth.workspace,
      installationId,
      owner,
      repo,
      pullRequest,
      operation,
    });
    logServerEvent("info", "github.evaluation.completed", {
      workspaceId: auth.workspace.workspaceId,
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
      installationId,
      repository: `${owner}/${repo}`,
      pullRequest,
      outcome: result.receipt.outcome,
      receiptId: result.receipt.receiptId,
    });
    return NextResponse.json({
      receipt: result.receipt,
      snapshot: {
        repository: `${result.snapshot.owner}/${result.snapshot.repo}`,
        pullRequest: result.snapshot.number,
        title: result.snapshot.title,
        url: result.snapshot.url,
        checks: result.snapshot.checks.length,
        reviews: result.snapshot.reviews.length,
        changedFiles: result.snapshot.changedFiles.length,
      },
    });
  } catch (error) {
    logServerEvent("warn", "github.evaluation.failed", {
      workspaceId: auth.workspace.workspaceId,
      projectId: auth.workspace.projectId,
      environmentId: auth.workspace.environmentId,
      installationId,
      repository: `${owner}/${repo}`,
      pullRequest,
      message: error instanceof Error ? error.message : "GitHub evaluation failed",
    });
    return NextResponse.json({ error: { code: "GITHUB_EVALUATION_FAILED", message: "VetoLayer could not evaluate that pull request through the connected GitHub App. Refresh the connection and try again." } }, { status: 502 });
  }
}
