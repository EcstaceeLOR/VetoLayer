import { DecisionHealthOverviewPanel } from "../../components/decision-health-overview";

export default function DashboardPage() {
  return (
    <>
      <header className="dashboardHeader healthDashboardHeader">
        <div>
          <p className="eyebrow">DECISION HEALTH</p>
          <h1 className="dashboardTitle">Know where autonomy is safe — and where policy is pushing back.</h1>
          <p className="dashboardIntro">Operational health derived from Decision Receipts and the Human Review queue: outcomes, policy friction, evidence completeness, integration load, and how often SERV contextual judgment is actually required.</p>
        </div>
        <div className="liveBadge"><span className="pulse" /> Receipt-backed metrics</div>
      </header>
      <DecisionHealthOverviewPanel />
    </>
  );
}
