import type { Metadata } from "next";
import "./globals.css";

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
