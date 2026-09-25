"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { productCommands } from "../lib/product-navigation";
import { SearchIcon } from "./ui/icons";

export function ProductCommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return productCommands;
    return productCommands.filter((item) =>
      `${item.label} ${item.description} ${item.section}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <button className="shellCommandTrigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SearchIcon size={15} />
        <span>Search or jump to…</span>
        <kbd>⌘K</kbd>
      </button>

      {open ? (
        <div className="commandBackdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="commandDialog vlCard vlCardRaised" role="dialog" aria-modal="true" aria-label="Search VetoLayer">
            <div className="commandSearchRow">
              <SearchIcon size={18} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search decisions, policies, reviews, integrations…"
                aria-label="Search product navigation"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="commandResults" role="listbox" aria-label="Navigation results">
              {results.length ? results.map((item) => (
                <button key={`${item.section}-${item.href}`} type="button" onClick={() => navigate(item.href)} role="option" aria-selected="false">
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <em>{item.section}</em>
                </button>
              )) : (
                <div className="commandEmpty">No matching destination.</div>
              )}
            </div>
            <footer className="commandFooter"><span>↑↓ browse</span><span>Enter open</span><span>Esc close</span></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
