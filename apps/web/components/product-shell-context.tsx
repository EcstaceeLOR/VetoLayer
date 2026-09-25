"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { productBreadcrumbs } from "../lib/product-navigation";

type BrowserProject = {
  project?: string;
};

export function WorkspaceProjectContext({ workspace }: { workspace: string }) {
  const [project, setProject] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vetolayer:first-project");
      if (!raw) return;
      const parsed = JSON.parse(raw) as BrowserProject;
      const value = parsed.project?.trim();
      if (value) setProject(value);
    } catch {
      setProject(null);
    }
  }, []);

  return (
    <div className="shellContextCard vlCard">
      <div className="shellContextLabel">Workspace</div>
      <strong title={workspace}>{workspace}</strong>
      <div className="shellContextRule" />
      <div className="shellContextMeta">
        <span>Project</span>
        {project ? <b title={project}>{project}</b> : <Link href="/onboarding">Select project</Link>}
      </div>
      <div className="shellContextMeta">
        <span>Environment</span>
        <b className="shellContextUnset">Not configured</b>
      </div>
    </div>
  );
}

export function ProductBreadcrumbs({ workspace }: { workspace: string }) {
  const pathname = usePathname();
  const crumbs = productBreadcrumbs(pathname);
  return (
    <nav className="shellBreadcrumbs" aria-label="Breadcrumb">
      <span>{workspace}</span>
      {crumbs.map((crumb) => <span key={crumb}><i aria-hidden="true">/</i><strong>{crumb}</strong></span>)}
    </nav>
  );
}
