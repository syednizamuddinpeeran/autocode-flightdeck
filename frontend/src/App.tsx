import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import Guard from "./Guard";
import Harness from "./Harness";
import HarnessTemplate from "./HarnessTemplate";
import Install from "./Install";
import Runs from "./Runs";
import Sessions from "./Sessions";
import Settings from "./Settings";
import SessionTimelineSection from "./SessionTimeline";
import Suggestions from "./Suggestions";
import Trends from "./Trends";
import { PAGES, hrefFor, parseRoute } from "./routes";
import type { PageId } from "./routes";
import "./App.css";

function Page({ id }: { id: PageId }) {
  switch (id) {
    case "sessions":
      return (
        <>
          <Sessions />
          <SessionTimelineSection />
        </>
      );
    case "guard":
      return <Guard />;
    case "runs":
      return <Runs />;
    case "harness":
      return (
        <>
          <Harness />
          <HarnessTemplate />
        </>
      );
    case "trends":
      return (
        <>
          <Trends />
          <Suggestions />
        </>
      );
    case "install":
      return <Install />;
    case "settings":
      return <Settings />;
  }
}

export default function App() {
  const [page, setPage] = useState<PageId>(() =>
    parseRoute(window.location.hash),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const onHash = () => {
      setPage(parseRoute(window.location.hash));
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // The skip link must not touch the hash: that would change the page.
  function skipToContent(e: MouseEvent) {
    e.preventDefault();
    main.current?.focus();
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content" onClick={skipToContent}>
        Skip to content
      </a>
      <header className="shell-header">
        <h1>Flight deck</h1>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu
        </button>
      </header>
      <nav
        id="main-nav"
        className="shell-nav"
        aria-label="Main"
        data-open={menuOpen}
      >
        <ul>
          {PAGES.map((p) => (
            <li key={p.id}>
              <a
                href={hrefFor(p.id)}
                aria-current={p.id === page ? "page" : undefined}
              >
                {p.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main-content" className="shell-main" tabIndex={-1} ref={main}>
        <Page id={page} />
      </main>
    </div>
  );
}
