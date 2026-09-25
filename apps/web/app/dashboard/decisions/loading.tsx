import "./decision-explorer.css";

export default function DecisionsLoading() {
  return <div><p className="eyebrow">DECISION EXPLORER</p><h1 className="dashboardTitle">Loading receipt history…</h1><div className="receiptLoadingGrid" aria-label="Loading Decision Explorer"><div className="receiptLoadingBar" /><div className="receiptLoadingBar" /><div className="receiptLoadingBar" /><div className="receiptLoadingBar" /></div></div>;
}
