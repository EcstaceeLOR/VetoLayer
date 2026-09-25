# VetoLayer product shell

The public product journey is intentionally separate from the decision engine:

1. `/` explains the problem, product thesis, SERV role, and market wedge.
2. `/onboarding` creates a lightweight first workspace/project/use-case selection.
3. `/dashboard` is the operational control center.
4. Stable product navigation exposes Decisions, Policies, Reviews, and Integrations.
5. The authenticated REVIEW → evidence → re-evaluation workflow is the flagship high-risk deployment scenario.

## Boundaries

The onboarding flow currently stores the first-project selection in browser storage only. It does not pretend to provide authentication or durable multi-user ownership; those belong to the dedicated persistence/auth issue.

The Reviews and Integrations routes establish complete navigation and useful read-only product surfaces. Their operational actions are implemented by the dedicated Human Review and Integration/API issues.

The web layer never recomputes VetoLayer outcomes. It renders data produced by the core policy engine, SERV contextual adapter, orchestrator, and Decision Receipt contracts.
