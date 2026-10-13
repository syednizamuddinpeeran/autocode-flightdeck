import { useEffect, useState } from "react";

interface Run {
  repo_id: string;
  repo_name: string;
  issue: number;
  status: string;
  artifacts: string[];
  source: string;
}

interface RunDetail extends Run {
  plan_tasks: number;
  review_verdict: string | null;
  blocking: number;
  nit: number;
  verify_result: string | null;
}

const ERROR = "Could not load runs.";

export default function Runs() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [repo, setRepo] = useState("");
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/runs")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: { runs?: Run[] }) => {
        if (active) setRuns(data.runs ?? []);
      })
      .catch(() => {
        if (active) setError(ERROR);
      });
    return () => {
      active = false;
    };
  }, []);

  async function open(run: Run) {
    setError(null);
    try {
      const res = await fetch(
        `/api/repos/${encodeURIComponent(run.repo_id)}/runs/${run.issue}`,
      );
      if (!res.ok) throw new Error();
      setDetail((await res.json()) as RunDetail);
    } catch {
      setError(ERROR);
    }
  }

  const repos = [...new Map(runs.map((r) => [r.repo_id, r.repo_name]))];
  const shown = repo ? runs.filter((r) => r.repo_id === repo) : runs;

  return (
    <section>
      <h2>Runs</h2>
      <label>
        Repo
        <select value={repo} onChange={(e) => setRepo(e.target.value)}>
          <option value="">All repos</option>
          {repos.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <ul aria-label="Runs">
        {shown.map((r) => (
          <li key={`${r.repo_id}#${r.issue}`}>
            <span>{r.repo_name}</span>{" "}
            <button type="button" onClick={() => open(r)}>
              Issue {r.issue}
            </button>{" "}
            <span data-testid="status">{r.status}</span>
          </li>
        ))}
      </ul>
      {detail && (
        <article aria-label="Run detail">
          <h3>
            {detail.repo_name} issue {detail.issue}
          </h3>
          <dl>
            <dt>Status</dt>
            <dd>{detail.status}</dd>
            <dt>Plan tasks</dt>
            <dd>{detail.plan_tasks}</dd>
            <dt>Review verdict</dt>
            <dd>{detail.review_verdict ?? "none"}</dd>
            <dt>BLOCKING</dt>
            <dd>{detail.blocking}</dd>
            <dt>NIT</dt>
            <dd>{detail.nit}</dd>
            <dt>Last verify</dt>
            <dd>{detail.verify_result ?? "none"}</dd>
            <dt>Artifacts</dt>
            <dd>{detail.artifacts.join(", ")}</dd>
            <dt>Source</dt>
            <dd>{detail.source}</dd>
          </dl>
        </article>
      )}
    </section>
  );
}
