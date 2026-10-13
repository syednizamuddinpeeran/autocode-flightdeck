import { useEffect, useState } from "react";

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
    body = <p role="alert">{error}</p>;
  } else if (!summary) {
    body = <p>Loading...</p>;
  } else if (summary.total === 0) {
    body = <p>No guard decisions logged yet.</p>;
  } else {
    body = (
      <>
        <p>
          Allowed: <strong data-testid="allow">{summary.allow}</strong> Denied:{" "}
          <strong data-testid="deny">{summary.deny}</strong> Total:{" "}
          <strong data-testid="total">{summary.total}</strong>
        </p>
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
                <td>
                  {r.sessions.map((s) => (
                    <a
                      key={`${s.repo_id}/${s.session_id}`}
                      href={sessionHref(s)}
                      style={{ marginRight: "0.5em" }}
                    >
                      {s.session_id}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <section>
      <h2>Guard</h2>
      {body}
    </section>
  );
}
