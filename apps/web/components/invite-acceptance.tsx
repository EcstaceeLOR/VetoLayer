"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Notice } from "./ui/primitives";

type InviteResult = {
  accepted?: boolean;
  workspace?: { name: string };
  role?: string;
  error?: { code?: string; message?: string };
};

export function InviteAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function accept() {
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, { method: "POST" });
      const result = await response.json() as InviteResult;
      if (!response.ok || !result.accepted) {
        setState("error");
        setMessage(result.error?.message ?? "This invitation could not be accepted.");
        return;
      }
      setState("success");
      setMessage(`You joined ${result.workspace?.name ?? "the workspace"} as ${result.role ?? "a member"}.`);
      router.refresh();
      setTimeout(() => router.push("/dashboard"), 500);
    } catch {
      setState("error");
      setMessage("The invitation service is temporarily unavailable.");
    }
  }

  return (
    <Card raised className="inviteCard">
      <p className="vlEyebrow">Workspace invitation</p>
      <h1>Join this VetoLayer workspace</h1>
      <p className="muted">VetoLayer will verify that you are signed in with the email address that received this invitation before granting access.</p>
      {message ? <Notice tone={state === "success" ? "success" : "danger"} title={state === "success" ? "Invitation accepted" : "Could not join"}>{message}</Notice> : null}
      <Button tone="primary" size="lg" onClick={accept} disabled={state === "loading" || state === "success"}>{state === "loading" ? "Joining…" : state === "success" ? "Opening workspace…" : "Accept invitation"}</Button>
    </Card>
  );
}
