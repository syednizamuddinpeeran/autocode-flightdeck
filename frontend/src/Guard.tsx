import { useEffect, useState } from "react";
import {
  Badge,
  Card,
  EmptyState,
  ErrorMessage,
  Loading,
  PageHeader,
  TableWrap,
} from "./ui";

interface SessionRef {
  repo_id: string;
  session_id: string;
}

interface Reason {
  reason: string;
  count: number;
  sessions: SessionRef[];
}

interface Summary {
  allow: number;
  deny: number;
  total: number;
  reasons: Reason[];
  skipped_lines: number;
}

export function sessionHref(s: SessionRef): string {
  return `#/sessions/${encodeURIComponent(s.repo_id)}/${encodeURIComponent(s.session_id)}`;
}

export default function Guard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/guard/summary")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: Summary) => {
        if (!Array.isArray(data.reasons)) throw new Error();
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setError("Could not load guard decisions.");
      });
    return () => {
      active = false;
    };
  }, []);

  let body;
  if (error) {
    body = <ErrorMessage>{error}</ErrorMessage>;
  } else if (!summary) {
    body = <Loading />;
  } else if (summary.total === 0) {
    body = <EmptyState>No guard decisions logged yet.</EmptyState>;
  } else {
    body = (
      <>
        <Card>
          <p className="summary">
            <Badge tone="success">Allowed</Badge>{" "}
            <strong data-testid="allow">{summary.allow}</strong>{" "}
            <Badge tone="danger">Denied</Badge>{" "}
            <strong data-testid="deny">{summary.deny}</strong>{" "}
            <Badge>Total</Badge>{" "}
            <strong data-testid="total">{summary.total}</strong>
          </p>
          <TableWrap label="Denial reasons">
            <table>
              <thead>
                <tr>
                  <th>Denial reason</th>
                  <th>Count</th>
                  <th>Sessions</th>
                </tr>
              </thead>
              <tbody>
                {summary.reasons.map((r) => (
                  <tr key={r.reason}>
                    <td>{r.reason}</td>
                    <td>{r.count}</td>
                    <td className="session-links">
                      {r.sessions.map((s) => (
                        <a
                          key={`${s.repo_id}/${s.session_id}`}
                          href={sessionHref(s)}
                        >
                          {s.session_id}
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </>
    );
  }

  return (
    <section>
      <PageHeader title="Guard" />
      {body}
    </section>
  );
}
