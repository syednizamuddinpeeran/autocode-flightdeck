import { useEffect, useState } from "react";

interface Suggestion {
  type: string;
  repo_id: string;
  title: string;
  config_file: string;
  evidence: {
    count?: number;
    sessions?: { repo_id: string; session_id: string }[];
    runs?: { repo_id: string; issue: number }[];
  };
}

const ERROR = "Could not load suggestions.";

export default function Suggestions() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/suggestions")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: { suggestions?: Suggestion[] }) => {
        if (active) setItems(data.suggestions ?? []);
      })
      .catch(() => {
        if (active) setError(ERROR);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <h2>Suggestions</h2>
      <p>Proposed changes for a human to review. Nothing is applied here.</p>
      {error && <p role="alert">{error}</p>}
      {items && items.length === 0 && <p>No suggestions right now.</p>}
      <ul aria-label="Suggestions">
        {(items ?? []).map((s, i) => (
          <li key={`${s.repo_id}:${s.type}:${i}`}>
            <strong>{s.title}</strong>
            <dl>
              <dt>Repo</dt>
              <dd>{s.repo_id}</dd>
              <dt>Config file</dt>
              <dd>
                <code>{s.config_file}</code>
              </dd>
              <dt>Evidence</dt>
              <dd>
                {s.evidence.count ?? 0} occurrence(s){" "}
                {(s.evidence.sessions ?? []).map((l) => (
                  <a
                    key={`${l.repo_id}/${l.session_id}`}
                    href={`#session=${l.repo_id}/${l.session_id}`}
                  >
                    {l.session_id}{" "}
                  </a>
                ))}
                {(s.evidence.runs ?? []).map((l) => (
                  <span key={`${l.repo_id}#${l.issue}`}>
                    {l.repo_id} issue {l.issue}{" "}
                  </span>
                ))}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
