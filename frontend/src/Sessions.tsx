import { useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  PageHeader,
  TableWrap,
} from "./ui";

interface Repo {
  id: string;
  path: string;
}

interface Session {
  repo_id: string;
  session_id: string;
  start: string | null;
  end: string | null;
  branch: string | null;
  surface: string | null;
  end_reason: string | null;
}

const GENERIC_ERROR = "Could not load sessions.";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export default function Sessions() {
  const [hasFolders, setHasFolders] = useState<boolean | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getJson<unknown[]>("/api/folders")
      .then(async (folders) => {
        if (!active) return;
        const any = Array.isArray(folders) && folders.length > 0;
        setHasFolders(any);
        if (!any) return;
        const data = await getJson<{ repos?: Repo[] }>("/api/repos");
        if (active) setRepos(data.repos ?? []);
      })
      .catch(() => {
        if (active) setError(GENERIC_ERROR);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasFolders) return;
    let active = true;
    const query = repo ? `?repo=${encodeURIComponent(repo)}` : "";
    getJson<{ sessions?: Session[]; skipped_lines?: number }>(
      `/api/sessions${query}`,
    )
      .then((data) => {
        if (!active) return;
        setError(null);
        setSessions(data.sessions ?? []);
        setSkipped(data.skipped_lines ?? 0);
      })
      .catch(() => {
        if (active) setError(GENERIC_ERROR);
      });
    return () => {
      active = false;
    };
  }, [hasFolders, repo]);

  const repoName = (id: string) => repos.find((r) => r.id === id)?.path ?? id;

  return (
    <section>
      <PageHeader title="Sessions" />
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {hasFolders === false && (
        <EmptyState>
          No watched folders yet. <a href="#settings">Add one in Settings</a>.
        </EmptyState>
      )}
      {hasFolders && (
        <Card>
          <div className="toolbar">
            <Field label="Repo">
              <select value={repo} onChange={(e) => setRepo(e.target.value)}>
                <option value="">All repos</option>
                {repos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.path}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {skipped > 0 && <p>{skipped} malformed log lines skipped.</p>}
          <TableWrap label="Sessions table">
            <table>
              <thead>
                <tr>
                  <th>Repo</th>
                  <th>Session</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Branch</th>
                  <th>Surface</th>
                  <th>End reason</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={`${s.repo_id}/${s.session_id}`}>
                    <td>{repoName(s.repo_id)}</td>
                    <td>{s.session_id}</td>
                    <td>{s.start ?? ""}</td>
                    <td>{s.end ?? "running"}</td>
                    <td>{s.branch ?? ""}</td>
                    <td>{s.surface ?? ""}</td>
                    <td>{s.end_reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </section>
  );
}
