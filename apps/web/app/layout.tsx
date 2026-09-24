import type { Metadata } from "next";
import "./globals.css";
import "./product-shell.css";
import "./policy-studio.css";
import "./human-review.css";
import "./review-demo.css";
import "./accessibility.css";

export const metadata: Metadata = {
  title: "VetoLayer — Reason before action",
  description: "The reasoning and approval layer for autonomous AI actions.",
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
