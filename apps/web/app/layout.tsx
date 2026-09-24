import type { Metadata } from "next";
import "./globals.css";
import "./product-shell.css";
import "./policy-studio.css";
import "./human-review.css";

export const metadata: Metadata = {
  title: "VetoLayer — Reason before action",
  description: "The reasoning and approval layer for autonomous AI actions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
