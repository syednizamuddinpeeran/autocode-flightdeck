import { useEffect, useState } from "react";
import type { FormEvent } from "react";

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

  return (
    <section>
      <h2>Settings</h2>
      <form onSubmit={onAdd}>
        <label>
          Folder path
          <input value={path} onChange={(e) => setPath(e.target.value)} />
        </label>
        <button type="submit">Add</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul>
        {folders.map((f) => (
          <li key={f.id}>
            <span>{f.path}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
