export type FirstRunGuideInput = {
  policyCount: number;
  integrationReady: boolean;
  decisionCount: number;
};

export type FirstRunStep = {
  id: "policy" | "integration" | "decision";
  title: string;
  description: string;
  href: string;
  cta: string;
  complete: boolean;
};

export type FirstRunGuide = {
  complete: boolean;
  completedCount: number;
  steps: FirstRunStep[];
};

export function buildFirstRunGuide(input: FirstRunGuideInput): FirstRunGuide {
  const steps: FirstRunStep[] = [
    {
      id: "policy",
      title: "Create your first policy",
      description: "Define what must stay deterministic and what should be escalated to SERV contextual judgment.",
      href: "/dashboard/policies",
      cta: "Open Policy Studio",
      complete: input.policyCount > 0,
    },
    {
      id: "integration",
      title: "Connect an execution path",
      description: "Put VetoLayer in front of GitHub or your agent through the Developer API before the tool executes.",
      href: "/dashboard/integrations",
      cta: "Connect an integration",
      complete: input.integrationReady,
    },
    {
      id: "decision",
      title: "Evaluate a real action",
      description: "Create the first Decision Receipt and verify the exact reason an action was ALLOW, REVIEW, or BLOCK.",
      href: "/dashboard/decisions",
      cta: "Inspect decisions",
      complete: input.decisionCount > 0,
    },
  ];

  const completedCount = steps.filter((step) => step.complete).length;
  return {
    steps,
    completedCount,
    complete: completedCount === steps.length,
  };
}
