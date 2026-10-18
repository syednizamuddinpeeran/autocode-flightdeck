import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Loading,
  PageHeader,
} from "./ui";
import type { BadgeTone } from "./ui";

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

const TONES: Record<Kind, BadgeTone> = {
  error: "danger",
  failed: "danger",
  denied: "warning",
  normal: "neutral",
};
const LABELS: Record<Kind, string> = {
  error: "ERROR",
  failed: "FAILED",
  denied: "DENIED",
  normal: "",
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

  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (events === null) return <Loading />;
  if (events.length === 0)
    return <EmptyState>This session has no events.</EmptyState>;

  return (
    <ol aria-label="Session timeline" className="timeline">
      {events.map((ev, i) => {
        const kind = kindOf(ev);
        return (
          <li key={i} data-kind={kind} className="timeline-item">
            <time>{ev.ts}</time> <strong>{ev.event}</strong>
            {kind !== "normal" && (
              <>
                {" "}
                <Badge tone={TONES[kind]}>{`[${LABELS[kind]}]`}</Badge>
              </>
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
      <PageHeader title="Session timeline" />
      <Card>
        <form onSubmit={onSubmit} className="toolbar">
          <Field label="Session (repo/id)">
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary">
            Open
          </Button>
        </form>
        {sel && <SessionTimeline repo={sel.repo} id={sel.id} />}
      </Card>
    </section>
  );
}
