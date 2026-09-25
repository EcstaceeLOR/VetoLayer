"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/internal/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errorName: error.name, message: error.message, digest: error.digest, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 720, margin: "10vh auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <p style={{ letterSpacing: ".08em", fontSize: 12 }}>VETOLAYER · RECOVERY</p>
          <h1>VetoLayer could not render this page.</h1>
          <p>No action was approved because of this error. Retry the request or return to the home page.</p>
          <p><button type="button" onClick={reset}>Try again</button> <a href="/">Return home</a></p>
          <code>Reference: {error.digest || "global-runtime"}</code>
        </main>
      </body>
    </html>
  );
}
