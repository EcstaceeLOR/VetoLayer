import { NextResponse } from "next/server";
import { getAuthenticatedWorkspace, type WorkspaceContext } from "./workspace";

export async function requireApiWorkspace(): Promise<
  | { ok: true; workspace: WorkspaceContext }
  | { ok: false; response: NextResponse }
> {
  const workspace = await getAuthenticatedWorkspace();
  if (workspace) return { ok: true, workspace };

  return {
    ok: false,
    response: NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in to access this VetoLayer workspace." } },
      { status: 401 },
    ),
  };
}
