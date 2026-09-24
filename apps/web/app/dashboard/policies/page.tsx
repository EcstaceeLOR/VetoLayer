import { PolicyStudio } from "../../../components/policy-studio";
import { policyStudioStarters } from "../../../lib/policy-studio";

export default function PoliciesPage() {
  return (
    <>
      <header className="dashboardHeader compactHeader policyPageHeader">
        <div>
          <p className="eyebrow">POLICY STUDIO</p>
          <h1 className="dashboardTitle">Rules where certainty is possible. Reasoning where it isn&apos;t.</h1>
          <p className="dashboardIntro">Author hard policy deterministically, reserve SERV for contextual judgment, and test the exact same policy contract before activating it.</p>
        </div>
      </header>
      <PolicyStudio initialPolicies={policyStudioStarters} />
    </>
  );
}
