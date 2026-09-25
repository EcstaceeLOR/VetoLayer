import type { Project, ProjectEnvironment, Workspace, WorkspaceRole } from "./workspace-model";

export type OnboardingUseCase = "coding" | "support" | "finance";
export type OnboardingIntegrationChoice = "github" | "developer-api";

export type OnboardingState = {
  workspaceId?: string;
  projectId?: string;
  environmentId?: string;
  useCase?: OnboardingUseCase;
  integrationChoice?: OnboardingIntegrationChoice;
  policyIds?: string[];
  receiptId?: string;
  lastStep?: number;
  completedAt?: string;
  updatedAt: string;
};

export type OnboardingStepStatus = {
  id: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  key: "workspace" | "project" | "environment" | "integration" | "policy" | "serv" | "test" | "receipt";
  label: string;
  complete: boolean;
  detail: string;
};

export type OnboardingSnapshot = {
  persistence: "supabase" | "memory";
  durable: boolean;
  state: OnboardingState;
  workspaces: Array<{ workspace: Workspace; role: WorkspaceRole }>;
  selected?: {
    workspace: Workspace;
    project: Project;
    environment: ProjectEnvironment;
    role: WorkspaceRole;
    projects: Project[];
    environments: ProjectEnvironment[];
  };
  connections: Array<{
    integration: OnboardingIntegrationChoice;
    state: "ready" | "warning" | "needs-config";
    account?: string;
    lastCode?: string;
    updatedAt: string;
  }>;
  policies: Array<{ id: string; name: string; mode: "deterministic" | "contextual"; severity: string }>;
  serv: {
    configured: boolean;
    modelConfigured: boolean;
    message: string;
  };
  receipt?: {
    receiptId: string;
    decisionId: string;
    outcome: "ALLOW" | "REVIEW" | "BLOCK";
    summary: string;
    createdAt: string;
    href: string;
  };
  steps: OnboardingStepStatus[];
  resumeStep: number;
  complete: boolean;
};

export const onboardingUseCases: Array<{
  id: OnboardingUseCase;
  title: string;
  description: string;
  recommended?: boolean;
}> = [
  {
    id: "coding",
    title: "Coding & deployment agents",
    description: "Gate merges, production deploys, infrastructure changes, and security-sensitive actions.",
    recommended: true,
  },
  {
    id: "support",
    title: "Customer support agents",
    description: "Control refunds, credits, cancellations, escalations, and contextual policy exceptions.",
  },
  {
    id: "finance",
    title: "Finance & procurement agents",
    description: "Evaluate payments, invoices, vendors, approvals, and high-impact financial actions.",
  },
];

export const onboardingStepLabels = [
  "Workspace",
  "Project",
  "Environment",
  "Integration",
  "Policy",
  "SERV",
  "Test action",
  "Receipt",
] as const;
