import { createDecisionReceipt, evaluateAction } from "@vetolayer/core";
import { evaluateDeterministicPolicies } from "@vetolayer/policies";
import { evaluateWithServ, readServEnvironment } from "@vetolayer/serv";
import type { ProductScope } from "../workspace-model";
import { getDecisionStore } from "./decision-store";
import type { DeveloperEvaluationPayload } from "./developer-api";
import { getDeveloperStore } from "./developer-store";
import { mergeManagedPolicies } from "./managed-policies";
import { logServerEvent } from "./observability";

export async function executeDeveloperEvaluation(input: {
  payload: DeveloperEvaluationPayload;
  scope: ProductScope;
  keyId?: string;
}) {
  const now = new Date();
  const startedAt = Date.now();
  const requestId = `req_${input.payload.action.id}_${now.getTime()}`;
  const policySet = await mergeManagedPolicies(input.scope, input.payload.policies);

  const orchestration = await evaluateAction({
    action: input.payload.action,
    policies: policySet.policies,
    evidence: input.payload.evidence,
    facts: input.payload.facts,
    environment: { ...input.payload.environment, ...input.scope },
    now,
    decisionId: `decision_${input.payload.action.id}_${now.getTime()}`,
  }, {
    evaluateDeterministic: (evaluation) => evaluateDeterministicPolicies(evaluation),
    evaluateContextual: (evaluation) => evaluateWithServ(evaluation, readServEnvironment()),
  });

  const receipt = await createDecisionReceipt({
    orchestration,
    action: input.payload.action,
    policies: policySet.policies,
    evidence: input.payload.evidence,
    createdAt: now,
    receiptId: `receipt_${input.payload.action.id}_${now.getTime()}`,
    scope: input.scope,
  });

  const { store: decisionStore, persistence } = getDecisionStore();
  try {
    await decisionStore.save({
      id: receipt.receiptId,
      ...input.scope,
      source: "api",
      receipt,
      createdAt: receipt.timestamps.receiptCreatedAt,
    });
  } catch (error) {
    logServerEvent("warn", "api.decision.persistence.failed", {
      requestId,
      receiptId: receipt.receiptId,
      ...input.scope,
      message: error instanceof Error ? error.message : "Decision persistence failed",
    });
  }

  const latencyMs = Date.now() - startedAt;
  try {
    const { store: developerStore } = getDeveloperStore();
    await developerStore.saveRequest({
      id: `api_request_${requestId}`,
      requestId,
      ...(input.keyId ? { keyId: input.keyId } : {}),
      ...input.scope,
      actionId: input.payload.action.id,
      outcome: orchestration.decision.outcome,
      receiptId: receipt.receiptId,
      latencyMs,
      createdAt: now.toISOString(),
    });
  } catch (error) {
    logServerEvent("warn", "api.request.persistence.failed", { requestId, ...input.scope, message: error instanceof Error ? error.message : "Request persistence failed" });
  }

  logServerEvent("info", "api.evaluation.completed", {
    requestId,
    ...input.scope,
    actionRequestId: input.payload.action.id,
    outcome: orchestration.decision.outcome,
    receiptId: receipt.receiptId,
    providerStatus: orchestration.contextualTrace?.providerStatus,
    managedPolicyVersions: policySet.managedVersions.map((version) => `${version.policyId}@v${version.version}`),
    latencyMs,
  });

  return {
    requestId,
    decision: orchestration.decision,
    receipt,
    trace: orchestration.trace,
    providerTrace: orchestration.contextualTrace,
    persistence,
    scope: input.scope,
    policySource: policySet.source,
    managedPolicyVersions: policySet.managedVersions.map((version) => ({ policyId: version.policyId, version: version.version, versionId: version.id })),
    latencyMs,
  };
}
