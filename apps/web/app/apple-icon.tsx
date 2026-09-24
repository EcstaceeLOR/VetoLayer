import { ImageResponse } from "next/og";
import { VetoLayerMark } from "../components/vetolayer-logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080a0f",
          borderRadius: 42,
        }}
      >
        <VetoLayerMark size={118} color="#f4f7fb" accent="#d8ff61" />
      </div>
    ),
    size,
  );
}
