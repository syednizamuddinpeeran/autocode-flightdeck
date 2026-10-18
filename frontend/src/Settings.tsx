import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Appearance from "./Appearance";
import { Button, Card, ErrorMessage, Field, PageHeader } from "./ui";
import "./Forms.css";

interface Folder {
  id: string;
  path: string;
}

const GENERIC_ERROR = "Could not reach the server.";

async function readDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // fall through to generic message
  }
  return `Request failed (${res.status}).`;
}

export default function Settings() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/folders")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: Folder[]) => {
        if (active) setFolders(data);
      })
      .catch(() => {
        if (active) setError(GENERIC_ERROR);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        setError(await readDetail(res));
        return;
      }
      const created = (await res.json()) as Folder;
      setFolders((prev) => [...prev, created]);
      setPath("");
    } catch {
      setError(GENERIC_ERROR);
    }
  }

  async function onRemove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/folders/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(await readDetail(res));
        return;
      }
      setFolders((prev) => prev.filter((f) => f.id !== id));
    } catch {
      setError(GENERIC_ERROR);
    }
  }

  return (
    <section id="settings">
      <PageHeader title="Settings" />
      <Appearance />
      <Card>
        <h3>Watched folders</h3>
        <form onSubmit={onAdd}>
          <Field label="Folder path">
            <input value={path} onChange={(e) => setPath(e.target.value)} />
          </Field>
          <div className="form-actions">
            <Button type="submit" variant="primary">
              Add
            </Button>
          </div>
        </form>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <ul className="folder-list">
          {folders.map((f) => (
            <li key={f.id}>
              <span>{f.path}</span>
              <Button variant="danger" onClick={() => onRemove(f.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
