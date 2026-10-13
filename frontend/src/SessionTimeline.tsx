import { useEffect, useState } from "react";
import type { FormEvent } from "react";

export interface TimelineEvent {
  ts: string;
  event: string;
  summary: string;
  duration_ms: number | null;
  failed: boolean;
  denied: boolean;
}

interface Detail {
  events: TimelineEvent[];
}

type Kind = "error" | "failed" | "denied" | "normal";

function kindOf(ev: TimelineEvent): Kind {
  if (ev.event === "errorOccurred") return "error";
  if (ev.failed) return "failed";
  if (ev.denied) return "denied";
  return "normal";
}

const LABELS: Record<Kind, string> = {
  error: "ERROR",
  failed: "FAILED",
  denied: "DENIED",
  normal: "",
};
const COLORS: Record<Kind, string> = {
  error: "#b00020",
  failed: "#c75000",
  denied: "#6a1b9a",
  normal: "#888",
};

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

export function parseHash(hash: string): { repo: string; id: string } | null {
  const m = /^#session=([^/]+)\/(.+)$/.exec(hash);
  if (!m) return null;
  try {
    return { repo: decodeURIComponent(m[1]), id: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

export function SessionTimeline({ repo, id }: { repo: string; id: string }) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setEvents(null);
    setError(null);
    fetch(
      `/api/repos/${encodeURIComponent(repo)}/sessions/${encodeURIComponent(id)}`,
    )
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status))),
      )
      .then((data: Detail) => {
        if (active) setEvents(data.events);
      })
      .catch(() => {
        if (active) setError("Could not load this session.");
      });
    return () => {
      active = false;
    };
  }, [repo, id]);

  if (error) return <p role="alert">{error}</p>;
  if (events === null) return <p>Loading...</p>;
  if (events.length === 0) return <p>This session has no events.</p>;

  return (
    <ol aria-label="Session timeline" style={{ listStyle: "none", padding: 0 }}>
      {events.map((ev, i) => {
        const kind = kindOf(ev);
        return (
          <li
            key={i}
            data-kind={kind}
            style={{
              borderLeft: `4px solid ${COLORS[kind]}`,
              padding: "4px 8px",
              margin: "4px 0",
            }}
          >
            <time>{ev.ts}</time> <strong>{ev.event}</strong>
            {kind !== "normal" && (
              <span style={{ color: COLORS[kind], fontWeight: "bold" }}>
                {" "}
                [{LABELS[kind]}]
              </span>
            )}
            {ev.duration_ms !== null && ev.duration_ms !== undefined && (
              <span> ({formatDuration(ev.duration_ms)})</span>
            )}
            {ev.summary && <div>{ev.summary}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export default function SessionTimelineSection() {
  const [sel, setSel] = useState(() => parseHash(window.location.hash));
  const [text, setText] = useState("");

  useEffect(() => {
    const onHash = () => setSel(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (value) window.location.hash = `session=${value}`;
  }

  return (
    <section>
      <h2>Session timeline</h2>
      <form onSubmit={onSubmit}>
        <label>
          Session (repo/id){" "}
          <input value={text} onChange={(e) => setText(e.target.value)} />
        </label>{" "}
        <button type="submit">Open</button>
      </form>
      {sel && <SessionTimeline repo={sel.repo} id={sel.id} />}
    </section>
  );
}
