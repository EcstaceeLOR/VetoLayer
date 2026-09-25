"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Project, ProjectEnvironment, Workspace, WorkspaceRole } from "../lib/workspace-model";
import { productBreadcrumbs } from "../lib/product-navigation";

type WorkspaceOption = { workspace: Workspace; role: WorkspaceRole };

export function WorkspaceProjectContext({
  workspace,
  project,
  environment,
  role,
  workspaces,
  projects,
  environments,
}: {
  workspace: Workspace;
  project: Project;
  environment: ProjectEnvironment;
  role: WorkspaceRole;
  workspaces: WorkspaceOption[];
  projects: Project[];
  environments: ProjectEnvironment[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspaceOptions = useMemo(() => workspaces.filter((entry) => entry.workspace.status === "active"), [workspaces]);

  async function switchContext(next: { workspaceId?: string; projectId?: string; environmentId?: string }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workspaces/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: next.workspaceId ?? workspace.id,
          projectId: next.projectId ?? (next.workspaceId && next.workspaceId !== workspace.id ? "" : project.id),
          environmentId: next.environmentId ?? (next.projectId && next.projectId !== project.id ? "" : environment.id),
        }),
      });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        setError(result.error?.message ?? "Context could not be changed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Context could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shellContextCard vlCard">
      <div className="shellContextHeading"><span>Product context</span><b>{role}</b></div>
      <label className="shellContextSelect">
        <span>Workspace</span>
        <select value={workspace.id} disabled={busy} onChange={(event) => void switchContext({ workspaceId: event.target.value })}>
          {workspaceOptions.map((entry) => <option key={entry.workspace.id} value={entry.workspace.id}>{entry.workspace.name}</option>)}
        </select>
      </label>
      <label className="shellContextSelect">
        <span>Project</span>
        <select value={project.id} disabled={busy} onChange={(event) => void switchContext({ projectId: event.target.value })}>
          {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="shellContextSelect">
        <span>Environment</span>
        <select value={environment.id} disabled={busy} onChange={(event) => void switchContext({ environmentId: event.target.value })}>
          {environments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {error ? <small className="shellContextError" role="alert">{error}</small> : null}
    </div>
  );
}

export function ProductBreadcrumbs({ workspace, project, environment }: { workspace: string; project: string; environment: string }) {
  const pathname = usePathname();
  const crumbs = productBreadcrumbs(pathname);
  return (
    <nav className="shellBreadcrumbs" aria-label="Breadcrumb">
      <span>{workspace}</span><span><i aria-hidden="true">/</i><strong>{project}</strong></span><span><i aria-hidden="true">/</i><strong>{environment}</strong></span>
      {crumbs.map((crumb) => <span key={crumb}><i aria-hidden="true">/</i><strong>{crumb}</strong></span>)}
    </nav>
  );
}
