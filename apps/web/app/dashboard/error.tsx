"use client";

import { RuntimeError } from "../../components/runtime-error";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RuntimeError error={error} reset={reset} scope="dashboard" />;
}
