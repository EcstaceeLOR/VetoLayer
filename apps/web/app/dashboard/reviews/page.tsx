import Link from "next/link";
import { Suspense } from "react";
import { ReviewInbox } from "../../../components/review-inbox";
import "./review-operations.css";

export default function ReviewsPage() {
  return (
    <>
      <header className="dashboardHeader compactHeader reviewPageHeader">
        <div>
          <p className="eyebrow">HUMAN REVIEW</p>
          <h1 className="dashboardTitle">Operational review for decisions that need a human.</h1>
          <p className="dashboardIntro">Assign ownership, investigate evidence, request what is missing, leave internal notes, and re-run the real VetoLayer orchestrator without bypassing deterministic policy.</p>
          <div className="emptyActions"><Link className="rowLink" href="/dashboard/docs/review-workflow">Review workflow guide →</Link><Link className="rowLink" href="/dashboard/docs/concepts">REVIEW semantics →</Link></div>
        </div>
      </header>
      <Suspense fallback={<div className="reviewLoading"><span className="pulse" /> Loading review queue…</div>}>
        <ReviewInbox />
      </Suspense>
    </>
  );
}
