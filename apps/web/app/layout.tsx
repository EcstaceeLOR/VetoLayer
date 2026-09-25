import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./brand.css";
import "./product-shell.css";
import "./policy-studio.css";
import "./human-review.css";
import "./review-demo.css";
import "./accessibility.css";
import "./design-system.css";
import "./design-system-compat.css";
import "./product-journey.css";
import "./product-shell-interactions.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vetolayer.vercel.app"),
  applicationName: "VetoLayer",
  title: {
    default: "VetoLayer — Reason before action",
    template: "%s · VetoLayer",
  },
  description: "The reasoning and approval layer between autonomous AI agents and high-impact actions.",
  openGraph: {
    type: "website",
    siteName: "VetoLayer",
    title: "VetoLayer — Reason before action",
    description: "Deterministic policy, SERV contextual judgment, and auditable Decision Receipts before autonomous agents execute high-impact actions.",
  },
  twitter: {
    card: "summary_large_image",
    title: "VetoLayer — Reason before action",
    description: "Reason before the action is real.",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07090d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skipLink" href="#main-content">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
