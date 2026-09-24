import type { ActionRequest, Evidence } from "./schemas";

export const exampleActionRequests = {
  deployment: {
    id: "act_deploy_auth_001",
    actor: {
      id: "agent_release_bot",
      kind: "agent",
      name: "Release Agent",
      framework: "custom",
    },
    action: {
      type: "deployment",
      tool: "github-actions",
      operation: "deploy-production",
      arguments: {
        repository: "acme/api",
        ref: "sha-8f31d2",
        changedAreas: ["auth", "session"],
      },
    },
    target: {
      type: "environment",
      id: "production",
      environment: "production",
    },
    context: {
      source: "coding-agent",
      environment: "production",
      attributes: {
        changeRisk: "high",
        incidentId: "INC-441",
      },
    },
    requestedAt: "2026-09-24T12:00:00+00:00",
  },
  merge: {
    id: "act_merge_pr_042",
    actor: {
      id: "agent_code_review_01",
      kind: "agent",
      name: "Code Review Agent",
    },
    action: {
      type: "source-control",
      tool: "github",
      operation: "merge-pull-request",
      arguments: {
        repository: "acme/web",
        pullRequest: 42,
        method: "squash",
      },
    },
    target: {
      type: "branch",
      id: "main",
      environment: "production",
    },
    context: {
      source: "github-app",
      correlationId: "run_9271",
    },
    requestedAt: "2026-09-24T12:05:00+00:00",
  },
  refund: {
    id: "act_refund_8831",
    actor: {
      id: "agent_support_04",
      kind: "agent",
      name: "Customer Support Agent",
    },
    action: {
      type: "customer-refund",
      tool: "payments-api",
      operation: "issue-refund",
      arguments: {
        amount: 620,
        currency: "USD",
        reason: "suspected duplicate charge",
      },
    },
    target: {
      type: "payment",
      id: "pay_8831",
    },
    context: {
      source: "support-workflow",
      attributes: {
        customerTier: "business",
      },
    },
    requestedAt: "2026-09-24T12:10:00+00:00",
  },
  payment: {
    id: "act_vendor_payment_211",
    actor: {
      id: "agent_finance_ops",
      kind: "agent",
      name: "Finance Operations Agent",
    },
    action: {
      type: "vendor-payment",
      tool: "treasury-api",
      operation: "send-payment",
      arguments: {
        amount: 12500,
        currency: "USD",
        invoiceId: "INV-2026-211",
      },
    },
    target: {
      type: "vendor-account",
      id: "vendor_northstar",
    },
    context: {
      source: "accounts-payable",
      attributes: {
        purchaseOrder: "PO-771",
      },
    },
    requestedAt: "2026-09-24T12:15:00+00:00",
  },
} satisfies Record<string, ActionRequest>;

export const exampleEvidence = {
  ciPassed: {
    id: "ev_ci_001",
    type: "ci-status",
    source: {
      kind: "github-check",
      label: "CI / verify",
      uri: "https://github.com/acme/api/actions/runs/1",
    },
    data: {
      conclusion: "success",
      commit: "sha-8f31d2",
    },
    observedAt: "2026-09-24T11:58:00+00:00",
    verification: {
      status: "verified",
      verifier: "github-api",
      verifiedAt: "2026-09-24T11:58:05+00:00",
    },
  },
  approval: {
    id: "ev_approval_001",
    type: "review-approval",
    source: {
      kind: "github-review",
      label: "Security reviewer approval",
    },
    reference: "review:sec-team:approved",
    observedAt: "2026-09-24T11:59:00+00:00",
    verification: {
      status: "verified",
      verifier: "github-api",
    },
  },
} satisfies Record<string, Evidence>;
