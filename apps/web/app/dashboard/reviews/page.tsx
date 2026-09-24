import { Suspense } from "react";
import { ReviewInbox } from "../../../components/review-inbox";

export default function ReviewsPage() {
  return (
    <>
      <header className="dashboardHeader compactHeader reviewPageHeader">
        <div>
          <p className="eyebrow">HUMAN REVIEW</p>
          <h1 className="dashboardTitle">Escalation is a feature, not a failure.</h1>
          <p className="dashboardIntro">Inspect every unresolved policy finding and piece of evidence, record human judgment, then let the same VetoLayer pipeline decide again.</p>
        </div>
      </header>
      <Suspense fallback={<div className="reviewLoading"><span className="pulse" /> Loading review queue…</div>}>
        <ReviewInbox />
      </Suspense>
    </>
  );
}
