"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from "react";
import { productCommands } from "../lib/product-navigation";
import { SearchIcon } from "./ui/icons";

export function ProductCommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

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

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(results.length - 1, 0)));
  }, [results.length]);

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    router.push(href);
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex];
      if (target) navigate(target.href);
    }
  }

  return (
    <>
      <button className="shellCommandTrigger" type="button" onClick={() => { setOpen(true); setActiveIndex(0); }} aria-haspopup="dialog">
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
                onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                onKeyDown={onSearchKeyDown}
                placeholder="Search decisions, policies, reviews, integrations…"
                aria-label="Search product navigation"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="commandResults" aria-label="Navigation results">
              {results.length ? results.map((item, index) => (
                <button
                  key={`${item.section}-${item.href}`}
                  type="button"
                  onClick={() => navigate(item.href)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={index === activeIndex ? "active" : undefined}
                >
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
