"use client";

import "./decision-explorer.css";

export default function DecisionsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="dashboardEmptyState compactEmptyState decisionExplorerError"><p className="eyebrow">DECISION EXPLORER</p><h2>Decision history could not be loaded.</h2><p>The explorer failed safely and no receipt data was changed. Retry the query; if the problem persists, check the persistence migration and service health.</p><div className="emptyActions"><button type="button" className="primaryButton buttonReset" onClick={reset}>Retry</button></div></div>;
}
