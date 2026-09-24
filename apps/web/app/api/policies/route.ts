import { PolicySchema } from "@vetolayer/core";
import { NextResponse } from "next/server";
import { policyStudioStarters } from "../../../lib/policy-studio";
import { requireApiWorkspace } from "../../../lib/server/api-auth";
import { getOptionalPolicyStore } from "../../../lib/server/policy-store";

export async function GET() {
  const auth = await requireApiWorkspace();
  if (!auth.ok) return auth.response;

  const store = getOptionalPolicyStore();
  if (!store) {
    return NextResponse.json({ policies: policyStudioStarters, persistence: "browser-fallback" });
  }

  try {
    const stored = await store.list(auth.workspace.workspaceId);
    return NextResponse.json({
      policies: stored.length ? stored.map((row) => row.policy) : policyStudioStarters,
      persistence: "supabase",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "POLICY_STORE_UNAVAILABLE", message: error instanceof Error ? error.message : "Policy storage is unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiWorkspace();
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON", message: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = PolicySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_POLICY", message: "Policy does not satisfy VetoLayer's policy contract.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const store = getOptionalPolicyStore();
  if (!store) {
    return NextResponse.json({ policy: parsed.data, persisted: false, persistence: "browser-fallback" });
  }

  try {
    await store.save({ workspaceId: auth.workspace.workspaceId, policy: parsed.data, updatedAt: new Date().toISOString() });
    return NextResponse.json({ policy: parsed.data, persisted: true, persistence: "supabase" });
  } catch (error) {
    return NextResponse.json(
      { error: "POLICY_STORE_UNAVAILABLE", message: error instanceof Error ? error.message : "Policy could not be saved." },
      { status: 503 },
    );
  }
}
