import type { Policy } from "@vetolayer/core";

export const githubGatePolicies: Policy[] = [
  {
    id: "github-no-draft-actions",
    name: "Block actions on draft pull requests",
    description: "Autonomous agents must not merge or deploy a draft pull request.",
    severity: "critical",
    priority: 1,
    enabled: true,
    mode: "deterministic",
    requiredEvidence: [
      {
        key: "pull-request-metadata",
        type: "pull-request",
        description: "Verified pull request metadata",
        required: true,
        maxAgeSeconds: 300,
      },
    ],
    exceptions: [],
    scope: { actionTypes: ["source-control"], tools: ["github"] },
    rule: {
      effect: "block",
      match: "all",
      conditions: [{ field: "facts.isDraft", operator: "equals", value: true }],
    },
  },
  {
    id: "github-ci-must-pass",
    name: "CI must pass before autonomous execution",
    description: "A proposed GitHub action requires successful current check runs.",
    severity: "critical",
    priority: 2,
    enabled: true,
    mode: "deterministic",
    requiredEvidence: [
      {
        key: "ci-status",
        type: "ci-status",
        description: "Verified current CI/check-run status",
        required: true,
        maxAgeSeconds: 300,
      },
    ],
    exceptions: [],
    scope: { actionTypes: ["source-control"], tools: ["github"] },
    rule: {
      effect: "review",
      match: "all",
      conditions: [{ field: "facts.ciPassed", operator: "not_equals", value: true }],
    },
  },
  {
    id: "github-review-required",
    name: "At least one human approval is required",
    description: "Autonomous GitHub actions require a current approving human review.",
    severity: "high",
    priority: 3,
    enabled: true,
    mode: "deterministic",
    requiredEvidence: [
      {
        key: "review-approval",
        type: "review-approval",
        description: "Verified pull request review state",
        required: true,
        maxAgeSeconds: 300,
      },
    ],
    exceptions: [],
    scope: { actionTypes: ["source-control"], tools: ["github"] },
    rule: {
      effect: "review",
      match: "all",
      conditions: [{ field: "facts.approvalCount", operator: "less_than", value: 1 }],
    },
  },
  {
    id: "github-sensitive-change-context",
    name: "Sensitive change contextual gate",
    description:
      "Authentication, security, workflow, infrastructure, or protected-configuration changes require contextual judgment before autonomous execution.",
    severity: "critical",
    priority: 4,
    enabled: true,
    mode: "contextual",
    requiredEvidence: [
      {
        key: "changed-files",
        type: "changed-files",
        description: "Verified list of changed files",
        required: true,
        maxAgeSeconds: 300,
      },
      {
        key: "ci-status-context",
        type: "ci-status",
        description: "Verified current CI status",
        required: true,
        maxAgeSeconds: 300,
      },
      {
        key: "review-context",
        type: "review-approval",
        description: "Verified current review state",
        required: true,
        maxAgeSeconds: 300,
      },
    ],
    exceptions: [
      {
        id: "critical-security-remediation",
        description:
          "A sensitive change may proceed during a restricted window when it clearly addresses an urgent security issue and supporting validation is sufficient.",
        criteria: [
          "The supplied context shows an urgent or critical security reason",
          "CI/check evidence is successful",
          "A human reviewer has approved the change",
          "The evidence does not contain unresolved contradictions",
        ],
        requiredEvidence: ["changed-files", "ci-status", "review-approval"],
      },
    ],
    scope: { actionTypes: ["source-control"], tools: ["github"] },
    instruction:
      "Determine whether this coding-agent action should execute now. Give particular scrutiny to sensitive files, production deployment, protected configuration, security/authentication changes, and restricted deployment windows. Apply the critical-security-remediation exception only when the supplied context and evidence fully support it.",
    decisionCriteria: [
      "Do not invent approvals, check results, incidents, or risk facts",
      "Missing or ambiguous evidence requires REVIEW",
      "A clearly unsafe sensitive action may be BLOCKed",
      "ALLOW only when the supplied evidence supports the action under the policy",
    ],
  },
];
