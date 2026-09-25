import Link from "next/link";
import "../decision-explorer.css";

export default function DecisionNotFound() {
  return <div className="dashboardEmptyState compactEmptyState receiptNotFound"><p className="eyebrow">RECEIPT NOT FOUND</p><h2>This Decision Receipt is not available in your workspace.</h2><p>The receipt may not exist, may belong to another workspace, or may have been referenced with an invalid ID. VetoLayer does not reveal cross-workspace receipt existence.</p><div className="emptyActions"><Link className="primaryLink" href="/dashboard/decisions">Return to Decision Explorer →</Link></div></div>;
}
