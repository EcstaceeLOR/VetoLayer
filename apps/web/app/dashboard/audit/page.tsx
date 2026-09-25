import { AuditLog } from "../../../components/audit-log";
import "./audit.css";

export default function AuditPage() {
  return (
    <>
      <header className="dashboardHeader compactHeader auditHeader">
        <div>
          <p className="eyebrow">ACTIVITY & SECURITY AUDIT</p>
          <h1 className="dashboardTitle">Reconstruct administrative and governance changes after the fact.</h1>
          <p className="dashboardIntro">This log is separate from Decision Receipts. It records who changed workspace configuration, credentials, integrations, policies, review workflow, and notification settings, with request correlation and redacted metadata.</p>
        </div>
      </header>
      <AuditLog />
    </>
  );
}
