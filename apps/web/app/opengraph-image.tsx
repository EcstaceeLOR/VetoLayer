import { ImageResponse } from "next/og";
import { VetoLayerMark } from "../components/vetolayer-logo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#080a0f",
          color: "#f4f7fb",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <VetoLayerMark size={72} color="#f4f7fb" accent="#d8ff61" />
          <div style={{ display: "flex", fontSize: 52, fontWeight: 800, letterSpacing: "-2px" }}>
            <span>Veto</span><span style={{ color: "#d8ff61" }}>Layer</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 930 }}>
          <div style={{ color: "#d8ff61", fontSize: 22, fontWeight: 700, letterSpacing: "3px" }}>
            AI ACTION CONTROL LAYER
          </div>
          <div style={{ fontSize: 74, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-4px" }}>
            Reason before the action is real.
          </div>
          <div style={{ color: "#aab3c2", fontSize: 28, lineHeight: 1.35 }}>
            Deterministic policy, SERV contextual judgment, and auditable Decision Receipts before autonomous agents execute high-impact actions.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 20, fontWeight: 700 }}>
          <span style={{ border: "1px solid #385641", color: "#adffb4", borderRadius: 999, padding: "10px 16px" }}>ALLOW</span>
          <span style={{ border: "1px solid #5a4b2f", color: "#ffd782", borderRadius: 999, padding: "10px 16px" }}>REVIEW</span>
          <span style={{ border: "1px solid #5f3535", color: "#ff9b9b", borderRadius: 999, padding: "10px 16px" }}>BLOCK</span>
        </div>
      </div>
    ),
    size,
  );
}
