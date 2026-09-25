"use client";

import Link from "next/link";
import { useEffect } from "react";

type RuntimeErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  scope?: "product" | "dashboard";
};

export function RuntimeError({ error, reset, scope = "product" }: RuntimeErrorProps) {
  const reference = error.digest || "client-runtime";

  useEffect(() => {
    void fetch("/api/internal/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        errorName: error.name,
        message: error.message,
        digest: error.digest,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="runtimeErrorShell" id="main-content">
      <section className="runtimeErrorCard" role="alert">
        <p className="eyebrow">RECOVERABLE ERROR</p>
        <h1>{scope === "dashboard" ? "This dashboard view could not load." : "VetoLayer hit an unexpected error."}</h1>
        <p>Your action was not silently approved. Retry the view, return to a known-safe page, or share the reference below when reporting the incident.</p>
        <div className="runtimeErrorActions">
          <button type="button" className="primaryLink" onClick={reset}>Try again</button>
          <Link className="rowLink" href={scope === "dashboard" ? "/dashboard" : "/"}>Return to {scope === "dashboard" ? "overview" : "home"}</Link>
        </div>
        <code className="runtimeErrorReference">Reference: {reference}</code>
      </section>
    </main>
  );
}
