"use client";

import { useEffect, useMemo, useState } from "react";

type SavedView = { id: string; name: string; href: string };

export function SavedDecisionViews({ workspaceId, currentHref }: { workspaceId: string; currentHref: string }) {
  const storageKey = useMemo(() => `vetolayer:decision-views:${workspaceId}`, [workspaceId]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setViews(parsed.filter((item): item is SavedView => Boolean(item && typeof item === "object" && typeof (item as SavedView).id === "string" && typeof (item as SavedView).name === "string" && typeof (item as SavedView).href === "string")));
      }
    } catch {
      setViews([]);
    }
  }, [storageKey]);

  function persist(next: SavedView[]) {
    setViews(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function save() {
    const label = name.trim().slice(0, 80);
    if (!label) return;
    const next = [{ id: `view_${Date.now()}`, name: label, href: currentHref }, ...views.filter((view) => view.href !== currentHref)].slice(0, 12);
    persist(next);
    setName("");
  }

  return (
    <section className="savedDecisionViews" aria-label="Saved decision views">
      <div className="savedViewComposer">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name this investigation view" maxLength={80} />
        <button type="button" onClick={save} disabled={!name.trim()}>Save current view</button>
      </div>
      {views.length ? (
        <div className="savedViewList">
          {views.map((view) => (
            <span key={view.id} className="savedViewChip">
              <a href={view.href}>{view.name}</a>
              <button type="button" aria-label={`Delete ${view.name}`} onClick={() => persist(views.filter((item) => item.id !== view.id))}>×</button>
            </span>
          ))}
        </div>
      ) : <small className="savedViewHint">Saved views stay in this browser and preserve the full query state.</small>}
    </section>
  );
}
